import pg from 'pg';

import { settings } from '../config';

const pool = new pg.Pool({ connectionString: settings.databaseUrl, max: 5 });

const one = async <T>(sql: string, params: unknown[]): Promise<T | undefined> =>
  (await pool.query(sql, params)).rows[0] as T | undefined;

export const database = {
  insertProduct: (sku: string, name: string, priceCents: number, stock: number) =>
    pool.query('INSERT INTO products (sku, name, price_cents, stock) VALUES ($1, $2, $3, $4)', [
      sku,
      name,
      priceCents,
      stock,
    ]),

  deleteProducts: (skus: string[]) => pool.query('DELETE FROM products WHERE sku = ANY($1)', [skus]),

  stock: async (sku: string) =>
    (await one<{ stock: number }>('SELECT stock FROM products WHERE sku = $1', [sku]))?.stock,

  orderStatus: async (id: string) =>
    (await one<{ status: string }>('SELECT status FROM orders WHERE id = $1', [id]))?.status,

  ordersFor: async (sku: string) =>
    (await pool.query('SELECT id, status FROM orders WHERE sku = $1 ORDER BY created_at', [sku])).rows as {
      id: string;
      status: string;
    }[],

  payment: (orderId: string) =>
    one<{ status: string; amount_cents: number }>('SELECT status, amount_cents FROM payments WHERE order_id = $1', [
      orderId,
    ]),

  paymentsFor: async (orderId: string) =>
    Number((await one<{ count: string }>('SELECT count(*) FROM payments WHERE order_id = $1', [orderId]))?.count),

  reservation: (orderId: string) =>
    one<{ sku: string; quantity: number }>('SELECT sku, quantity FROM inventory_reservations WHERE order_id = $1', [
      orderId,
    ]),

  close: () => pool.end(),
};
