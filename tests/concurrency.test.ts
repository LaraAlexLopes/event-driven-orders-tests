import { describe, expect, it } from 'vitest';

import { database } from '../src/clients/database';
import { createProduct, orderFor } from '../src/data';
import { eventually } from '../src/eventually';
import { validateStock } from '../src/validations';

const finalStatuses = (sku: string) =>
  eventually(async () => {
    const orders = await database.ordersFor(sku);
    expect(orders.every(order => ['FULFILLED', 'OUT_OF_STOCK'].includes(order.status))).toBe(true);
    return orders.map(order => order.status);
  });

describe('Concurrency', () => {
  it('sells the last unit only once when two customers order it at the same time', async () => {
    const product = await createProduct({ stock: 1 });

    await Promise.all([orderFor(product), orderFor(product)]);

    const statuses = await finalStatuses(product.sku);
    expect(statuses.sort()).toEqual(['FULFILLED', 'OUT_OF_STOCK']);
    await validateStock(product, 0);
  });

  it('fulfills every order and never oversells when many orders arrive together', async () => {
    const product = await createProduct({ stock: 15 });

    await Promise.all(Array.from({ length: 20 }, () => orderFor(product)));

    const statuses = await finalStatuses(product.sku);
    expect(statuses.filter(status => status === 'FULFILLED')).toHaveLength(15);
    expect(statuses.filter(status => status === 'OUT_OF_STOCK')).toHaveLength(5);
    await validateStock(product, 0);
  });
});
