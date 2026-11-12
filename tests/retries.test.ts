import { describe, expect, it } from 'vitest';

import { settings } from '../src/config';
import { createProduct, orderFor } from '../src/data';
import { eventLog } from '../src/system';
import {
  validateEvents,
  validateFulfilled,
  validateJob,
  validateNoReservation,
  validateOrderStatus,
  validateStock,
  validateStockUnchanged,
} from '../src/validations';

describe('Stock reservation retries (BullMQ)', () => {
  it('recovers from transient failures by retrying the job until it succeeds', async () => {
    const product = await createProduct({ behaviour: 'flaky', stock: 5 });

    const order = await orderFor(product);

    await validateFulfilled(order, product);
    await validateJob(order.id, { state: 'completed', attemptsMade: settings.maxAttempts });
    const fulfilled = eventLog.forOrder(order.id).find(event => event.type === 'order.fulfilled');
    expect(fulfilled?.data).toEqual({ attempts: settings.maxAttempts });
    await validateStock(product, 4);
  });

  it('gives up after the last attempt and marks the order as failed to fulfill', async () => {
    const product = await createProduct({ behaviour: 'broken', stock: 5 });

    const order = await orderFor(product);

    await validateOrderStatus(order.id, 'FULFILLMENT_FAILED');
    await validateEvents(order.id, ['order.created', 'order.paid', 'order.fulfillment_failed']);
    await validateJob(order.id, {
      state: 'failed',
      attemptsMade: settings.maxAttempts,
      failedReason: 'warehouse service unavailable',
    });
    await validateNoReservation(order.id);
    await validateStockUnchanged(product);
  });
});
