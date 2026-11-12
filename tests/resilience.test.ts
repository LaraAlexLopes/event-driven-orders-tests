import { afterEach, describe, it } from 'vitest';

import { services } from '../src/clients/services';
import { createProduct, orderFor } from '../src/data';
import {
  validateFulfilled,
  validateJob,
  validateOrderStatus,
  validateOrderStaysIn,
  validateStock,
} from '../src/validations';

describe('Resilience', () => {
  afterEach(async () => {
    await Promise.all([services.start('payment-worker'), services.start('inventory-worker')]);
  });

  it('keeps an order pending while the payment worker is down and completes it once the worker is back', async () => {
    const product = await createProduct({ stock: 3 });
    await services.stop('payment-worker');

    const order = await orderFor(product);

    await validateOrderStaysIn(order.id, 'PENDING_PAYMENT', 5_000);
    await services.start('payment-worker');
    await validateFulfilled(order, product, 45_000);
    await validateStock(product, 2);
  });

  it('keeps the stock job waiting while the inventory worker is down and completes it once the worker is back', async () => {
    const product = await createProduct({ stock: 3 });
    await services.stop('inventory-worker');

    const order = await orderFor(product);

    await validateOrderStatus(order.id, 'PAID');
    await validateJob(order.id, { state: 'waiting' });
    await validateOrderStaysIn(order.id, 'PAID', 3_000);
    await services.start('inventory-worker');
    await validateFulfilled(order, product, 45_000);
    await validateStock(product, 2);
  });
});
