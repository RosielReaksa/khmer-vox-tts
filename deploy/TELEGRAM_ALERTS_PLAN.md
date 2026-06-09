# Telegram alerts plan

Use a new Telegram bot only for system alerts. Do not reuse the payment bot.

Alert categories:

- Backup success/failure.
- Modal upstream failures or high latency.
- Worker queue stuck or dead-letter jobs.
- Low token/payment/admin risk warnings.
- VPS disk or memory pressure.

Recommended environment:

```bash
ALERT_TELEGRAM_BOT_TOKEN=<new bot token>
ALERT_TELEGRAM_CHAT_ID=<private admin group id>
ALERT_TELEGRAM_WEBHOOK_SECRET=<long random secret if webhook mode is used>
```

Rules:

- Never send API keys, database URLs, or upstream tokens to Telegram.
- Send only status, timestamp, severity, and short error summaries.
- Use a separate admin group where only trusted operators can read alerts.
- Keep payment notifications and system alerts separate so payment support messages are not mixed with infrastructure incidents.

Build order:

1. Create new Telegram bot with BotFather.
2. Add bot to a private admin alert group.
3. Capture the chat ID.
4. Store token and chat ID in Kubernetes Secret, not in source files.
5. Add a small alert sender helper.
6. Wire backup failure alerts first. `scripts/vps-backup.sh` now supports this through `/etc/voxtts-backup.env`.
7. Wire Modal, queue, and disk alerts after backup alerts are proven.

Backup alert environment:

```bash
ALERT_TELEGRAM_BOT_TOKEN=""
ALERT_TELEGRAM_CHAT_ID=""
ALERT_TELEGRAM_SERVICE_NAME="Khmer Vox TTS VPS"
ALERT_TELEGRAM_NOTIFY_SUCCESS="false"
```
