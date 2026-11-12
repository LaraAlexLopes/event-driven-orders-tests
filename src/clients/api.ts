import { settings } from '../config';

export interface OrderRequest {
  customer: string;
  sku: string;
  quantity: number;
  card: string;
}

export interface OrderResponse {
  id: string;
  customer: string;
  sku: string;
  quantity: number;
  amountCents: number;
  status: string;
}

export interface ApiResult<T> {
  status: number;
  body: T;
}

export const placeOrder = async (
  order: Partial<OrderRequest> | Record<string, unknown>,
  idempotencyKey?: string,
): Promise<ApiResult<OrderResponse>> => {
  const response = await fetch(`${settings.apiUrl}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(order),
  });
  return { status: response.status, body: (await response.json()) as OrderResponse };
};

export const getOrder = async (id: string): Promise<ApiResult<OrderResponse>> => {
  const response = await fetch(`${settings.apiUrl}/orders/${id}`);
  return { status: response.status, body: (await response.json()) as OrderResponse };
};
