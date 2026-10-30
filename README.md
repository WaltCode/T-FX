# Harmattan

> The Harmattan is the West African trade wind that crosses borders every year. This one carries money.

Harmattan is the backend for a cross-border payments sandbox built on mock stablecoins: **cNGN, cGHS, cXAF, USDx and EURx**.
It covers wallets, simulated deposits, FX swaps, cross-currency transfers, transaction history and live conversion rates.
The focus is on getting money right: exact arithmetic, a double-entry ledger, idempotent writes, concurrency-safe debits
and FX that keeps working when the rate provider doesn't.

---

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:8907
- Swagger UI: http://localhost:8907/docs (the spec is also committed as [`openapi.json`](openapi.json))
- Health: http://localhost:8907/health

Compose starts Postgres and Redis, waits for their healthchecks, runs the migrations once in a one-shot `migrate`
service, and then starts the API. Set `FX_PROVIDER=static` to run fully offline against the fixed rate table.

### Running without Docker

Run Postgres 16 and Redis 7 locally, point `.env` at them, then:

```bash
yarn install
yarn migration:run
yarn dev
```

Migrations are generated from the entities:

```bash
npm run migration:generate --name=Init   # sets $npm_config_name
yarn migration:run
yarn migration:revert
```

## Tests

```bash
yarn test        # unit + e2e
yarn test:unit   # money maths, FX state machine (no Docker needed)
yarn test:e2e    # full API against real Postgres + Redis
```

The e2e suite uses Testcontainers, so Docker must be running. It starts throwaway Postgres and Redis containers,
applies the real migrations with `yarn migration:run`, and drives the HTTP API with Supertest.
The FX provider is replaced with a deterministic fake (1 USDx = 1500 cNGN = 15 cGHS = 600 cXAF = 0.9 EURx).

The suite covers:
- **Wallets:** creation by email or phone, duplicates (409), validation, totals in USD
- **Money movement:**
  - deposits
  - swap rounding
  - insufficient funds
  - same-currency and cross-currency transfers, with a full audit trail
- **History:** filtering by type and currency, and cursor pagination
- **Ledger:** single transactions with their ledger entries
- **Rates:** the full rate matrix
- **Idempotency:** replays, key reuse with a different body, and 10 parallel duplicates producing exactly one transaction
- **Concurrency:**
  - 50 parallel swaps against a balance that covers 20 (exactly 20 succeed, and the balance never goes negative)
  - two wallets paying each other simultaneously without deadlocking
- **Ledger invariants:** every currency nets to zero, and every balance equals the sum of its ledger entries
- **Redis:**
  - cache invalidation, including for the receiving wallet and cached history pages
  - 429 rate limiting
  - an FX refresh on one instance reaching another
  - provider outage (FALLBACK, then back to LIVE)
  - a full Redis outage, where everything still works from Postgres

## Tech stack

| Area | Choice | Why |
|---|---|---|
| Runtime | Node.js 22, TypeScript (strict), ESM | Required by the brief |
| Framework | NestJS 12 | Modules, DI, pipes/guards/filters, first-class Swagger |
| Database | **PostgreSQL 16** via TypeORM (custom repositories) | See below |
| Cache / rate limit | **Redis 7** via `redis` (node-redis) | Shared state across instances for non-critical data |
| Money maths | Native `BigInt` + `decimal.js` | No floating point anywhere in a money path |
| Validation / docs | class-validator, @nestjs/swagger | DTOs drive both validation and the OpenAPI spec |
| Tests | Vitest, Supertest, Testcontainers | Real Postgres row locks and real Redis in e2e |
| Tooling | Yarn, ESLint, Prettier, Docker Compose | Required by the brief |

### Why PostgreSQL

