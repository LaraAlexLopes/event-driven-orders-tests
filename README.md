# Event-driven Orders: E2E Tests

[![Event-driven E2E](https://github.com/LaraAlexLopes/event-driven-orders-tests/actions/workflows/e2e.yml/badge.svg)](https://github.com/LaraAlexLopes/event-driven-orders-tests/actions/workflows/e2e.yml)

End-to-end tests for an event-driven order system built on **Kafka**, **BullMQ** and **PostgreSQL**, written with **Vitest** and **TypeScript**.

In an asynchronous system, `201 Created` only means the request was accepted. Each test follows the order through every hop (API, events, queue, database) and checks the final effect: the payment stored once, the stock reserved once, the right events in the right order. Some tests also stop or kill services along the way.

## The system under test

A small order system lives in [`system/`](system), so the tests run against real brokers in Docker.

```
            POST /orders                order.created               reserve-stock job
 client ──▶  order-api  ──▶  Kafka (order-events)  ──▶  payment-worker  ──▶  BullMQ  ──▶  inventory-worker
                │                                           │                                  │
                ▼                                           ▼                                  ▼
            PostgreSQL ◀──────────── orders, payments, inventory_reservations ──────────────────┘
                                                            │                                  │
                                        order.paid / order.payment_declined     order.fulfilled / order.out_of_stock
                                                            └──────────▶ Kafka (order-events) ◀─┘
```

| Component          | Responsibility                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order-api`        | Validates the order, stores it as `PENDING_PAYMENT`, publishes `order.created`. Supports `Idempotency-Key`.                                           |
| `payment-worker`   | Kafka consumer. Charges the order (`PAID` or `PAYMENT_DECLINED`) once per event, enqueues the stock job. Malformed messages go to `order-events.dlq`. |
| `inventory-worker` | BullMQ worker. Reserves stock with a row lock (`FULFILLED` or `OUT_OF_STOCK`), retries 3 times, then marks `FULFILLMENT_FAILED`.                      |

Redpanda provides the Kafka API with a fraction of the memory. **Fault injection:** products with a `FLAKY-` SKU fail the first two stock attempts, and `BROKEN-` SKUs always fail, so retries and dead-ending can be tested on purpose.

## What is covered

**18 tests and 1 known issue.**

| Area            | Scenarios                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Order lifecycle | Happy path (pending → paid → fulfilled), declined card, out of stock after payment, 3 invalid payloads (400), unknown product (422) |
| Idempotency     | Same `Idempotency-Key` retried and sent 5 times concurrently, a redelivered `order.created` event (no second charge or reservation) |
| Retries         | Transient failure recovered on the 3rd attempt, permanent failure dead-ends as `FULFILLMENT_FAILED` after 3 attempts                |
| Poison messages | Message that is not JSON, and event without an order id: both go to the dead-letter topic and consumption continues                 |
| Concurrency     | Two orders for the last unit (exactly one wins), 20 orders for 15 units (15 fulfilled, 5 out of stock, stock never negative)        |
| Resilience      | Payment worker down (order waits, completes after restart), inventory worker down (job waits, completes after restart)              |

Each scenario checks more than the status:

- **Events:** the exact sequence on `order-events` for that order, read by a Kafka consumer owned by the tests.
- **Database:** order status, one payment row, one reservation row, the stock after the order.
- **Queue:** the BullMQ job state, `attemptsMade` and `failedReason`.
- **Negative checks:** where nothing should happen, `consistently()` keeps checking for a few seconds instead of asserting once.

## Findings

### KI-01: an order gets stuck in `PAID` if the payment worker crashes at the wrong moment

The payment worker commits the payment, and marks the event as processed, **before** it enqueues the stock job. If it crashes in between, Kafka redelivers the event, but the worker skips it as already processed. The order stays `PAID` forever: charged, never fulfilled.

The test reproduces it deterministically: it stops Redis so the enqueue hangs, waits for `PAID`, kills the worker (`SIGKILL`), and brings Redis and the worker back. The order never reaches `FULFILLED`. It runs with `it.fails`, so it passes while the defect exists and fails once it is fixed.

This is the dual-write problem. The usual fix is a **transactional outbox**: store the "enqueue stock job" intent in the same database transaction as the payment, and let a relay publish it.

The bug was first noticed during the initial smoke test, when a BullMQ configuration error made every enqueue fail, and every paid order got stuck in `PAID`.

## How the tests observe the system

```
src/
├── clients/
│   ├── api.ts        HTTP client for order-api
│   ├── database.ts   reads orders, payments, reservations and stock
│   ├── events.ts     EventLog: a Kafka consumer that records every event and dead letter during the run
│   ├── queue.ts      reads BullMQ job state
│   └── services.ts   stops, kills and starts containers (docker compose)
├── data.ts           Faker products and orders, with normal, flaky and broken SKUs
├── eventually.ts     eventually() and consistently() for asynchronous assertions
├── validations.ts    validateFulfilled, validateEvents, validateJob, validateDeadLetter…
└── setup.ts          starts the EventLog per file and deletes the file's products afterwards
```

A test reads as arrange → act → validate:

```ts
it('recovers from transient failures by retrying the job until it succeeds', async () => {
  const product = await createProduct({ behaviour: 'flaky', stock: 5 });

  const order = await orderFor(product);

  await validateFulfilled(order, product);
  await validateJob(order.id, { state: 'completed', attemptsMade: 3 });
  await validateStock(product, 4);
});
```

## Engineering notes

- **The smoke test found a configuration bug first.** BullMQ 6 made `ioredis` optional, and in ESM it needs an already-built client. The error was swallowed inside the Kafka consumer, so orders stopped at `PAID` with no visible failure. That is also how KI-01 was spotted.
- **Faster rebalancing after a crash.** A killed consumer is only removed after the session timeout (30 s by default). The payment worker uses 10 s, so the crash tests stay under a minute.
- **The API healthcheck used IPv4 on purpose.** In the Alpine image, `localhost` resolves to `::1`, while the API listens on `0.0.0.0`.
- **Test files run one at a time** (`fileParallelism: false`), because the resilience tests stop shared containers. Inside each file, data is isolated by unique SKUs.

## Running locally

**Requirements:** Node 24 (`nvm use`) and Docker. The stack uses about 1.5 GB of memory.

```bash
nvm use
npm install
npm run system:up      # PostgreSQL, Redis, Redpanda and the three services, waiting until healthy
npm test               # about 2 minutes, including the crash scenarios
npm run system:logs    # service logs when something fails
npm run system:down    # removes containers and volumes
```

## CI

[`.github/workflows/e2e.yml`](.github/workflows/e2e.yml) runs lint, typecheck and format, then starts the stack and runs the suite. The JUnit report is uploaded as an artifact, and the service logs are printed when a test fails.

## Conventions

- Code, test names, commits and docs are in English.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint.
- The pre-commit hook runs lint, typecheck and the format check.

## Author

**Lara Lopes**, QA Engineer · [LinkedIn](https://linkedin.com/in/laraalexandralopes) · [GitHub](https://github.com/LaraAlexLopes)
