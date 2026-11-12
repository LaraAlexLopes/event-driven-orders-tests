import { randomUUID } from 'node:crypto';

import { describe, it } from 'vitest';

import { createProduct, orderFor } from '../src/data';
import { eventLog } from '../src/system';
import { validateDeadLetter, validateFulfilled } from '../src/validations';

describe('Poison messages', () => {
  it('sends a message that is not JSON to the dead-letter topic and keeps consuming', async () => {
    const marker = `not-json-${randomUUID()}`;

    await eventLog.publishRaw(`{ ${marker}`);
    const product = await createProduct();
    const order = await orderFor(product);

    await validateDeadLetter(marker, 'invalid JSON');
    await validateFulfilled(order, product);
  });

  it('sends an event without an order id to the dead-letter topic and keeps consuming', async () => {
    const marker = randomUUID();

    await eventLog.publishRaw(JSON.stringify({ eventId: marker, type: 'order.created', data: {} }));
    const product = await createProduct();
    const order = await orderFor(product);

    await validateDeadLetter(marker, 'missing eventId, type or orderId');
    await validateFulfilled(order, product);
  });
});
