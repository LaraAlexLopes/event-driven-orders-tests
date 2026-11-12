CREATE TABLE products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  stock INTEGER NOT NULL CHECK (stock >= 0)
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer TEXT NOT NULL,
  sku TEXT NOT NULL REFERENCES products (sku) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  order_id UUID PRIMARY KEY REFERENCES orders (id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_reservations (
  order_id UUID PRIMARY KEY REFERENCES orders (id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE processed_events (
  event_id UUID NOT NULL,
  consumer TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, consumer)
);