A transfer changes two wallets, and a swap changes two balances. Both must happen together or not at all.
Postgres provides:
- **ACID multi-row transactions**
- **row-level locking**, so concurrent debits on one balance queue instead of racing
- **exact integer and decimal types**
- **constraints** that enforce invariants in the database itself, even if application code has a bug:
  - `UNIQUE (email)` and `UNIQUE (phone)`
  - `UNIQUE (wallet_id, idempotency_key)`
  - `CHECK (amount >= 0)` on balances

MongoDB can do multi-document transactions, but a ledger is relational data with hard invariants, and that's what Postgres is built for.

### Why Redis, and where it isn't used

Redis is used only where several API instances need to share state that isn't money:

- **Rate limiting:**
  - 120 requests/min per IP globally
  - 5 wallet creations/min per IP
  - 30 deposits, swaps and transfers/min per wallet
  - One atomic Lua script (`INCR` + `PEXPIRE`) per check. Responses carry `X-RateLimit-*` headers, and a 429 also carries `Retry-After`.
- **Read caching with versioned invalidation** (see below).
- **FX fan-out:**
  - one instance holds a refresh lock (`SET NX PX`) and calls the provider
  - it broadcasts the new rates on `fx:updated`
  - every instance updates its in-memory copy

Balances, the ledger and idempotency records **never** live in Redis. They must commit atomically with the money movement,
and Redis can't take part in a Postgres transaction. Every Redis call **fails open**: if Redis is down, requests are served
from Postgres, rate limiting is skipped, each instance refreshes FX for itself, and `/health` reports `redis: down`.

## Architecture

```
src/
  config/              AppConfig (env), BaseEntity, TypeOrmRepository
  common/              money maths, currencies, FX types/providers, errors, Idempotency-Key decorator, error filter
  database/            TypeORM config, CLI datasource, migrations, system ledger accounts, pg error helpers
  redis/               RedisService (cache, versioned invalidation, rate limit, lock, pub/sub), keys
  guard/               RateLimitGuard (global)
  modules/
    wallet/            wallets + balances (entities, repositories, service, controller)
    fx/                rates (entity, repository, refresher/quoting service, controller)
    transaction/       transactions, ledger entries, idempotency records; LedgerService; deposits/swaps/transfers/history
    health/
```

A money request goes **controller → TransactionService → LedgerService.runIdempotent → LedgerService.post**.
`LedgerService` is the only code that changes balances.

## Data model

| Table | Purpose | Key constraints |
|---|---|---|
| `wallets` | One per customer | `email` unique, `phone` unique, at least one required |
| `balances` | One row per (wallet, currency), created with the wallet | `UNIQUE (wallet_id, currency)`, `CHECK (amount >= 0)` |
| `transactions` | One business event (deposit, swap, transfer) | `UNIQUE (wallet_id, idempotency_key)`, history indexes on `(wallet_id, internalId)` and `(counterparty_wallet_id, internalId)` |
| `ledger_entries` | Signed legs of each transaction | `amount <> 0`; the legs of one transaction sum to zero per currency |
| `idempotency_records` | Claimed key, request hash, stored response | `UNIQUE (scope, key)` |
| `fx_rates` | Last good live rate per currency (units per 1 USD) | `currency` unique, `per_usd > 0` |

Every table extends a shared base entity: `internalId` (bigint PK, also the history cursor), a public `id` (UUID),
and `createdAt` / `updatedAt` / `deletedAt`.

**Double-entry with system accounts.** Two fixed ledger accounts take the other side of every movement:
`MINT` funds deposits, and `FX_POOL` buys and sells currencies in conversions. They have no `balances` rows; their balance
is the sum of their ledger entries. Without balance rows, there's no single hot row that every deposit and swap in
the system would have to lock.

| Event | Ledger legs |
|---|---|
| Deposit 100 USDx | MINT −100 USDx · user +100 USDx |
| Swap 15 500 cNGN → 10 USDx | user −15 500 cNGN · FX_POOL +15 500 cNGN · FX_POOL −10 USDx · user +10 USDx |
| Transfer 40 USDx | sender −40 USDx · receiver +40 USDx |
| Transfer 5 USDx → 77.5 cGHS | sender −5 USDx · FX_POOL +5 USDx · FX_POOL −77.5 cGHS · receiver +77.5 cGHS |

