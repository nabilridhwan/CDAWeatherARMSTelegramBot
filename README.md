# CDA Weather ARMS Telegram Bot

Telegram bot for ARMS weather updates at **CDA** and **HTTC** using Singapore real-time weather datasets.

<img src="docs/welcome.png" width="300" />
<img src="docs/weather-update.png" width="300" />

## Overview

This project delivers weather notifications to Telegram chats on a fixed weekday schedule and on demand.

- Sends scheduled weather snapshots at **09:50, 11:50, 13:50, 15:50** (Singapore time, weekdays).
- Supports on-demand updates via `/weather`.
- Supports rota-targeted subscriptions via `/setrota 1|2|3`.
- Uses Redis sets for chat subscription persistence.
- Uses a secure Telegram webhook with runtime-generated secret token validation.

## What the Bot Sends

Each weather message includes:

- CDA heat stress, WBGT, and air temperature.
- HTTC heat stress, WBGT, and air temperature.
- Last updated timestamp.
- For scheduled jobs: job date and next update timestamp.

Heat stress is converted to status emojis:

- `Low` → 🟢
- `Moderate` → 🟡
- `High / Very High` → 🔴
- Unknown → ⚪

## User Commands

- `/start`  
   Subscribes chat to all weekday scheduled updates (unless already subscribed).

- `/setrota <1|2|3>`  
   Unsubscribes chat from all existing sets, then subscribes chat to one rota set.

- `/weather`  
   Sends immediate weather snapshot for CDA + HTTC.

- `/stop`  
   Unsubscribes chat from all subscription sets.

- `/help`  
   Shows bot usage information.

## Rota Logic

Rota cycle is a 3-day repeating sequence based on reference date:

- Reference date: `2025-10-06T00:00:00+08:00` = **Rota 3**
- Next days cycle as: **3 → 2 → 1 → 3 ...**

On each scheduled run, recipients are:

1. All weekday subscribers, plus
2. Subscribers of the rota that matches the job date

Duplicates are automatically removed before sending.

## Architecture

### Runtime flow

1. Express server starts.
2. Telegraf webhook is registered at `/telegram-webhook`.
3. Incoming webhook requests are validated with `X-Telegram-Bot-Api-Secret-Token`.
4. Scheduled job runs on cron-like rule (weekday 09:50/11:50/13:50/15:50, Singapore).
5. Weather data is fetched in parallel for both locations.
6. Message is formatted (MarkdownV2-safe) and sent to subscribed chats.

### Data sources

- WBGT API: `https://api-open.data.gov.sg/v2/real-time/api/weather?api=wbgt`
- Air Temperature API: `https://api-open.data.gov.sg/v2/real-time/api/air-temperature`

For each target location, nearest station is selected using haversine distance.

## HTTP Endpoints

- `POST /telegram-webhook`  
   Telegram webhook handler (secret token validated).

- `GET /health`  
   Health status, host, subscriber count, and next scheduled update.

- `GET /logs`  
   Returns application logs from `logs/app.log`.

## Tech Stack

- Node.js + TypeScript
- Express
- Telegraf (Telegram Bot API)
- node-schedule
- Redis (ioredis)
- Winston logging
- Vitest
- Fly.io (deployment target)

## Project Structure

```text
.
├── api/
│   ├── weather.ts                # Weather retrieval + nearest-station resolution
│   └── types/weather.ts
├── utils/
│   ├── bot/
│   │   ├── bot.ts                # Telegram handlers + scheduler + fan-out
│   │   └── replies.ts            # Message templates / formatting
│   ├── infra/
│   │   ├── logger.ts             # Console + file logger
│   │   └── redis.ts              # Redis client setup
│   ├── schedule/getRotaNumber.ts # Rota calculation
│   ├── security/generateSecretToken.ts
│   └── weather/
│       ├── getWBGTEmoji.ts
│       └── locations.ts
├── tests/
│   ├── api/weather.test.ts
│   └── utils/*.test.ts
├── index.ts                      # App bootstrap + webhook + health/log routes
├── Dockerfile
└── fly.toml
```

## Prerequisites

- Node.js 20+
- npm
- A reachable host URL for Telegram webhook registration
- Telegram Bot token
- Redis instance
- data.gov.sg API key

## Environment Variables

Create a `.env` file in project root:

```bash
# Telegram
BOT_ID=<telegram_bot_token>

# App URL used for webhook registration
HOST=https://your-domain.example.com

# Server
PORT=8080

# Data.gov.sg
DATA_GOV_API_KEY=<your_data_gov_api_key>

# Redis
REDIS_HOST=<redis_host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis_password_if_any>
```

Notes:

- `SECRET_TOKEN` is generated at runtime and used to validate webhook requests.
- If `HOST` is missing, default webhook URL uses `http://localhost:8080`.

## Local Development

Install dependencies:

```bash
npm install
```

Build project:

```bash
npm run build
```

Run app (build + start):

```bash
npm start
```

Run tests:

```bash
npm test
```

## Docker

Build image:

```bash
docker build -t cda-weather-arms-bot .
```

Run container:

```bash
docker run --rm -p 8080:8080 --env-file .env cda-weather-arms-bot
```

## Deployment (Fly.io)

This repository includes `fly.toml` configured for region `sin` and internal port `8080`.

Typical deploy flow:

1. Set required secrets/env vars on Fly.
2. Deploy app.
3. Confirm `/health` is returning status `ok`.
4. Ensure Telegram webhook reaches `<HOST>/telegram-webhook`.

## Operational Notes

- Logs are written to console and `logs/app.log`.
- Graceful shutdown handles `SIGINT` and `SIGTERM`.
- On `uncaughtException`/`unhandledRejection`, scheduler is cancelled and process exits with non-zero status.
- If no subscribed chats exist at schedule time, send is skipped.

## Testing Coverage

Current tests cover:

- Nearest-station weather selection and fallback behavior.
- Reply formatting and Markdown escaping.
- Rota calculation cycle behavior.
- Heat-stress emoji mapping.

## Quick Start (User)

1. Open Telegram: [@cda_weather_arms_bot](https://t.me/cda_weather_arms_bot)
2. Send `/start`
3. Optional: set rota via `/setrota 1`, `/setrota 2`, or `/setrota 3`
4. Use `/weather` anytime for immediate update

## Contributing

Contributions are welcome.

1. Fork and clone the repository.
2. Create a feature branch.
3. Add/adjust tests with your changes.
4. Run `npm test`.
5. Open a pull request with clear summary and rationale.
