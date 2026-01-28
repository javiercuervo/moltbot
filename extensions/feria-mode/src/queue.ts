/**
 * Feria Mode Queue
 *
 * SQLite-backed message queue for offline operation.
 * Uses WAL mode for durability and concurrent access.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type QueuedMessage = {
  id: string;
  channel: string;
  accountId: string;
  senderId: string;
  chatId: string;
  body: string;
  mediaPath?: string;
  metadata: Record<string, unknown>;
  queuedAt: number;
  attempts: number;
  lastAttemptAt?: number;
  status: "pending" | "processing" | "failed" | "completed";
};

export type QueueStats = {
  total: number;
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  oldestQueuedAt?: number;
};

export class MessageQueue {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queued_messages (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        account_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        body TEXT NOT NULL,
        media_path TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        queued_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_queued_messages_status
        ON queued_messages(status);
      CREATE INDEX IF NOT EXISTS idx_queued_messages_queued_at
        ON queued_messages(queued_at);
      CREATE INDEX IF NOT EXISTS idx_queued_messages_channel
        ON queued_messages(channel, account_id);
    `);
  }

  /**
   * Add a message to the queue
   */
  enqueue(message: Omit<QueuedMessage, "id" | "queuedAt" | "attempts" | "status">): QueuedMessage {
    const id = randomUUID();
    const queuedAt = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO queued_messages
        (id, channel, account_id, sender_id, chat_id, body, media_path, metadata, queued_at, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    stmt.run(
      id,
      message.channel,
      message.accountId,
      message.senderId,
      message.chatId,
      message.body,
      message.mediaPath ?? null,
      JSON.stringify(message.metadata),
      queuedAt,
    );

    return {
      ...message,
      id,
      queuedAt,
      attempts: 0,
      status: "pending",
    };
  }

  /**
   * Get pending messages for processing
   */
  getPending(limit: number = 10): QueuedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM queued_messages
      WHERE status = 'pending'
      ORDER BY queued_at ASC
      LIMIT ?
    `);

    return stmt.all(limit).map(this.rowToMessage);
  }

  /**
   * Mark a message as processing
   */
  markProcessing(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE queued_messages
      SET status = 'processing', attempts = attempts + 1, last_attempt_at = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  /**
   * Mark a message as completed
   */
  markCompleted(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE queued_messages
      SET status = 'completed'
      WHERE id = ?
    `);
    stmt.run(id);
  }

  /**
   * Mark a message as failed
   */
  markFailed(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE queued_messages
      SET status = 'failed'
      WHERE id = ?
    `);
    stmt.run(id);
  }

  /**
   * Reset processing messages back to pending (for recovery)
   */
  resetProcessing(): number {
    const stmt = this.db.prepare(`
      UPDATE queued_messages
      SET status = 'pending'
      WHERE status = 'processing'
    `);
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Delete old completed/failed messages
   */
  cleanup(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const stmt = this.db.prepare(`
      DELETE FROM queued_messages
      WHERE status IN ('completed', 'failed') AND queued_at < ?
    `);
    const result = stmt.run(cutoff);
    return result.changes;
  }

  /**
   * Enforce max queue size by removing oldest pending
   */
  enforceMaxSize(maxSize: number): number {
    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM queued_messages WHERE status = 'pending'
    `);
    const { count } = countStmt.get() as { count: number };

    if (count <= maxSize) return 0;

    const toDelete = count - maxSize;
    const deleteStmt = this.db.prepare(`
      DELETE FROM queued_messages
      WHERE id IN (
        SELECT id FROM queued_messages
        WHERE status = 'pending'
        ORDER BY queued_at ASC
        LIMIT ?
      )
    `);
    const result = deleteStmt.run(toDelete);
    return result.changes;
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        MIN(CASE WHEN status = 'pending' THEN queued_at END) as oldest_queued_at
      FROM queued_messages
    `);

    const row = stmt.get() as {
      total: number;
      pending: number;
      processing: number;
      failed: number;
      completed: number;
      oldest_queued_at: number | null;
    };

    return {
      total: row.total,
      pending: row.pending,
      processing: row.processing,
      failed: row.failed,
      completed: row.completed,
      oldestQueuedAt: row.oldest_queued_at ?? undefined,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  private rowToMessage(row: unknown): QueuedMessage {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      channel: r.channel as string,
      accountId: r.account_id as string,
      senderId: r.sender_id as string,
      chatId: r.chat_id as string,
      body: r.body as string,
      mediaPath: r.media_path as string | undefined,
      metadata: JSON.parse(r.metadata as string),
      queuedAt: r.queued_at as number,
      attempts: r.attempts as number,
      lastAttemptAt: r.last_attempt_at as number | undefined,
      status: r.status as QueuedMessage["status"],
    };
  }
}