## How the hard parts are handled

### Money precision
- Every amount is stored as a `bigint` count of **micro-units (6 dp)** and handled as a native `BigInt` in code. There are no floats.
- The API takes and returns amounts as **decimal strings** (`"1500.25"` in, `"1500.250000"` out).
  - JSON numbers are rejected.
  - So are amounts with more than 6 decimals, zero, negatives and exponent notation.
  - One operation is capped at 1 trillion units.
- Conversion uses the exact ratio of the two USD rates at 60 significant digits, then **rounds down** to a whole micro-unit.
  A customer is never credited more than the rate allows, and the sub-micro-unit remainder stays with `FX_POOL`.
  Conversions that round to zero are rejected (`AMOUNT_TOO_SMALL`).
- Rates are stored as `numeric(36,18)` and returned as strings truncated to 18 dp.

### Idempotency ("never process the same request twice")
- Every deposit, swap and transfer requires an **`Idempotency-Key`** header. Keys are scoped per wallet.
- Inside the **same database transaction** as the money movement, the key is claimed first with
  `INSERT … ON CONFLICT (scope, key) DO NOTHING`.
  - **Claimed:** do the work, store the response, then commit. The key and the money commit or roll back together.
  - **Already exists** (a concurrent duplicate blocks on the unique index until the first request commits):
    - same request hash: the stored response is replayed with `Idempotent-Replayed: true`
    - different body: **422 `IDEMPOTENCY_KEY_REUSED`**
- Only successful responses are stored. A request that failed, say for insufficient funds, rolled back its claim and can be
  retried with the same key.

### Concurrency
- Debits are one atomic statement:
  `UPDATE balances SET amount = amount + $delta WHERE … AND amount + $delta >= 0 RETURNING amount`.
  The row lock, the overdraft check and the write happen together, so two debits can't both pass a stale check.
  The `CHECK (amount >= 0)` constraint is a backstop.
- Within each transaction, balance rows are always locked in the same order, sorted by `(wallet_id, currency)`.
  Two wallets paying each other at the same moment therefore can't deadlock.
- The whole transaction is retried, up to 3 times with jitter, on Postgres serialization or deadlock errors.

