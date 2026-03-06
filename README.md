# CDA Weather ARMS Bot

Telegram bot for ARMS weather reporting at Civil Defence Academy (CDA) and Home Team Tactical Centre (HTTC), using data.gov.sg WBGT and air-temperature feeds.

This README reflects the current implementation state as of **2026-03-06**.

<img src="docs/welcome.png" width="300" />
<img src="docs/weather.png" width="300" />

## Current Capabilities

- Sends scheduled weather updates on weekdays at `09:50`, `11:50`, `13:50`, `15:50` (Singapore time).
- Supports on-demand weather snapshots with `/weather`.
- Supports schedule subscriptions: `Rota 1`, `Rota 2`, `Rota 3`, or `Office Hours`.
- Stores chat subscriptions in Redis (environment-scoped keys: `dev:*` or `prod:*`).
- Queues outbound Telegram messages with BullMQ and processes them in a worker.
- Exposes operational endpoints: `/health` and `/logs`.
- Uses Telegram webhook secret-token verification (`X-Telegram-Bot-Api-Secret-Token`).

## User Commands

| Command | Description |
|---|---|
| `/start` | Shows schedule selection buttons. If already subscribed, returns current schedule and next update. |
| `/weather` | Queues an immediate weather fetch and edits a loading message with the result. |
| `/settings` | Shows current schedule, version, and buttons to switch schedule or stop updates. |
| `/stop` | Removes the chat from all subscriptions. |
| `/help` | Shows a short usage summary. |

## Schedule and Rota Logic

- Scheduled job rule is defined in `bot.ts` using `node-schedule`.
- Weekdays only (`Mon-Fri`), fixed hours/minute: `9, 11, 13, 15` at minute `50`.
- Rota cycle anchor is `2025-10-06T00:00:00+08:00` and treated as `Rota 3`.
- Repeating cycle is `3 -> 2 -> 1`.
- For each scheduled run, recipients are all `office_hours` subscribers plus subscribers of the computed rota for that run date.
- Duplicate chat IDs are deduplicated before queueing.

## Weather Data Behavior

- WBGT source: `https://api-open.data.gov.sg/v2/real-time/api/weather?api=wbgt`
- Air temperature source: `https://api-open.data.gov.sg/v2/real-time/api/air-temperature`
- Target locations:

| Location | Latitude | Longitude |
|---|---|---|
| CDA | `1.3659363` | `103.6898665` |
| HTTC | `1.4063182` | `103.759932` |

- Nearest station selection uses Haversine distance.
- Reply payload includes heat stress + emoji, WBGT (`deg C`), air temperature (`deg C`), and the last update timestamp (formatted to `Asia/Singapore` locale display).

## HTTP Endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/telegram-webhook` | Telegraf webhook callback; request token checked against runtime `SECRET_TOKEN`. |
| `GET` | `/health` | Returns bot status, host, version, subscription counts, queue counts, and next schedule invocation. |
| `GET` | `/logs` | Returns `logs/app.log` content split by line as JSON. |

## Environment Variables

Required for normal operation:

- `BOT_ID` (Telegram bot token)
- `DATA_GOV_API_KEY`
- `REDIS_HOST`
- `REDIS_PORT`

Optional / runtime-dependent:

- `REDIS_PASSWORD`
- `HOST` (used for webhook registration URL; defaults to `http://localhost:8080`)
- `PORT` (Express listen port; defaults to `8080`)
- `NODE_ENV` (`production` switches Redis key prefix from `dev` to `prod`)

Generated at startup:

- `SECRET_TOKEN` (created via `crypto.randomBytes`; not expected in `.env`)

Current `.env.example` includes:

```env
BOT_ID=
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
REDIS_USERNAME=
DATA_GOV_API_KEY=
```

## Project Structure

```text
.
├── api/
│   ├── weather.ts
│   └── types/weather.ts
├── tests/
│   ├── api/weather.test.ts
│   └── utils/
├── utils/
│   ├── bot/
│   │   ├── replies.ts
│   │   └── subscriptions.ts
│   ├── infra/
│   │   ├── logger.ts
│   │   ├── redis.ts
│   │   ├── version.ts
│   │   └── weatherReportQueue.ts
│   ├── schedule/
│   │   ├── getNextUpdateDateForRota.ts
│   │   └── getRotaNumber.ts
│   ├── security/generateSecretToken.ts
│   └── weather/
│       ├── fetchWeatherReadings.ts
│       ├── getWBGTEmoji.ts
│       └── locations.ts
├── bot.ts
├── index.ts
├── Dockerfile
└── fly.toml
```

## Local Run

```bash
npm install
npm run build
npm start
```

Run tests:

```bash
npm test
```

## Docker

```bash
docker build -t cda-weather-arms-bot .
docker run --rm -p 8080:8080 --env-file .env cda-weather-arms-bot
```

## Deployment Notes (Fly.io)

- `fly.toml` is configured with app `cda-weather-arms-bot`, region `sin`, internal port `8080`, and HTTP service auto start/stop.

After deploy:

1. Ensure `HOST` points to your public Fly URL (used by `setWebhook`).
2. Check `/health` for status, queue, and subscriber stats.
3. Confirm Telegram is delivering webhook calls to `/telegram-webhook`.

## Testing Coverage (Current)

- Weather API station selection and fallbacks.
- Reply construction and MarkdownV2 escaping.
- Error-message formatting for weather fetch failures.
- Rota calculations and next-update calculations.
- Heat stress to emoji mapping.
