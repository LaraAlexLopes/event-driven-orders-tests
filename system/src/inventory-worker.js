import { UnrecoverableError, Worker } from 'bullmq';

import { config, redisConnection } from './config.js';
import { pool, transaction } from './db.js';
import { createEvent, ensureTopics, publish } from './kafka.js';

const FAULTS = {
  transient: 'FLAKY-',
  permanent: 'BROKEN-',
};

const setStatus = (client, orderId, status) =>
  client.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [orderId, status]);

const reserve = ({ orderId, sku, quantity }) =>
  transaction(async client => {
    const product = (await client.query('SELECT stock FROM products WHERE sku = $1 FOR UPDATE', [sku])).rows[0];
    if (!product || product.stock < quantity) {
      await setStatus(client, orderId, 'OUT_OF_STOCK');
      return 'order.out_of_stock';
    }

    const reservation = await client.query(
      'INSERT INTO inventory_reservations (order_id, sku, quantity) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [orderId, sku, quantity],
    );
    if (reservation.rowCount === 0) return null;

    await client.query('UPDATE products SET stock = stock - $2 WHERE sku = $1', [sku, quantity]);
    await setStatus(client, orderId, 'FULFILLED');
    return 'order.fulfilled';
  });

const handleJob = async job => {
  const { orderId, sku } = job.data;
  if (sku.startsWith(FAULTS.transient) && job.attemptsMade < config.retry.attempts - 1) {
    throw new Error(`transient failure on attempt ${job.attemptsMade + 1}`);
  }
  if (sku.startsWith(FAULTS.permanent)) {
    throw new Error('warehouse service unavailable');
  }

  const outcome = await reserve(job.data);
  if (outcome) await publish(createEvent(outcome, orderId, { attempts: job.attemptsMade + 1 }));
  return outcome;
};

await ensureTopics();

const worker = new Worker(config.queue, handleJob, { connection: redisConnection(), concurrency: 5 });

worker.on('failed', async (job, error) => {
  if (!job || error instanceof UnrecoverableError) return;
  if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
  await pool.query(`UPDATE orders SET status = 'FULFILLMENT_FAILED', updated_at = now() WHERE id = $1`, [
    job.data.orderId,
  ]);
  await publish(createEvent('order.fulfillment_failed', job.data.orderId, { reason: error.message }));
});

const shutdown = async () => {
  await worker.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
