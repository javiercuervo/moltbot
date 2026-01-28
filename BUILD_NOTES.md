# Build Notes - Proportione Bot Deployment

This document contains setup instructions for deploying a multichannel bot using Moltbot.

## Phase 1: Local Experimental Setup ("Feria Mode")

### Prerequisites

| Requirement | Version | Verification |
|-------------|---------|--------------|
| Node.js | 22+ | `node --version` |
| pnpm | 10.x | `pnpm --version` |
| Git | 2.x | `git --version` |

### Initial Setup

```bash
# Clone the repository (if not already done)
git clone https://github.com/moltbot/moltbot.git
cd moltbot

# Install dependencies
pnpm install

# Build the project
pnpm build

# Verify installation
pnpm moltbot --version
pnpm moltbot --help
```

### Environment Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your credentials:
```bash
# Required for LLM processing
ANTHROPIC_API_KEY=sk-ant-...

# WhatsApp (optional - can use QR login instead)
# No environment variables needed for Baileys/QR login

# Email (IMAP/SMTP)
EMAIL_IMAP_HOST=imap.example.com
EMAIL_IMAP_PORT=993
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_USER=bot@example.com
EMAIL_PASSWORD=your-app-password
```

### Moltbot Configuration

Create or edit `~/.clawdbot/moltbot.json`:

```json5
{
  // Gateway settings
  gateway: {
    mode: "local"
  },

  // Channel configuration
  channels: {
    // WhatsApp Web (Baileys)
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: ["+34XXXXXXXXX"],  // Your phone number (E.164 format)
      groupPolicy: "disabled"       // Start with DMs only
    }
  },

  // Agent identity
  identity: {
    name: "Asistente Proportione"
  }
}
```

### WhatsApp Setup

1. Configure gateway mode:
```bash
pnpm moltbot config set gateway.mode local
```

2. Generate QR code for WhatsApp linking:
```bash
# Option A: QR in terminal
pnpm moltbot channels login --channel whatsapp

# Option B: QR as image file
pnpm moltbot channels login --channel whatsapp --qr-file ~/Desktop/wa-qr.png
```

3. Scan the QR code:
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Tap "Link a Device"
   - Scan the QR code

4. Verify connection:
```bash
pnpm moltbot channels status
```

### Starting the Gateway

```bash
# Development mode (verbose logging)
pnpm moltbot gateway run --verbose

# Background mode (production)
nohup pnpm moltbot gateway run --bind loopback --port 18789 --force > /tmp/moltbot-gateway.log 2>&1 &
```

### Testing

1. Send a test message via WhatsApp:
```bash
pnpm moltbot message send --to "+34XXXXXXXXX" --channel whatsapp --text "Test message"
```

2. Check gateway logs:
```bash
tail -f /tmp/moltbot-gateway.log
```

3. Verify channel status:
```bash
pnpm moltbot channels status --probe
```

### Smoke Test Checklist

- [ ] `pnpm build` completes without errors
- [ ] `pnpm moltbot --version` shows current version
- [ ] `pnpm moltbot channels status` shows WhatsApp as connected
- [ ] Gateway starts without errors
- [ ] Test message sent successfully
- [ ] Bot responds to incoming WhatsApp messages

## Phase 2: Proportione Cloud

### Server Requirements

- VM with Node.js 22+
- Docker (optional)
- 2GB RAM minimum
- Public IP for webhooks (if using Telegram/other webhook channels)

### Deployment Steps

1. SSH into server
2. Clone repository
3. Install dependencies
4. Configure environment
5. Set up systemd service or Docker Compose
6. Configure reverse proxy (nginx/caddy) for webhooks
7. Enable SSL with Let's Encrypt

### Systemd Service Example

```ini
[Unit]
Description=Moltbot Gateway
After=network.target

[Service]
Type=simple
User=moltbot
WorkingDirectory=/opt/moltbot
ExecStart=/usr/bin/node /opt/moltbot/moltbot.mjs gateway run --bind 0.0.0.0 --port 18789
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Phase 3: Instituto Cloud

See `docs/enterprise/` for enterprise deployment guidelines including:
- Google Workspace integration (Calendar + Gmail)
- SSO/SAML configuration
- Audit logging setup
- Multi-tenant architecture

## Troubleshooting

### Common Issues

**WhatsApp not connecting:**
```bash
# Check credentials
ls -la ~/.clawdbot/credentials/whatsapp/

# Re-link if needed
pnpm moltbot channels logout --channel whatsapp
pnpm moltbot channels login --channel whatsapp
```

**Gateway won't start:**
```bash
# Check for port conflicts
lsof -i :18789

# Kill existing process
pkill -f moltbot-gateway

# Check logs
pnpm moltbot logs --follow
```

**Messages not being processed:**
```bash
# Verify allowlist includes your number
pnpm moltbot config get channels.whatsapp.allowFrom

# Check DM policy
pnpm moltbot config get channels.whatsapp.dmPolicy
```

### Useful Commands

```bash
# Health check
pnpm moltbot doctor

# Channel status with probing
pnpm moltbot channels status --probe --all

# View recent logs
pnpm moltbot logs --follow

# Configuration dump
pnpm moltbot config list
```

## Upstream Updates

This fork tracks `moltbot/moltbot`. To sync with upstream:

```bash
# Add upstream remote (one time)
git remote add upstream https://github.com/moltbot/moltbot.git

# Fetch and merge
git fetch upstream
git checkout main
git merge upstream/main

# Rebase customization branch
git checkout feature/proportione-customizations
git rebase main
```

See `CUSTOMIZATIONS.md` for a list of local changes that may need conflict resolution.
