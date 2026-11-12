import { expect } from 'vitest';

import { getOrder } from './clients/api';
import { database } from './clients/database';
import type { Product } from './data';
import { consistently, eventually } from './eventually';
import { eventLog, stockQueue } from './system';

export const validateOrderStatus = (orderId: string, status: string, timeout?: number) =>
  eventually(
    async () => {
      expect(await database.orderStatus(orderId)).toBe(status);
      expect((await getOrder(orderId)).body.status).toBe(status);
    },
    { timeout },
  );

export const validateOrderStaysIn = (orderId: string, status: string, duration = 3_000) =>
  consistently(async () => expect(await database.orderStatus(orderId)).toBe(status), { duration });

export const validateEvents = (orderId: string, types: string[], timeout?: number) =>
  eventually(async () => expect(eventLog.typesFor(orderId)).toEqual(types), { timeout });

export const validateNoEvents = (orderId: string, duration = 2_000) =>
  consistently(async () => expect(eventLog.typesFor(orderId)).toEqual([]), { duration });

export const validateStock = (product: Product, expected: number) =>
  eventually(async () => expect(await database.stock(product.sku)).toBe(expected));

export const validateStockUnchanged = (product: Product) =>
  consistently(async () => expect(await database.stock(product.sku)).toBe(product.stock));

export const validatePayment = async (orderId: string, status: 'APPROVED' | 'DECLINED', amountCents: number) => {
  expect(await database.paymentsFor(orderId)).toBe(1);
  expect(await database.payment(orderId)).toEqual({ status, amount_cents: amountCents });
};

export const validateReservation = async (orderId: string, product: Product, quantity: number) => {
  expect(await database.reservation(orderId)).toEqual({ sku: product.sku, quantity });
};

export const validateNoReservation = async (orderId: string) => {
  expect(await database.reservation(orderId)).toBeUndefined();
};

export const validateJob = (
  orderId: string,
  expected: { state: string; attemptsMade?: number; failedReason?: string },
) => eventually(async () => expect(await stockQueue.job(orderId)).toMatchObject(expected));

export const validateNoJob = async (orderId: string) => {
  expect(await stockQueue.job(orderId)).toBeUndefined();
};

export const validateFulfilled = async (
  order: { id: string; quantity: number; amountCents: number },
  product: Product,
  timeout?: number,
) => {
  await validateOrderStatus(order.id, 'FULFILLED', timeout);
  await validateEvents(order.id, ['order.created', 'order.paid', 'order.fulfilled']);
  await validatePayment(order.id, 'APPROVED', order.amountCents);
  await validateReservation(order.id, product, order.quantity);
};

export const validateDeadLetter = (marker: string, reason: string) =>
  eventually(async () => {
    const letters = eventLog.deadLettersContaining(marker);
    expect(letters).toHaveLength(1);
    expect(letters[0]).toMatchObject({ reason, consumer: 'payment-service' });
  });
