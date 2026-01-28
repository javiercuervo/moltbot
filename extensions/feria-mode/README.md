# Feria Mode Plugin

Offline queue mode for Moltbot. Designed for scenarios with intermittent connectivity (trade fairs, events, remote locations).

## How It Works

1. **Connectivity Monitoring**: Periodically checks network connectivity
2. **Message Queuing**: When offline, incoming messages are stored in SQLite
3. **Auto-Sync**: When connectivity is restored, queued messages are processed

**Important**: This plugin queues messages but does NOT process them offline. LLM processing requires cloud connectivity. Messages are held until the connection is restored.

## Installation

```bash
cd extensions/feria-mode
npm install
```

## Configuration

Add to your `~/.clawdbot/moltbot.json`:

```json5
{
  plugins: {
    "feria-mode": {
      enabled: true,
      // Optional settings (defaults shown)
      dbPath: "~/.clawdbot/feria-queue.db",
      connectivityCheckIntervalSec: 30,
      maxQueueSize: 1000,
      maxQueueAgeHours: 24,
      autoSync: true,
      syncBatchSize: 10
    }
  }
}
```

## CLI Commands

```bash
# Check queue status
moltbot feria status

# Force sync queued messages
moltbot feria sync

# Check connectivity
moltbot feria check

# Clean up old messages
moltbot feria cleanup --hours 24
```

## Agent Tools

The plugin provides tools for the agent:

- `feria_queue_status` - Check queue status
- `feria_queue_sync` - Trigger manual sync

## Queue Behavior

- Messages are queued in SQLite with WAL mode for durability
- Queue has a max size (default 1000) - oldest messages dropped when full
- Messages older than max age (default 24h) are discarded
- Failed messages are kept for inspection but not retried automatically

## Limitations

- **No offline processing**: LLM calls require internet
- **No offline responses**: Users won't receive immediate responses when offline
- **Queue persistence**: Messages survive gateway restarts
- **Order preservation**: Messages are processed in FIFO order

## Use Cases

- Trade fairs with spotty WiFi
- Remote field operations
- Areas with intermittent cellular connectivity
- Backup for network outages
