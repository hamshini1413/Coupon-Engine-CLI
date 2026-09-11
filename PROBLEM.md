# Problem Specification — Coupon Engine CLI

## Overview
Build a command-line Coupon Engine backed by PostgreSQL. The engine manages coupon creation, validation against cart totals, discount calculation, atomic order placement, state lookup, and order cancellation with usage restoration.

---

## Data Schema (`schema.sql`)

### 1. `coupons`
- `code`: `TEXT PRIMARY KEY` (Unique coupon string, e.g. `SAVE20`)
- `discount_type`: `TEXT NOT NULL CHECK (discount_type IN ('percent', 'flat'))`
- `discount_value`: `NUMERIC NOT NULL CHECK (discount_value > 0)`
- `min_spend`: `NUMERIC NOT NULL DEFAULT 0 CHECK (min_spend >= 0)`
- `expires_at`: `TIMESTAMPTZ DEFAULT NULL` (Optional / Nullable timestamp)
- `usage_limit`: `INT DEFAULT NULL` (Optional / Nullable global usage cap)
- `times_used`: `INT NOT NULL DEFAULT 0 CHECK (times_used >= 0)`
- `max_discount_amount`: `NUMERIC DEFAULT NULL` (Bonus 1: Cap for percentage coupon discount)
- `usage_limit_per_user`: `INT DEFAULT NULL` (Bonus 2: Limit per individual user)
- `created_at`: `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`

### 2. `orders`
- `id`: `SERIAL PRIMARY KEY` (Integer ID)
- `user_id`: `TEXT DEFAULT NULL` (Nullable user identifier)
- `cart_total`: `NUMERIC NOT NULL CHECK (cart_total >= 0)`
- `discount_amount`: `NUMERIC NOT NULL DEFAULT 0`
- `final_total`: `NUMERIC NOT NULL CHECK (final_total >= 0)`
- `status`: `TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled'))`
- `created_at`: `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`

### 3. `order_coupons`
- `id`: `SERIAL PRIMARY KEY`
- `order_id`: `INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE`
- `coupon_code`: `TEXT NOT NULL REFERENCES coupons(code) ON DELETE RESTRICT`
- `discount_applied`: `NUMERIC NOT NULL CHECK (discount_applied >= 0)`
- `user_id`: `TEXT DEFAULT NULL`
- `created_at`: `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`

---

## Required Function Signatures

1. `createCoupon(code, discountType, discountValue, minSpend = 0, expiresAt = null, usageLimit = null, maxDiscountAmount = null, usageLimitPerUser = null)`
2. `applyCoupon(cartTotal, code, userId = null)` — Returns `{ orderId, code, cartTotal, discountAmount, finalTotal, userId, status: 'completed' }`.
3. `getCoupon(code)` — Returns coupon state + redemptions from `order_coupons`.
4. `cancelOrder(orderId)` — Transitions order status from `'completed'` ➡️ `'cancelled'` and restores `times_used`.
5. `applyCoupons(cartTotal, codes, userId = null)` — Bonus Stacking Task.
