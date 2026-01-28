/**
 * Feria Mode Configuration
 *
 * Configuration schema for the offline queue plugin.
 */

import { homedir } from "node:os";
import { join } from "node:path";

export type FeriaModeConfig = {
  /** Path to SQLite database file */
  dbPath: string;
  /** Interval in seconds to check connectivity */
  connectivityCheckIntervalSec: number;
  /** URL to ping for connectivity check (default: gateway endpoint) */
  connectivityCheckUrl?: string;
  /** Maximum number of messages to queue */
  maxQueueSize: number;
  /** Maximum age in hours for queued messages before discard */
  maxQueueAgeHours: number;
  /** Enable auto-sync when connectivity is restored */
  autoSync: boolean;
  /** Batch size for sync operations */
  syncBatchSize: number;
};

const DEFAULT_DB_PATH = join(homedir(), ".clawdbot", "feria-queue.db");

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) return;
  throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
}

const ALLOWED_KEYS = [
  "dbPath",
  "connectivityCheckIntervalSec",
  "connectivityCheckUrl",
  "maxQueueSize",
  "maxQueueAgeHours",
  "autoSync",
  "syncBatchSize",
];

export const feriaModeConfigSchema = {
  parse(value: unknown): FeriaModeConfig {
    const cfg = (value && typeof value === "object" && !Array.isArray(value))
      ? value as Record<string, unknown>
      : {};

    assertAllowedKeys(cfg, ALLOWED_KEYS, "feria-mode config");

    return {
      dbPath: typeof cfg.dbPath === "string" ? cfg.dbPath : DEFAULT_DB_PATH,
      connectivityCheckIntervalSec:
        typeof cfg.connectivityCheckIntervalSec === "number"
          ? cfg.connectivityCheckIntervalSec
          : 30,
      connectivityCheckUrl:
        typeof cfg.connectivityCheckUrl === "string"
          ? cfg.connectivityCheckUrl
          : undefined,
      maxQueueSize:
        typeof cfg.maxQueueSize === "number" ? cfg.maxQueueSize : 1000,
      maxQueueAgeHours:
        typeof cfg.maxQueueAgeHours === "number" ? cfg.maxQueueAgeHours : 24,
      autoSync: cfg.autoSync !== false,
      syncBatchSize:
        typeof cfg.syncBatchSize === "number" ? cfg.syncBatchSize : 10,
    };
  },

  uiHints: {
    dbPath: {
      label: "Queue Database Path",
      placeholder: "~/.clawdbot/feria-queue.db",
      help: "SQLite database file for message queue",
      advanced: true,
    },
    connectivityCheckIntervalSec: {
      label: "Connectivity Check Interval",
      placeholder: "30",
      help: "Seconds between connectivity checks",
    },
    maxQueueSize: {
      label: "Max Queue Size",
      placeholder: "1000",
      help: "Maximum messages to queue before dropping oldest",
    },
    maxQueueAgeHours: {
      label: "Max Queue Age (hours)",
      placeholder: "24",
      help: "Discard queued messages older than this",
    },
    autoSync: {
      label: "Auto-Sync",
      help: "Automatically process queue when connectivity is restored",
    },
    syncBatchSize: {
      label: "Sync Batch Size",
      placeholder: "10",
      help: "Messages to process per sync batch",
      advanced: true,
    },
  },
};