### FX rates and provider failure
- **Provider:** [open.er-api.com](https://open.er-api.com) (free, no key, covers NGN, GHS, XAF and EUR). Each stablecoin is pegged 1:1 to its fiat.
  All rates are stored against USD, so cross rates are `perUsd[to] / perUsd[from]`.
- **Refreshing:** in the background on boot and every `FX_REFRESH_MS` (5 min), never on the request path. Each refresh uses a 3s timeout and one retry.
- **Validation:** all five rates must be present and positive.
- **Where rates go:** a successful refresh is saved to Postgres (`fx_rates`) and Redis, and broadcast to the other instances.
- **Fallback order:**

  | Source | When |
  |---|---|
  | **LIVE** | fetched within 2 refresh intervals |
  | **CACHED** | the provider is failing; last good live rates, up to `FX_MAX_STALENESS_MS` (24h) old |
  | **FALLBACK** | the static rate table |

  Swaps and transfers keep working throughout.
- Every swap and transfer records the `rate`, `rateSource` and `rateAsOf` it used. `GET /rates` returns all 20 pairs with
  `fetchedAt`, `source` and `stale`.

### Caching and invalidation
- **Wallet views and history pages** are cached under keys that include a per-wallet version number, for example `wallet:{id}:v{ver}:view`.
- **Invalidation:** after a money movement **commits**, the version is incremented for every wallet involved, including the receiver of a transfer. That one `INCR` invalidates the wallet view and every cached history page and filter.
  - **The race it closes:** a slow reader that loaded the old balance just before a commit writes its entry under the old
    version, which nothing reads any more. A plain `DEL` would leave that race open.
  - **Safety net:** entries also expire after 60s, in case an invalidation is lost.
- **Transaction lookups** are cached for an hour without invalidation, because transactions never change.
- **Not cached:** the overdraft check and the existence checks before moving money always read Postgres.
- `totalUsd` is computed when the wallet is read, so a rate change never needs to invalidate wallet caches.

## API walkthrough

Example values below come from `FX_PROVIDER=static` (1 USDx = 1550 cNGN = 15.5 cGHS = 605 cXAF = 0.92 EURx).
Ids are shortened.

**Create a wallet** (email and/or E.164 phone; duplicates get 409)
```http
POST /wallets
{ "email": "ada@example.com" }

201
{
  "id": "6f1c…",
  "email": "ada@example.com",
  "phone": null,
  "balances": [
    { "currency": "cNGN", "amount": "0.000000" }, { "currency": "cGHS", "amount": "0.000000" },
    { "currency": "cXAF", "amount": "0.000000" }, { "currency": "USDx", "amount": "0.000000" },
    { "currency": "EURx", "amount": "0.000000" }
  ],
  "totalUsd": { "currency": "USDx", "amount": "0.000000", "rateSource": "LIVE", "ratesAsOf": "2026-10-30T09:00:00.000Z" },
  "createdAt": "2026-10-30T09:00:01.000Z"
}
```

**Deposit**
```http
POST /wallets/6f1c…/deposits
Idempotency-Key: 9b2e4c1a-dep-001
{ "currency": "cNGN", "amount": "155000" }

201
{
  "id": "a41d…", "type": "DEPOSIT", "status": "COMPLETED", "walletId": "6f1c…", "counterpartyWalletId": null,
  "direction": "IN",
  "source": { "currency": "cNGN", "amount": "155000.000000" },
  "destination": { "currency": "cNGN", "amount": "155000.000000" },
  "rate": null, "rateSource": null, "rateAsOf": null, "createdAt": "…",
  "entries": [
    { "walletId": "00000000-…-0001", "currency": "cNGN", "amount": "-155000.000000", "balanceAfter": null },
    { "walletId": "6f1c…", "currency": "cNGN", "amount": "155000.000000", "balanceAfter": "155000.000000" }
  ]
}
```
Sending the same request with the same key returns the same body with `Idempotent-Replayed: true`.

**Swap**
```http
POST /wallets/6f1c…/swaps
Idempotency-Key: 9b2e4c1a-swp-001
{ "fromCurrency": "cNGN", "toCurrency": "USDx", "amount": "15500" }

201
{
  "type": "SWAP", "direction": "INTERNAL",
  "source": { "currency": "cNGN", "amount": "15500.000000" },
  "destination": { "currency": "USDx", "amount": "10.000000" },
  "rate": "0.00064516129032258", "rateSource": "LIVE", "rateAsOf": "…", "entries": [ …4 legs… ], …
}
```
Insufficient balance:
```json
422 { "error": { "code": "INSUFFICIENT_FUNDS", "message": "Insufficient cNGN balance",
                 "details": { "currency": "cNGN", "available": "139500.000000", "required": "999999.000000" } } }
```

**Transfer** (`destinationCurrency` is optional; when it differs from `sourceCurrency`, the amount is converted at the current rate)
```http
POST /wallets/6f1c…/transfers
Idempotency-Key: 9b2e4c1a-trf-001
{ "toWalletId": "c09a…", "sourceCurrency": "USDx", "destinationCurrency": "cGHS", "amount": "5" }

201
{
  "type": "TRANSFER", "walletId": "6f1c…", "counterpartyWalletId": "c09a…", "direction": "OUT",
  "source": { "currency": "USDx", "amount": "5.000000" },
  "destination": { "currency": "cGHS", "amount": "77.500000" },
  "rate": "15.5", "rateSource": "LIVE", "rateAsOf": "…", "createdAt": "…", …
}
```

**Balances**
```http
GET /wallets/6f1c…

200 { …, "balances": [ { "currency": "cNGN", "amount": "139500.000000" }, …, { "currency": "USDx", "amount": "5.000000" }, … ],
      "totalUsd": { "currency": "USDx", "amount": "95.000000", … } }
```

**History** (newest first; filter by `type` and `currency`; paginate with `cursor`)
```http
GET /wallets/6f1c…/transactions?currency=USDx&limit=2

200 { "data": [ { "type": "TRANSFER", "direction": "OUT", … }, { "type": "SWAP", "direction": "INTERNAL", … } ],
      "nextCursor": null }
```
The currency filter works from the wallet's point of view: what it sent, what it received, or either side of its own swap.
Pass `nextCursor` back as `?cursor=` to get the next page.

**One transaction with its ledger entries:** `GET /transactions/{id}`

**Rates**
```http
GET /rates

200 { "base": "USDx", "source": "LIVE", "fetchedAt": "…", "stale": false,
      "usdRates": { "USDx": "1", "EURx": "0.92", "cNGN": "1550", "cGHS": "15.5", "cXAF": "605" },
      "rates": [ { "from": "cNGN", "to": "cGHS", "rate": "0.01", "source": "LIVE", "fetchedAt": "…" }, …20 pairs ] }
```

**Errors** always have the same shape, `{ "error": { "code", "message", "details?" } }`:

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_AMOUNT`, `IDENTIFIER_REQUIRED`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID` |
| 404 | `WALLET_NOT_FOUND`, `RECIPIENT_NOT_FOUND`, `TRANSACTION_NOT_FOUND` |
| 409 | `WALLET_ALREADY_EXISTS` |
| 422 | `INSUFFICIENT_FUNDS`, `SAME_CURRENCY_SWAP`, `SELF_TRANSFER`, `AMOUNT_TOO_SMALL`, `IDEMPOTENCY_KEY_REUSED` |
| 429 | `RATE_LIMITED` |

## Assumptions

- Stablecoins are pegged 1:1 to their fiat, so fiat FX rates are stablecoin rates. There are no fees or spreads.
- Every stablecoin uses 6 decimal places, like USDC.
- There is no authentication, as the brief allows. Whoever knows a wallet id can act on it. Emails are lower-cased;
  phone numbers must be E.164.
- Deposits are simulated and complete synchronously, so every transaction is `COMPLETED`.
- Rate limits are per IP (global, wallet creation) and per wallet (money movement), behind one trusted proxy.

## Known limitations

- **No foreign keys:** they aren't declared between tables (the migrations are generated from entities without relations).
  Existence is enforced in the service layer inside the same transaction.
- **Uneven quotes across instances:** briefly, after a refresh, instances can quote slightly different rates until the
  broadcast arrives. Each transaction records the exact rate it used.
- **Cache staleness:** if Redis drops an invalidation, a cached wallet view can be stale for up to 60s. It's display only;
  balance checks always hit Postgres.
- **Rate-limit windows:** they are fixed windows, so up to 2× the limit can get through across a window boundary.
- **Idempotency records** are kept forever. Production would purge them after about 24 hours.

## With more time

- Authentication (API keys or JWT) and per-owner authorization on wallets
- Swap quotes that lock a rate for 30 seconds, plus configurable fees and spreads
- A transactional outbox feeding a queue (e.g. BullMQ) for webhooks and notifications
- Foreign keys via TypeORM relations; time-partitioned `ledger_entries`; read replicas for history
- A sliding-window rate limiter; a cleanup job for idempotency records
- Observability: metrics on FX source, cache hit rate and lock waits; distributed tracing
- Postman collection and contract tests generated from the OpenAPI spec
