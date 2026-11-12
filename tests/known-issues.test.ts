import { afterEach, describe, it } from 'vitest';

import { services } from '../src/clients/services';
import { createProduct, orderFor } from '../src/data';
import { validateFulfilled, validateOrderStatus } from '../src/validations';

describe('Known issues', () => {
  afterEach(async () => {
    await services.start('redis');
    await services.start('payment-worker');
  });

  it.fails(
    'KI-01 (#1) an order should not get stuck in PAID when the payment worker crashes before enqueuing the stock job',
    async () => {
      const product = await createProduct({ stock: 3 });
      await services.stop('redis');

      const order = await orderFor(product);
      await validateOrderStatus(order.id, 'PAID');
      await services.kill('payment-worker');
      await services.start('redis');
      await services.start('payment-worker');

      await validateFulfilled(order, product, 40_000);
    },
  );
});
