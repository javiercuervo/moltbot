/**
 * Connectivity Monitor
 *
 * Monitors network connectivity and gateway availability.
 * Emits events when connectivity state changes.
 */

import { EventEmitter } from "node:events";

export type ConnectivityState = "online" | "offline" | "unknown";

export interface ConnectivityEvents {
  online: () => void;
  offline: () => void;
  change: (state: ConnectivityState) => void;
}

export class ConnectivityMonitor extends EventEmitter {
  private state: ConnectivityState = "unknown";
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly checkUrl: string;
  private readonly intervalMs: number;

  constructor(options: {
    checkUrl?: string;
    intervalMs?: number;
  } = {}) {
    super();
    // Default to checking DNS resolution as a connectivity proxy
    this.checkUrl = options.checkUrl ?? "https://dns.google/resolve?name=google.com";
    this.intervalMs = options.intervalMs ?? 30_000;
  }

  /**
   * Get current connectivity state
   */
  getState(): ConnectivityState {
    return this.state;
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.state === "online";
  }

  /**
   * Start monitoring connectivity
   */
  start(): void {
    if (this.checkInterval) return;

    // Initial check
    this.check();

    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.check();
    }, this.intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Force a connectivity check
   */
  async check(): Promise<ConnectivityState> {
    const previousState = this.state;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.checkUrl, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      this.state = response.ok ? "online" : "offline";
    } catch {
      this.state = "offline";
    }

    // Emit events on state change
    if (previousState !== this.state) {
      this.emit("change", this.state);
      this.emit(this.state);
    }

    return this.state;
  }

  /**
   * Wait for online connectivity
   */
  async waitForOnline(timeoutMs: number = 60_000): Promise<boolean> {
    if (this.state === "online") return true;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.removeListener("online", onOnline);
        resolve(false);
      }, timeoutMs);

      const onOnline = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      this.once("online", onOnline);
    });
  }
}

/**
 * Check if gateway is reachable
 */
export async function checkGatewayConnectivity(
  host: string = "127.0.0.1",
  port: number = 18789,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`http://${host}:${port}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
