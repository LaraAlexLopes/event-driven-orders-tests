import { Redis } from 'ioredis';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://orders:orders@localhost:5433/orders',
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(','),
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6380),
  },
  topics: {
    events: 'order-events',
    deadLetter: 'order-events.dlq',
  },
  queue: 'reserve-stock',
  declinedCard: '4000000000000002',
  retry: { attempts: 3, delayMs: 200 },
};

export const redisConnection = () =>
  new Redis({ host: config.redis.host, port: config.redis.port, maxRetriesPerRequest: null });
