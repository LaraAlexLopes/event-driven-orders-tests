import { Queue } from 'bullmq';

import { config, redisConnection } from './config.js';
import { transaction } from './db.js';
import { createEvent, ensureTopics, kafka, publish } from './kafka.js';

const CONSUMER = 'payment-service';
const queue = new Queue(config.queue, { connection: redisConnection() });
const consumer = kafka.consumer({ groupId: CONSUMER, sessionTimeout: 10_000, heartbeatInterval: 1_000 });

const parse = value => {
  try {
    const event = JSON.parse(value);
    if (!event.eventId || !event.type || !event.orderId) return { error: 'missing eventId, type or orderId' };
    return { event };
  } catch {
    return { error: 'invalid JSON' };
  }
};

const sendToDeadLetter = (raw, reason) =>
  publish({ reason, consumer: CONSUMER, payload: raw, failedAt: new Date().toISOString() }, config.topics.deadLetter);

const charge = event =>
  transaction(async client => {
    const firstTime = await client.query(
      'INSERT INTO processed_events (event_id, consumer) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id',
      [event.eventId, CONSUMER],
    );
    if (firstTime.rowCount === 0) return null;

    const approved = event.data.card !== config.declinedCard;
    const status = approved ? 'PAID' : 'PAYMENT_DECLINED';
    const updated = await client.query(
      `UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 AND status = 'PENDING_PAYMENT' RETURNING id`,
      [event.orderId, status],
    );
    if (updated.rowCount === 0) return null;

    await client.query(
      'INSERT INTO payments (order_id, status, amount_cents) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [event.orderId, approved ? 'APPROVED' : 'DECLINED', event.data.amountCents],
    );
    return approved;
  });

const handle = async raw => {
  const { event, error } = parse(raw);
  if (error) return sendToDeadLetter(raw, error);
  if (event.type !== 'order.created') return;

  const approved = await charge(event);
  if (approved === null) return;

  if (!approved) {
    await publish(createEvent('order.payment_declined', event.orderId));
    return;
  }

  await publish(createEvent('order.paid', event.orderId, { amountCents: event.data.amountCents }));
  await queue.add(
    'reserve',
    { orderId: event.orderId, sku: event.data.sku, quantity: event.data.quantity },
    {
      jobId: event.orderId,
      attempts: config.retry.attempts,
      backoff: { type: 'fixed', delay: config.retry.delayMs },
      removeOnComplete: false,
      removeOnFail: false,
    },
  );
};

await ensureTopics();
await consumer.connect();
await consumer.subscribe({ topic: config.topics.events, fromBeginning: true });
await consumer.run({ eachMessage: ({ message }) => handle(message.value?.toString() ?? '') });

const shutdown = async () => {
  await consumer.disconnect();
  await queue.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
