# CDA Weather ARMS Bot

Telegram bot that sends scheduled and on-demand weather updates (WBGT + air temperature) for CDA and HTTC.

## Disclaimer

This project is out of pure personal interest.

It has no affiliation with, and is not endorsed by:

- Civil Defence Academy (CDA)
- National Environment Agency (NEA)
- Singapore Civil Defence Force (SCDF)

## Tech Stack

- Language/runtime: TypeScript, Node.js
- Bot framework: Telegraf
- HTTP server: Express + Helmet
- Scheduler: node-schedule
- Data source: data.gov.sg real-time APIs (WBGT, air temperature)
- Storage: Redis via ioredis
- Configuration validation: `@t3-oss/env-core` + `zod`
- Logging: Winston
- Reliability helpers: axios-retry, p-queue
- Testing: Vitest
- Containerization: Docker
- Deployment config included: Fly.io (`fly.toml`)

## What The Bot Does

- Sends scheduled weather updates every weekday at `09:50`, `11:50`, `13:50`, `15:50` Singapore time.
- Supports subscription modes: `Rota 1`, `Rota 2`, `Rota 3`, `Office Hours`.
- Supports command-based interactions: `/start`, `/weather`, `/settings`, `/help`.
- Uses Telegram webhook security via `X-Telegram-Bot-Api-Secret-Token`.
- Exposes ops endpoints:
  - `POST /telegram-webhook`
  - `GET /health`
  - `GET /logs`

## Rota Shift Logic

Rota logic is implemented in `utils/schedule/rota.ts`.

- Reference date: `2025-10-06T00:00:00+08:00`
- Reference rota at that date: `Rota 3`
- Cycle order: `3 -> 2 -> 1 -> 3 -> ...` (daily cycle)
- For each scheduled run:
  - include all `office_hours` subscribers
  - include subscribers of the rota for that run date
- Recipient chat IDs are de-duplicated before sending.

Schedule timing is defined in `utils/bot/rule.ts`.

## Important Files And What They Do

- `index.ts`
  - App entrypoint.
  - Starts Express server, starts bot runtime, sets Telegram webhook, registers middleware/endpoints, handles graceful shutdown.
- `bot.ts`
  - Bot runtime composition root.
  - Builds Telegraf bot + schedule job (`startBot()`), registers command/action handlers, and triggers scheduled sends.
- `utils/bot/rule.ts`
  - Single source of truth for cron-like schedule rules.
- `utils/schedule/rota.ts`
  - Rota cycle math and "next update for this rota" calculation.
- `api/redis.api.ts`
  - Redis access layer.
  - Lazy singleton Redis client, subscription set operations, distributed lock acquire/release for scheduled job dedupe.
- `api/weather.api.ts`
  - Weather API client and parsing.
  - Calls data.gov APIs, applies retries/backoff, picks nearest station by coordinates.
- `utils/bot/weatherReportSender.ts`
  - Outbound message delivery pipeline.
  - Rate-limited queue + retry logic for Telegram send/edit operations.
- `utils/bot/replies.ts`
  - All user-facing message templates and weather reply formatting/escaping.
- `utils/infra/env.ts`
  - Validates and exposes required environment variables.
- `utils/security/generateSecretToken.ts`
  - Generates webhook secret token at runtime if one is not provided.

## Design Patterns Used

- Singleton (lazy): `Redis.getRedisClient()` in `api/redis.api.ts` ensures one shared Redis connection instance.
- Factory functions: `createBot()` and `createJob()` in `bot.ts` create runtime objects only at startup.
- Composition root: `startBot()` in `bot.ts` wires bot + job + handlers in one place.
- Dependency injection: `registerHandlers(bot, job)` receives dependencies explicitly instead of relying on hidden globals.
- Namespace/module grouping: `Weather`, `Redis`, `Rota`, `WeatherReportSender` organize related logic by domain.
- Resilience patterns:
  - Retry with exponential backoff + jitter for data.gov requests (`api/weather.api.ts` + `axios-retry`).
  - Queue-based outbound delivery for Telegram sends (`utils/bot/weatherReportSender.ts` + `p-queue`) to control throughput and reduce burst failures.
  - Per-chat send retry for transient Telegram failures (rate limits/network/server errors), with bounded attempts and delay logic.
  - Distributed lock (`api/redis.api.ts`) to avoid duplicate scheduled sends across multiple app instances.

