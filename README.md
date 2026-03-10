# CDA Weather ARMS Bot

Telegram bot that sends weather snapshots (WBGT + air temperature) for CDA and HTTC on a fixed weekday schedule, plus on-demand replies via Telegram commands.

## Disclaimer

This project is built out of personal interest.

It is not affiliated with, endorsed by, or representing:

- Civil Defence Academy (CDA)
- National Environment Agency (NEA)
- Singapore Civil Defence Force (SCDF)

## Tech Stack

- Language/runtime: TypeScript, Node.js
- Bot framework: Telegraf
- Web server: Express
- Scheduler: node-schedule
- Data source: data.gov.sg weather APIs (WBGT + air temperature)
- Data store: Redis (via ioredis)
- Logging: Winston
- Runtime env validation: `@t3-oss/env-core` + `zod`
- Testing: Vitest
- Container: Docker
- Current deployment config included: Fly.io (`fly.toml`)

## What The Bot Does

- Sends scheduled updates on weekdays at `09:50`, `11:50`, `13:50`, `15:50` Singapore time.
- Supports user subscription modes: `Rota 1`, `Rota 2`, `Rota 3`, and `Office Hours`.
- Supports on-demand weather with `/weather`.
- Supports settings and unsubscribe flows through commands and inline buttons.
- Exposes operational endpoints:
	- `POST /telegram-webhook`
	- `GET /health`
	- `GET /logs`

## Rota Shift Logic

Rota logic lives in `utils/schedule/rota.ts`.

- Reference date: `2025-10-06T00:00:00+08:00`
- Reference rota on that date: `Rota 3`
- Cycle order: `3 -> 2 -> 1 -> 3 -> ...` (daily cycle)
- Scheduled recipients at run time:
	- All `office_hours` subscribers
	- Plus subscribers of the computed rota for that run date
- Subscriber IDs are de-duplicated before sending

Scheduling rule lives in `utils/bot/rule.ts`:

- Days: Monday to Friday
- Times: `09:50`, `11:50`, `13:50`, `15:50`
- Timezone: `Singapore`

## Commands

- `/start`: first-time schedule selection, or shows current subscription + next update if already subscribed
- `/weather`: fetches and returns current weather snapshot immediately
- `/settings`: shows current subscription + buttons to change schedule/stop
- `/stop`: unsubscribes from all schedules
- `/help`: command help summary

## Design Patterns Used

- Singleton (lazy initialization): `Redis.getRedisClient()` in `api/redis.api.ts` creates one shared Redis client on first use and reuses it afterward.
- Factory functions: `createBot()` and `createJob()` in `bot.ts` build runtime instances when startup runs, instead of creating them at import time.
- Composition root: `startBot()` in `bot.ts` wires bot + scheduler + handlers in one startup location.
- Dependency injection (explicit runtime wiring): handlers are registered via `registerHandlers(bot, job)` so behavior depends on passed instances, not hidden module globals.
- Module namespace organization: namespaced modules (`Weather`, `Redis`, `Rota`, `WeatherReportSender`) keep related functions and types grouped by bounded context.
- Defensive error boundary pattern: weather send path catches fetch/send failures and notifies chats with a fallback error message instead of failing silently.

## Project Structure

```text
├── Dockerfile
├── README.md
├── api/
│   ├── redis.api.ts
│   ├── weather.api.ts
│   └── types/
│       └── weather.ts
├── bot.ts
├── docs/
│   ├── weather-update.png
│   ├── weather.png
│   └── welcome.png
├── fly.toml
├── index.ts
├── package-lock.json
├── package.json
├── tests/
│   ├── api/
│   │   └── weather.test.ts
│   └── utils/
│       ├── getNextUpdateDateForRota.test.ts
│       ├── getRotaNumber.test.ts
│       └── replies.test.ts
├── tsconfig.json
├── utils/
│   ├── bot/
│   │   ├── replies.ts
│   │   ├── rule.ts
│   │   └── weatherReportSender.ts
│       └── replies.test.ts
│   ├── infra/
│   │   ├── env.ts
│   │   └── logger.ts
│   ├── schedule/
│   │   └── rota.ts
│   ├── security/
│   │   └── generateSecretToken.ts
└── yarn.lock
```

## Where To Edit What

If you want to change a specific behavior, start here:

- Command text, message formatting, and help copy:
  - `utils/bot/replies.ts`
- Command handlers and schedule trigger timing:
  - `bot.ts`
- Cron schedule rule only:
  - `utils/bot/rule.ts`
- Rota cycle and next-update computation:
  - `utils/schedule/rota.ts`
- Subscription persistence and Redis set logic:
  - `api/redis.api.ts`
- Redis connection settings and singleton behavior:
  - `api/redis.api.ts`
- Environment schema and required env vars:
  - `utils/infra/env.ts`
- Weather API fetch/parsing and nearest-station logic:
  - `api/weather.api.ts`
- Sending/editing weather reports and send error handling:
  - `utils/bot/weatherReportSender.ts`
- HTTP endpoints (`/health`, `/logs`, webhook wiring):
  - `index.ts`
- Tests:
  - `tests/`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env` and set required values:

```env
BOT_ID=
DATA_GOV_API_KEY=
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
HOST=http://localhost:8080
PORT=8080
NODE_ENV=development
```

3. Build and run:

```bash
npm run build
npm start
```

4. Run tests:

```bash
npm test
```

## Deployment

### SaaS/services required

- Telegram Bot API access (create bot and token via BotFather)
- Redis service (self-hosted or managed)
- A public HTTPS host for your app (Telegram webhook target)
- data.gov.sg API key

For Fly.io specifically, you need:

- Fly.io account and CLI
- One Fly app instance with HTTPS endpoint

### SaaS/services not strictly required

- Fly.io specifically is not required. Any platform that can run Node.js and expose HTTPS works.
- Docker is not required, but supported.

### Current repo deployment option: Fly.io

`fly.toml` is already present for Fly.io deployment.

High-level steps:

1. Provision Redis and collect credentials.
2. Set app secrets/environment variables (`BOT_ID`, `DATA_GOV_API_KEY`, `REDIS_*`, `HOST`).
3. Deploy app to Fly.io.
4. Ensure `HOST` matches the public HTTPS URL of the deployed service.
5. Verify health on `GET /health`.
6. Confirm Telegram webhook deliveries to `POST /telegram-webhook`.

### Docker deployment (generic)

```bash
docker build -t cda-weather-arms-bot .
docker run --rm -p 8080:8080 --env-file .env cda-weather-arms-bot
```

## Contribution Guide

1. Fork or branch from `main`.
2. Make focused changes in the relevant files (see "Where To Edit What").
3. Add or update tests under `tests/` when behavior changes.
4. Run:

```bash
npm test
npm run build
```

5. Open a PR with:
- clear problem statement
- summary of behavior changes
- test coverage notes

## Notes

- Redis keys are environment-prefixed (`dev:*` or `prod:*`) based on `NODE_ENV`.
- `SECRET_TOKEN` is generated at runtime by `utils/security/generateSecretToken.ts` and used for Telegram webhook verification.
