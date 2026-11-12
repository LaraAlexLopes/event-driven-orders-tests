import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { placeOrder } from '../src/clients/api';
import { database } from '../src/clients/database';
import { buildOrder, createProduct, orderFor } from '../src/data';
import { eventLog } from '../src/system';
import { validateEvents, validateFulfilled, validateStock } from '../src/validations';
import { consistently } from '../src/eventually';

describe('Idempotency', () => {
  it('creates a single order when the same request is retried with the same Idempotency-Key', async () => {
    const product = await createProduct({ stock: 10 });
    const request = buildOrder(product, { quantity: 2 });
    const key = randomUUID();

    const first = await placeOrder(request, key);
    const retry = await placeOrder(request, key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    expect(await database.ordersFor(product.sku)).toHaveLength(1);
    await validateFulfilled(first.body, product);
    await validateStock(product, 8);
  });

  it('creates a single order when the same Idempotency-Key arrives concurrently', async () => {
    const product = await createProduct({ stock: 10 });
    const request = buildOrder(product);
    const key = randomUUID();

    const responses = await Promise.all(Array.from({ length: 5 }, () => placeOrder(request, key)));

    expect(new Set(responses.map(response => response.body.id)).size).toBe(1);
    expect(responses.filter(response => response.status === 201)).toHaveLength(1);
    expect(await database.ordersFor(product.sku)).toHaveLength(1);
    await validateFulfilled(responses[0].body, product);
    await validateStock(product, 9);
  });

  it('ignores a redelivered order.created event: no second charge, reservation or event', async () => {
    const product = await createProduct({ stock: 10 });
    const order = await orderFor(product, { quantity: 4 });
    await validateFulfilled(order, product);
    const created = eventLog.forOrder(order.id).find(event => event.type === 'order.created');

    await eventLog.publishRaw(JSON.stringify(created), order.id);

    await consistently(async () => {
      expect(await database.paymentsFor(order.id)).toBe(1);
      expect(await database.stock(product.sku)).toBe(6);
    });
    await validateEvents(order.id, ['order.created', 'order.paid', 'order.fulfilled', 'order.created']);
  });
});
