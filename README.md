# Coupon Engine CLI

A command-line Coupon Engine built in **Node.js** backed by **PostgreSQL** matching 100% of the assignment specifications.

---

## Getting Started

### 1. Start PostgreSQL with Docker
```bash
docker-compose up -d
```

### 2. Install & Seed Database
```bash
npm install
npm run seed
```

### 3. Run Automated Tests
```bash
npm test
```

---

## Design Decisions & Stated Assumptions

1. **PostgreSQL Database Engine**: The primary database engine is PostgreSQL 16 (via the `pg` pool driver) running in Docker as configured in `docker-compose.yml`. Standard connection parameters use `process.env.DATABASE_URL` or default to `postgres://postgres:postgres@localhost:5432/coupon_engine`. `src/db.js` provides standard PostgreSQL query execution, transaction handling, schema initialization, and pool teardown.
2. **Case-Insensitive Coupon Code Matching**: Coupon codes are stored and queried using case-insensitive SQL matching (`UPPER(code) = UPPER($1)`) so user inputs like `save20` match `SAVE20`.
3. **Optional Expiration & Usage Limits**: As specified in `PROBLEM.md`, `expires_at` and `usage_limit` default to `NULL` (optional). A coupon with `expires_at = NULL` never expires, and a coupon with `usage_limit = NULL` has unlimited global uses.
4. **Concurrency Safety & Row Locking**: `applyCoupon` and `applyCoupons` use `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) FOR UPDATE` within SQL transactions. This row lock guarantees that concurrent requests across multiple terminal sessions cannot cause `times_used` to drift beyond `usage_limit`.
5. **Atomic Order ID Extraction**: Orders are created with `INSERT INTO orders ... RETURNING id` to obtain the newly generated `SERIAL` integer ID directly without `SELECT MAX(id)` race conditions.
6. **Nullable User ID**: Anonymous/guest orders pass `userId = null`, which is saved as `NULL` in `orders.user_id` and `order_coupons.user_id`.
7. **Order Status Lifecycle**: Completed orders are placed with `status: 'completed'`. Cancelling an order updates `status: 'cancelled'` and restores `times_used` on all redeemed coupons. Re-cancelling an already cancelled order throws an error.
8. **Financial Precision & Capping**: All currency calculations are rounded to 2 decimal places (`Math.round(val * 100) / 100`). The maximum discount for any order is capped at `cartTotal` so final totals cannot be negative.
9. **Percentage Discount Capping (Bonus 1)**: For percentage coupons with `max_discount_amount` set, calculated discounts are capped at `max_discount_amount`.
10. **Per-User Usage Limit (Bonus 2)**: For coupons with `usage_limit_per_user` set, redemptions per user are checked against completed orders in `order_coupons`.
11. **Percentage Coupon Discount Value Bounds**: Percentage coupon discount values must be greater than 0 and cannot exceed 100% (`0 < discount_value <= 100` for `discount_type = 'percent'`). Creation attempts with `discount_value > 100` are rejected to prevent invalid discount logic.
12. **Multi-Coupon Stacking Evaluation Order & Balance Reduction (Bonus 3)**: For `applyCoupons`, coupons are processed sequentially in the exact order specified in the input array. Each coupon's discount is calculated against the remaining cart subtotal after preceding discounts have been applied (compound reduction). If the running balance reaches `$0`, subsequent coupons are skipped and omitted from the generated order.

---

## CLI Usage Reference

### 1. `createCoupon`
```bash
node src/cli.js createCoupon SAVE20 percent 20 50
node src/cli.js createCoupon WELCOME10 flat 10 20 2026-12-31T00:00:00Z 100
```

### 2. `applyCoupon`
```bash
node src/cli.js applyCoupon 100 SAVE20 user_123
node src/cli.js applyCoupon 100 SAVE20
```

### 3. `getCoupon`
```bash
node src/cli.js getCoupon SAVE20
```

### 4. `cancelOrder`
```bash
node src/cli.js cancelOrder 1
```

### 5. `applyCoupons` (Bonus Stacking Task)
```bash
node src/cli.js applyCoupons 100 SAVE20,WELCOME10 user_123
```
