# CDA Weather ARMS Bot

A Telegram bot that automates ARMS weather report checks for personnel at **Civil Defence Academy (CDA)** and **Home Team Tactical Centre (HTTC)** in Singapore. Eliminates the need to manually check the myENV app before every ARMS Weather Report deadline.

<img src="docs/welcome.png" width="300" />
<img src="docs/weather.png" width="300" />

## Features

- **Scheduled weather updates** — Sends heat stress readings every weekday at 09:50, 11:50, 13:50, and 15:50 (Singapore time), timed around ARMS reporting windows.
- **On-demand weather snapshot** — Fetch live readings anytime via `/weather` without waiting for the next scheduled push.
- **Rota-based subscription** — Subscribe to a specific 3-day rota cycle so you only receive updates on your duty days.
- **Heat stress emoji indicators** — At-a-glance WBGT status: 🟢 Low, 🟡 Moderate, 🔴 High/Very High, ⚪ Unknown.
- **Redis-backed subscriptions** — Chat subscriptions persist across restarts using Redis sets.
- **BullMQ-based message queue** — Scheduled and on-demand weather deliveries are queued and processed by a worker.
- **Secure webhook** — Telegram webhook is protected by a runtime-generated secret token validated on every request.
- **Health and log endpoints** — Operational visibility via `/health` and `/logs` HTTP endpoints.
- **Graceful shutdown** — Handles `SIGINT` and `SIGTERM` cleanly; scheduler is cancelled before process exit.

## Quick Start (User)

1. Open Telegram: [@cda_weather_arms_bot](https://t.me/cda_weather_arms_bot)
2. Send `/start` and select your schedule.

## User Commands

| Command | Description |
|---|---|
| `/start` | Subscribe to all weekday scheduled updates. Shows rota selection buttons if not yet subscribed. |
| `/weather` | Send an immediate weather snapshot for CDA and HTTC. |
| `/settings` | View current subscription status, rota, and bot version. Provides buttons to change schedule or unsubscribe. |
| `/help` | Display usage information. |

## Rota Logic

The rota follows a 3-day repeating cycle anchored to a known reference date:

- Reference: `2025-10-06T00:00:00+08:00` = **Rota 3**
- Cycle order: **3 → 2 → 1 → 3 → ...**

On each scheduled run, the bot sends to:

1. All weekday subscribers (office hours subscription).
2. Subscribers of the rota that matches the current job date.

Duplicates across both groups are removed automatically before sending.

## What the Bot Sends

Each weather message includes, for both CDA and HTTC:

- Heat stress level with status emoji
- WBGT (Wet Bulb Globe Temperature) in °C
- Air temperature in °C
- Last updated timestamp (Singapore time)

Scheduled messages additionally include the current job date and the timestamp of the next scheduled update.

## Architecture

### Runtime flow

1. Express server starts and generates a runtime secret token.
2. Telegraf webhook is registered at `/telegram-webhook` with secret token validation.
3. Scheduled job fires on cron rule: weekdays at 09:50, 11:50, 13:50, 15:50 (Asia/Singapore).
4. Bot queries Redis for all applicable subscribers (office hours + rota match).
5. Weather data is fetched in parallel for CDA and HTTC from data.gov.sg APIs.
6. Message payloads are enqueued in BullMQ and processed by a worker for Telegram delivery.

### Data sources

- **WBGT**: `https://api-open.data.gov.sg/v2/real-time/api/weather?api=wbgt`
- **Air Temperature**: `https://api-open.data.gov.sg/v2/real-time/api/air-temperature`

The nearest weather station to each target location is resolved using the Haversine distance formula.

### Target coordinates

| Location | Latitude | Longitude |
|---|---|---|
| CDA | 1.3659363 | 103.6898665 |
| HTTC | 1.4063182 | 103.759932 |

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/telegram-webhook` | Telegram webhook handler. Validates `X-Telegram-Bot-Api-Secret-Token`. |
| `GET` | `/health` | Returns status, configured host, subscriber count, and next scheduled update time. |
| `GET` | `/logs` | Returns application log entries from `logs/app.log` as a JSON array. |

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript 5.8
- **Bot framework**: Telegraf 4.16
- **HTTP server**: Express 5.1
- **Scheduling**: node-schedule 2.1
- **Persistence**: Redis via ioredis 5.6
- **Queueing**: BullMQ 5.x (backed by Redis)
- **Weather API**: axios + data.gov.sg open APIs
- **Distance calculation**: haversine-distance 1.2
- **Logging**: Winston 3.17
- **Security**: Helmet 8.1, Node.js crypto
- **Testing**: Vitest 3.2
- **Deployment**: Docker + Fly.io (region: `sin`)

## Project Structure

```
.
├── api/
│   ├── weather.ts                    # Weather fetching + nearest-station resolution
│   └── types/weather.ts              # TypeScript interfaces for API responses
├── utils/
│   ├── bot/
│   │   ├── replies.ts                # Message templates and MarkdownV2 formatting
│   │   └── subscriptions.ts          # Redis-backed subscription operations
│   ├── infra/
│   │   ├── logger.ts                 # Winston logger (console + file)
│   │   ├── redis.ts                  # Redis client initialisation
│   │   └── version.ts                # Version string helper
│   ├── schedule/
│   │   ├── getRotaNumber.ts          # Derive current rota from date
│   │   └── getNextUpdateDateForRota.ts # Find next scheduled update for a rota
│   ├── security/
│   │   └── generateSecretToken.ts    # Runtime secret token generation
│   └── weather/
│       ├── fetchWeatherReadings.ts   # Parallel weather fetch for both locations
│       ├── getWBGTEmoji.ts           # Heat stress level to emoji mapping
│       └── locations.ts              # CDA and HTTC coordinates
├── tests/
│   ├── api/weather.test.ts
│   └── utils/                        # Unit tests for schedule, formatting, emoji
├── bot.ts                            # Telegraf bot handlers + scheduled job + fan-out
├── index.ts                          # App bootstrap, webhook route, health/log routes
├── Dockerfile
└── fly.toml
```

## Prerequisites

- Node.js 20+
- npm
- A publicly reachable host URL (required for Telegram webhook registration)
- Telegram Bot token
- Redis instance
- data.gov.sg API key

## Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Build and start
npm start

# Run tests
npm test
```

## Docker

```bash
# Build image
docker build -t cda-weather-arms-bot .

# Run container
docker run --rm -p 8080:8080 --env-file .env cda-weather-arms-bot
```

## Deployment (Fly.io)

The repository includes `fly.toml` configured for region `sin` and internal port `8080`.

1. Set all required secrets and environment variables on Fly.
2. Run `fly deploy`.
3. Confirm `GET /health` returns `{ "status": "ok" }`.
4. Verify Telegram webhook is reaching `<HOST>/telegram-webhook`.

## Operational Notes

- Logs are written to both console and `logs/app.log`.
- Graceful shutdown is handled on `SIGINT` and `SIGTERM`.
- On `uncaughtException` or `unhandledRejection`, the scheduler is cancelled and the process exits with a non-zero status code.
- If no subscribers exist at schedule time, the send step is skipped entirely.
- `SECRET_TOKEN` is generated fresh at each startup; it is never stored or logged.

## Testing Coverage

- Nearest-station weather selection and fallback behaviour.
- Reply formatting and MarkdownV2 escaping.
- Rota cycle calculation.
- Next update date derivation per rota.
- Heat stress emoji mapping.

## Contributing

1. Fork and clone the repository.
2. Create a feature branch.
3. Add or update tests alongside your changes.
4. Run `npm test` and confirm all tests pass.
5. Open a pull request with a clear summary and rationale.
