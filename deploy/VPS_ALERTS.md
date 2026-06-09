# VPS Telegram alerts

Use a separate Telegram bot for infrastructure alerts. Do not reuse the payment support bot.

Current alert hooks:

- Backup failure alerts from `/usr/local/sbin/voxtts-backup`.
- Optional backup success alerts.

Create the bot:

1. Open BotFather in Telegram.
2. Create a new bot for system alerts.
3. Add the bot to a private admin alert group.
4. Get the group chat ID.
5. Store the token and chat ID only on the VPS.

Configure on the VPS in `/etc/voxtts-backup.env`:

```bash
ALERT_TELEGRAM_BOT_TOKEN="bot-token-from-botfather"
ALERT_TELEGRAM_CHAT_ID="private-alert-group-chat-id"
ALERT_TELEGRAM_SERVICE_NAME="Khmer Vox TTS VPS"
ALERT_TELEGRAM_NOTIFY_SUCCESS="false"
```

Recommended default:

- keep `ALERT_TELEGRAM_NOTIFY_SUCCESS=false`
- alert only when backup fails

Test without creating a fake failure:

```bash
/usr/local/sbin/voxtts-backup
```

If success alerts are disabled, a passing backup sends no Telegram message. A failed backup sends a short alert with timestamp, severity, and log location.

Never put API keys, database URLs, Spaces keys, Modal keys, or session secrets inside Telegram messages.
