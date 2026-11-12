import { faker } from '@faker-js/faker';

import { placeOrder, type OrderRequest, type OrderResponse } from './clients/api';
import { database } from './clients/database';
import { runId, settings } from './config';

export type ProductBehaviour = 'normal' | 'flaky' | 'broken';

export interface Product {
  sku: string;
  priceCents: number;
  stock: number;
}

const PREFIX: Record<ProductBehaviour, string> = { normal: 'SKU-', flaky: 'FLAKY-', broken: 'BROKEN-' };

export const createdSkus: string[] = [];

export const createProduct = async ({
  stock = 10,
  behaviour = 'normal',
}: { stock?: number; behaviour?: ProductBehaviour } = {}): Promise<Product> => {
  const sku = `${PREFIX[behaviour]}${runId}-${faker.string.alphanumeric(6).toUpperCase()}`;
  const priceCents = faker.number.int({ min: 500, max: 50_000 });
  await database.insertProduct(sku, faker.commerce.productName(), priceCents, stock);
  createdSkus.push(sku);
  return { sku, priceCents, stock };
};

export const buildOrder = (product: Product, overrides: Partial<OrderRequest> = {}): OrderRequest => ({
  customer: faker.person.fullName(),
  sku: product.sku,
  quantity: 1,
  card: settings.cards.approved,
  ...overrides,
});

export const orderFor = async (product: Product, overrides: Partial<OrderRequest> = {}): Promise<OrderResponse> => {
  const { status, body } = await placeOrder(buildOrder(product, overrides));
  if (status !== 201) throw new Error(`Could not place an order: ${status} ${JSON.stringify(body)}`);
  return body;
};
