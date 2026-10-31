# Gate CFD CRT Alert Bot

Telegram-controlled CRT alert bot using Gate's public MT5-based CFD market data. It sends alerts only and does not place trades.

## Markets

- Forex
- Gold and other metals
- NAS100, US30, US500, and other indices
- Commodities
- Stocks

Leveraged duplicate symbols are hidden when Gate also provides the canonical instrument.

## Timeframes

`M15`, `M30`, `H1`, `H2`, `H3`, `H4`, `H6`, `H8`, `H12`, `D1`, `W1`

Gate supplies M15, H1, H4, D1, and W1 directly. Other periods are assembled from complete lower-timeframe candles using Gate MT5 session alignment. Candle groups containing market gaps are discarded.

Before every scan, the bot refreshes Gate's live instrument status and rejects stale candles so closed markets cannot generate alerts.
Successfully sent signal IDs are persisted, so the same candle alert is not sent again after a restart or redeployment. Alert history is retained for 90 days by default.

## Telegram controls

- Apply a timeframe to every instrument in a market group at once.
- Override timeframes for individual instruments afterward.
- Send a marked test alert from the control panel.
- Stop all monitoring for the current Telegram chat.

Real alerts use a minimal caption such as:

```text
GOLD Bullish signal M15
```

Charts show up to 50 recent candles.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `TELEGRAM_BOT_TOKEN` and the Telegram chat ID variables.
3. Run `npm start` or `./start.ps1`.
4. Send `/start` to the Telegram bot.

Gate public CFD symbols and klines do not require an API key.

## Railway variables

```text
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_CHAT_IDS=your_chat_id,second_person_chat_id
ALERT_HISTORY_PATH=/data/alert-history.json
ALERT_HISTORY_RETENTION_DAYS=90
```

Attach a Railway volume at `/data` to persist Telegram selections and sent-alert history. Keep the service at one replica when using the JSON history file. No public HTTP domain is required. Use `npm start` as the start command.

## Tests

```text
npm test
```
