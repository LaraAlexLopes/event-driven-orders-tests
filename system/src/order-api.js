import Fastify from 'fastify';

import { config } from './config.js';
import { pool } from './db.js';
import { createEvent, ensureTopics, publish } from './kafka.js';

const app = Fastify({ logger: { level: 'warn' } });

const orderSchema = {
  body: {
    type: 'object',
    required: ['customer', 'sku', 'quantity', 'card'],
    additionalProperties: false,
    properties: {
      customer: { type: 'string', minLength: 1 },
      sku: { type: 'string', minLength: 1 },
      quantity: { type: 'integer', minimum: 1 },
      card: { type: 'string', pattern: '^[0-9]{16}$' },
    },
  },
};

const toResponse = order => ({
  id: order.id,
  customer: order.customer,
  sku: order.sku,
  quantity: order.quantity,
  amountCents: order.amount_cents,
  status: order.status,
});

const findByIdempotencyKey = async key =>
  (await pool.query('SELECT * FROM orders WHERE idempotency_key = $1', [key])).rows[0];

app.get('/health', async () => ({ status: 'ok' }));

app.get('/orders/:id', async (request, reply) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id::text = $1', [request.params.id]);
  if (!rows[0]) return reply.code(404).send({ error: 'order not found' });
  return toResponse(rows[0]);
});

app.post('/orders', { schema: orderSchema }, async (request, reply) => {
  const { customer, sku, quantity, card } = request.body;
  const idempotencyKey = request.headers['idempotency-key'] ?? null;

  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(idempotencyKey);
    if (existing) return reply.code(200).send(toResponse(existing));
  }

  const product = (await pool.query('SELECT price_cents FROM products WHERE sku = $1', [sku])).rows[0];
  if (!product) return reply.code(422).send({ error: 'unknown product' });

  let order;
  try {
    order = (
      await pool.query(
        `INSERT INTO orders (customer, sku, quantity, amount_cents, status, idempotency_key)
         VALUES ($1, $2, $3, $4, 'PENDING_PAYMENT', $5) RETURNING *`,
        [customer, sku, quantity, product.price_cents * quantity, idempotencyKey],
      )
    ).rows[0];
  } catch (error) {
    if (error.code === '23505' && idempotencyKey) {
      return reply.code(200).send(toResponse(await findByIdempotencyKey(idempotencyKey)));
    }
    throw error;
  }

  await publish(createEvent('order.created', order.id, { sku, quantity, amountCents: order.amount_cents, card }));
  return reply.code(201).send(toResponse(order));
});

await ensureTopics();
await app.listen({ host: '0.0.0.0', port: config.port });
