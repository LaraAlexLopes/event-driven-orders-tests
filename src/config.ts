import path from 'node:path';

export const settings = {
  apiUrl: process.env.API_URL ?? 'http://localhost:3100',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://orders:orders@localhost:5433/orders',
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(','),
  redis: { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6380) },
  composeFile: path.resolve(import.meta.dirname, '../docker/docker-compose.yml'),
  topics: { events: 'order-events', deadLetter: 'order-events.dlq' },
  queue: 'reserve-stock',
  cards: { approved: '4242424242424242', declined: '4000000000000002' },
  maxAttempts: 3,
};

export const runId = Date.now().toString(36);