### Queuing And Retries (Detailed)

- Outbound queueing
  - The bot uses a shared `PQueue` in `utils/bot/weatherReportSender.ts`.
  - Queue settings (`concurrency`, `intervalCap`, `interval`) smooth outbound traffic so scheduled blasts do not flood Telegram.
  - This is effectively a rate-limiter pattern applied at the message delivery layer.

- Telegram retry strategy
  - Each send/edit is wrapped in `sendWithRetry(...)`.
  - Retries are attempted for transient failures only, such as:
    - HTTP `429` (rate limit)
    - Telegram/server `5xx`
    - transient network errors (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, etc.)
  - Delay uses either Telegram `retry_after` (if provided) or exponential backoff with jitter.
  - Retries are bounded (`MAX_SEND_ATTEMPTS`) to avoid infinite loops.

- data.gov retry strategy
  - `api/weather.api.ts` configures `axios-retry` for API reads.
  - Retries include timeout/connection failures and retryable HTTP statuses (`408`, `429`, `5xx`).
  - Backoff uses exponential delay with jitter, and honors `retry-after` when available.

- Why this matters
  - Prevents message-loss spikes during transient outages.
  - Reduces webhook/scheduler burst pressure.
  - Keeps scheduled sends reliable without requiring a separate queue broker.

## Where To Edit For Specific Changes

- Change bot commands or callback behavior:
  - `bot.ts`
- Change schedule times/days:
  - `utils/bot/rule.ts`
- Change rota algorithm or anchor date:
  - `utils/schedule/rota.ts`
- Change subscription storage logic / Redis keying:
  - `api/redis.api.ts`
- Change weather fetch/retry/parsing/nearest-station logic:
  - `api/weather.api.ts`
- Change response text and formatting:
  - `utils/bot/replies.ts`
- Change weather send retry/queue behavior:
  - `utils/bot/weatherReportSender.ts`
- Change webhook security token behavior:
  - `utils/security/generateSecretToken.ts`
- Change env schema and required variables:
  - `utils/infra/env.ts`
- Change HTTP endpoints (`/health`, `/logs`, webhook middleware):
  - `index.ts`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env` with required values:

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

## How To Contribute

1. Create a branch from `main`.
2. Make focused changes with tests where behavior changes.
3. Run checks locally:

```bash
npm test
npm run build
```

4. Open a PR with:
- problem statement
- summary of behavior changes
- tests added/updated

## Deployment

### SaaS/services required

- Telegram Bot API (bot token via BotFather)
- Redis instance (managed or self-hosted)
- Public HTTPS endpoint reachable by Telegram webhook
- data.gov.sg API key

### SaaS/services not required

- Fly.io is optional (you can deploy anywhere with HTTPS + Node runtime)
- Docker is optional

### Fly.io deployment (repo has config)

`fly.toml` is included and configured for port `8080` in region `sin`.

High-level steps:

1. Create/provision Redis and collect credentials.
2. Configure Fly secrets/env vars (`BOT_ID`, `DATA_GOV_API_KEY`, `REDIS_*`, `HOST`, `PORT`, `NODE_ENV`).
3. Deploy to Fly.io.
4. Set `HOST` to your public HTTPS app URL.
5. Verify:
- `GET /health` returns healthy status.
- Telegram delivers updates to `POST /telegram-webhook`.

### Generic Docker deployment

```bash
docker build -t cda-weather-arms-bot .
docker run --rm -p 8080:8080 --env-file .env cda-weather-arms-bot
```
