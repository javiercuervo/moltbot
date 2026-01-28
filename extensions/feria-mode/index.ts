/**
 * Feria Mode Plugin
 *
 * Offline queue mode for Moltbot. When connectivity is lost:
 * 1. Incoming messages are queued in SQLite
 * 2. Connectivity is monitored periodically
 * 3. When connectivity is restored, queued messages are processed
 *
 * Note: This plugin queues messages but does NOT process them offline.
 * LLM processing requires cloud connectivity.
 */

import { Type } from "@sinclair/typebox";
import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

import { feriaModeConfigSchema, type FeriaModeConfig } from "./src/config.js";
import { MessageQueue, type QueuedMessage, type QueueStats } from "./src/queue.js";
import { ConnectivityMonitor, checkGatewayConnectivity } from "./src/connectivity.js";

const feriaModePlugin = {
  id: "feria-mode",
  name: "Feria Mode (Offline Queue)",
  description: "Queue incoming messages when offline, process when connectivity is restored",
  configSchema: feriaModeConfigSchema,

  register(api: MoltbotPluginApi) {
    const cfg = feriaModeConfigSchema.parse(api.pluginConfig);
    const resolvedDbPath = api.resolvePath(cfg.dbPath);

    // Initialize components
    const queue = new MessageQueue(resolvedDbPath);
    const connectivity = new ConnectivityMonitor({
      checkUrl: cfg.connectivityCheckUrl,
      intervalMs: cfg.connectivityCheckIntervalSec * 1000,
    });

    let isProcessing = false;

    api.logger.info(
      `feria-mode: plugin registered (db: ${resolvedDbPath}, check interval: ${cfg.connectivityCheckIntervalSec}s)`,
    );

    // ========================================================================
    // Connectivity Handling
    // ========================================================================

    connectivity.on("online", async () => {
      api.logger.info("feria-mode: connectivity restored");

      if (cfg.autoSync && !isProcessing) {
        await processQueue();
      }
    });

    connectivity.on("offline", () => {
      api.logger.warn("feria-mode: connectivity lost - messages will be queued");
    });

    // ========================================================================
    // Queue Processing
    // ========================================================================

    async function processQueue(): Promise<number> {
      if (isProcessing) return 0;
      isProcessing = true;

      let processed = 0;

      try {
        // Reset any stuck processing messages
        const reset = queue.resetProcessing();
        if (reset > 0) {
          api.logger.info(`feria-mode: reset ${reset} stuck messages`);
        }

        // Cleanup old messages
        const maxAgeMs = cfg.maxQueueAgeHours * 60 * 60 * 1000;
        const cleaned = queue.cleanup(maxAgeMs);
        if (cleaned > 0) {
          api.logger.info(`feria-mode: cleaned ${cleaned} old messages`);
        }

        // Process pending messages in batches
        while (true) {
          const pending = queue.getPending(cfg.syncBatchSize);
          if (pending.length === 0) break;

          for (const msg of pending) {
            queue.markProcessing(msg.id);

            try {
              // Re-inject the message into the gateway
              // This triggers normal message processing flow
              await api.injectMessage({
                channel: msg.channel,
                accountId: msg.accountId,
                senderId: msg.senderId,
                chatId: msg.chatId,
                body: msg.body,
                mediaPath: msg.mediaPath,
                metadata: {
                  ...msg.metadata,
                  feriaMode: {
                    queuedAt: msg.queuedAt,
                    processedAt: Date.now(),
                  },
                },
              });

              queue.markCompleted(msg.id);
              processed++;
            } catch (err) {
              api.logger.warn(`feria-mode: failed to process message ${msg.id}: ${String(err)}`);
              queue.markFailed(msg.id);
            }
          }

          // Check connectivity between batches
          if (!connectivity.isOnline()) {
            api.logger.info("feria-mode: connectivity lost during sync, pausing");
            break;
          }
        }

        if (processed > 0) {
          api.logger.info(`feria-mode: processed ${processed} queued messages`);
        }
      } finally {
        isProcessing = false;
      }

      return processed;
    }

    // ========================================================================
    // Message Interception
    // ========================================================================

    // Hook into message flow to queue when offline
    api.on("before_message_process", async (event) => {
      // Skip if online
      if (connectivity.isOnline()) {
        return; // Let message process normally
      }

      // Queue the message
      const queued = queue.enqueue({
        channel: event.channel,
        accountId: event.accountId ?? "default",
        senderId: event.senderId,
        chatId: event.chatId,
        body: event.body,
        mediaPath: event.mediaPath,
        metadata: event.metadata ?? {},
      });

      api.logger.info(
        `feria-mode: queued message ${queued.id} from ${event.senderId} (${event.channel})`,
      );

      // Enforce max queue size
      const dropped = queue.enforceMaxSize(cfg.maxQueueSize);
      if (dropped > 0) {
        api.logger.warn(`feria-mode: dropped ${dropped} oldest messages (queue full)`);
      }

      // Return signal to skip normal processing
      return { skipProcessing: true };
    });

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "feria_queue_status",
        label: "Feria Queue Status",
        description: "Check the status of the offline message queue",
        parameters: Type.Object({}),
        async execute() {
          const stats = queue.getStats();
          const online = connectivity.isOnline();

          const text = [
            `Connectivity: ${online ? "online" : "offline"}`,
            `Queue Stats:`,
            `  - Pending: ${stats.pending}`,
            `  - Processing: ${stats.processing}`,
            `  - Failed: ${stats.failed}`,
            `  - Completed: ${stats.completed}`,
            `  - Total: ${stats.total}`,
            stats.oldestQueuedAt
              ? `  - Oldest: ${new Date(stats.oldestQueuedAt).toISOString()}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");

          return {
            content: [{ type: "text", text }],
            details: { online, stats },
          };
        },
      },
      { name: "feria_queue_status" },
    );

    api.registerTool(
      {
        name: "feria_queue_sync",
        label: "Feria Queue Sync",
        description: "Manually trigger processing of queued messages",
        parameters: Type.Object({}),
        async execute() {
          if (!connectivity.isOnline()) {
            return {
              content: [{ type: "text", text: "Cannot sync: currently offline" }],
              details: { success: false, reason: "offline" },
            };
          }

          const processed = await processQueue();

          return {
            content: [{ type: "text", text: `Processed ${processed} queued messages` }],
            details: { success: true, processed },
          };
        },
      },
      { name: "feria_queue_sync" },
    );

    // ========================================================================
    // CLI Commands
    // ========================================================================

    api.registerCli(
      ({ program }) => {
        const feria = program
          .command("feria")
          .description("Feria mode (offline queue) commands");

        feria
          .command("status")
          .description("Show queue status")
          .action(() => {
            const stats = queue.getStats();
            const online = connectivity.isOnline();

            console.log(`Connectivity: ${online ? "online" : "offline"}`);
            console.log(`Pending: ${stats.pending}`);
            console.log(`Processing: ${stats.processing}`);
            console.log(`Failed: ${stats.failed}`);
            console.log(`Completed: ${stats.completed}`);
            console.log(`Total: ${stats.total}`);

            if (stats.oldestQueuedAt) {
              console.log(`Oldest: ${new Date(stats.oldestQueuedAt).toISOString()}`);
            }
          });

        feria
          .command("sync")
          .description("Process queued messages")
          .action(async () => {
            if (!connectivity.isOnline()) {
              console.log("Cannot sync: currently offline");
              return;
            }

            console.log("Processing queue...");
            const processed = await processQueue();
            console.log(`Processed ${processed} messages`);
          });

        feria
          .command("check")
          .description("Check connectivity")
          .action(async () => {
            const state = await connectivity.check();
            console.log(`Connectivity: ${state}`);

            const gateway = await checkGatewayConnectivity();
            console.log(`Gateway: ${gateway ? "reachable" : "unreachable"}`);
          });

        feria
          .command("cleanup")
          .description("Remove old completed/failed messages")
          .option("--hours <n>", "Max age in hours", "24")
          .action((opts) => {
            const maxAgeMs = parseInt(opts.hours) * 60 * 60 * 1000;
            const removed = queue.cleanup(maxAgeMs);
            console.log(`Removed ${removed} old messages`);
          });
      },
      { commands: ["feria"] },
    );

    // ========================================================================
    // Service Lifecycle
    // ========================================================================

    api.registerService({
      id: "feria-mode",
      start: () => {
        connectivity.start();
        api.logger.info(
          `feria-mode: service started (db: ${resolvedDbPath})`,
        );
      },
      stop: () => {
        connectivity.stop();
        queue.close();
        api.logger.info("feria-mode: service stopped");
      },
    });
  },
};

export default feriaModePlugin;
