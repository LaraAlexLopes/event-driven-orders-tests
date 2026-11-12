import { describe, expect, it } from 'vitest';

import { placeOrder } from '../src/clients/api';
import { database } from '../src/clients/database';
import { settings } from '../src/config';
import { buildOrder, createProduct, orderFor } from '../src/data';
import {
  validateEvents,
  validateFulfilled,
  validateJob,
  validateNoJob,
  validateNoReservation,
  validateOrderStatus,
  validatePayment,
  validateStock,
  validateStockUnchanged,
} from '../src/validations';

describe('Order lifecycle', () => {
  it('accepts the order as pending, then pays, reserves stock and fulfills it', async () => {
    const product = await createProduct({ stock: 10 });

    const { status, body: order } = await placeOrder(buildOrder(product, { quantity: 3 }));

    expect(status).toBe(201);
    expect(order).toMatchObject({ status: 'PENDING_PAYMENT', amountCents: product.priceCents * 3 });
    await validateFulfilled(order, product);
    await validateStock(product, 7);
    await validateJob(order.id, { state: 'completed' });
  });

  it('declines the payment of a declined card and never touches stock', async () => {
    const product = await createProduct();

    const order = await orderFor(product, { card: settings.cards.declined });

    await validateOrderStatus(order.id, 'PAYMENT_DECLINED');
    await validateEvents(order.id, ['order.created', 'order.payment_declined']);
    await validatePayment(order.id, 'DECLINED', order.amountCents);
    await validateNoReservation(order.id);
    await validateNoJob(order.id);
    await validateStockUnchanged(product);
  });

  it('marks the order out of stock when the stock is not enough, after charging', async () => {
    const product = await createProduct({ stock: 2 });

    const order = await orderFor(product, { quantity: 3 });

    await validateOrderStatus(order.id, 'OUT_OF_STOCK');
    await validateEvents(order.id, ['order.created', 'order.paid', 'order.out_of_stock']);
    await validateJob(order.id, { state: 'completed', attemptsMade: 1 });
    await validateNoReservation(order.id);
    await validateStockUnchanged(product);
  });

  const invalid = [
    { scenario: 'a zero quantity', changes: { quantity: 0 }, status: 400 },
    { scenario: 'a card that is not 16 digits', changes: { card: '1234' }, status: 400 },
    { scenario: 'a missing customer', changes: { customer: undefined }, status: 400 },
  ];
  for (const { scenario, changes, status } of invalid) {
    it(`rejects an order with ${scenario} without creating it or emitting events`, async () => {
      const product = await createProduct();

      const response = await placeOrder({ ...buildOrder(product), ...changes });

      expect(response.status).toBe(status);
      expect(await database.ordersFor(product.sku)).toEqual([]);
      await validateStockUnchanged(product);
    });
  }

  it('rejects an order for an unknown product with 422', async () => {
    const product = await createProduct();

    const response = await placeOrder(buildOrder({ ...product, sku: `${product.sku}-UNKNOWN` }));

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: 'unknown product' });
  });
});
