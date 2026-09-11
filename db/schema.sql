-- Exact PostgreSQL Schema for Coupon Engine CLI

CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'flat')),
    discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
    min_spend NUMERIC NOT NULL DEFAULT 0 CHECK (min_spend >= 0),
    expires_at TIMESTAMPTZ DEFAULT NULL,
    usage_limit INT DEFAULT NULL CHECK (usage_limit IS NULL OR usage_limit > 0),
    times_used INT NOT NULL DEFAULT 0 CHECK (times_used >= 0),
    max_discount_amount NUMERIC DEFAULT NULL CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
    usage_limit_per_user INT DEFAULT NULL CHECK (usage_limit_per_user IS NULL OR usage_limit_per_user > 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id TEXT DEFAULT NULL,
    cart_total NUMERIC NOT NULL CHECK (cart_total >= 0),
    discount_amount NUMERIC NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    final_total NUMERIC NOT NULL CHECK (final_total >= 0),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_coupons (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    coupon_code TEXT NOT NULL REFERENCES coupons(code) ON DELETE RESTRICT,
    discount_applied NUMERIC NOT NULL CHECK (discount_applied >= 0),
    user_id TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_coupons_order_id ON order_coupons(order_id);
CREATE INDEX IF NOT EXISTS idx_order_coupons_coupon_code ON order_coupons(coupon_code);
CREATE INDEX IF NOT EXISTS idx_order_coupons_user_id ON order_coupons(user_id);
