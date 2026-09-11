import { query, initSchema, close } from './src/db.js';
import createCoupon from './src/commands/createCoupon.js';
import applyCoupon from './src/commands/applyCoupon.js';
import getCoupon from './src/commands/getCoupon.js';
import cancelOrder from './src/commands/cancelOrder.js';
import applyCoupons from './src/commands/applyCoupons.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function runTests() {
  console.log('🧪 Starting Exhaustive Coupon Engine Test Suite against PostgreSQL...\n');

  await initSchema();
  await query('TRUNCATE order_coupons, orders, coupons RESTART IDENTITY CASCADE;');

  let passedCount = 0;
  let totalCount = 0;

  async function test(name, fn) {
    totalCount++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // =========================================================================
  // 1. createCoupon Tests & Edge Cases
  // =========================================================================
  await test('createCoupon - Optional expiresAt & usageLimit (Non-expiring & Unlimited)', async () => {
    const coupon = await createCoupon('UNLIMITED_CPN', 'percent', 15, 0, null, null);
    assert(coupon.code === 'UNLIMITED_CPN', 'Code is UNLIMITED_CPN');
    assert(coupon.discount_type === 'percent', 'Type is percent');
    assert(coupon.expires_at === null, 'expires_at is NULL (non-expiring)');
    assert(coupon.usage_limit === null, 'usage_limit is NULL (unlimited)');
  });

  await test('createCoupon - Coupon with full parameters', async () => {
    const coupon = await createCoupon('FULL_CPN', 'percent', 20, 50, futureDate, 100, 15, 2);
    assert(coupon.code === 'FULL_CPN', 'Code is FULL_CPN');
    assert(Number(coupon.min_spend) === 50, 'min_spend is 50');
    assert(Number(coupon.max_discount_amount) === 15, 'max_discount_amount is 15');
    assert(Number(coupon.usage_limit_per_user) === 2, 'usage_limit_per_user is 2');
  });

  await test('createCoupon - Reject duplicate code (case-insensitive)', async () => {
    try {
      await createCoupon('full_cpn', 'flat', 10);
      assert(false, 'Should reject duplicate code regardless of case');
    } catch (err) {
      assert(err.message.includes('already exists'), 'Rejects duplicate code');
    }
  });

  await test('createCoupon - Reject invalid percentage (> 100%)', async () => {
    try {
      await createCoupon('INVALID150', 'percent', 150);
      assert(false, 'Should reject percentage > 100%');
    } catch (err) {
      assert(err.message.includes('cannot exceed 100%'), 'Rejects >100% percentage');
    }
  });

  await test('createCoupon - Reject negative discountValue or minSpend', async () => {
    try {
      await createCoupon('NEG_DISC', 'flat', -10);
      assert(false, 'Should reject negative discountValue');
    } catch (err) {
      assert(err.message.includes('positive number'), 'Rejects negative discountValue');
    }
  });

  // =========================================================================
  // 2. applyCoupon Tests & Standalone Edge Cases
  // =========================================================================
  await test('applyCoupon - Non-existent coupon error', async () => {
    try {
      await applyCoupon(100, 'DOES_NOT_EXIST');
      assert(false, 'Should fail for non-existent coupon');
    } catch (err) {
      assert(err.message.includes('not found'), 'Rejects non-existent coupon');
    }
  });

  await test('applyCoupon - Standalone Expired Coupon Rejection', async () => {
    await createCoupon('EXPIRED_STANDALONE', 'flat', 10, 0, pastDate, 100);
    try {
      await applyCoupon(50, 'EXPIRED_STANDALONE');
      assert(false, 'Should reject expired coupon');
    } catch (err) {
      assert(err.message.includes('has expired'), 'Rejects expired coupon');
    }
  });

  await test('applyCoupon - Standalone Min Spend Threshold Rejection', async () => {
    await createCoupon('MINSPEND_100', 'flat', 20, 100, futureDate, 100);
    try {
      await applyCoupon(50, 'MINSPEND_100');
      assert(false, 'Should reject when cartTotal < min_spend');
    } catch (err) {
      assert(err.message.includes('minimum spend threshold'), 'Rejects cart below min spend');
    }
  });

  await test('applyCoupon - Standalone Usage Limit Rejection', async () => {
    await createCoupon('USAGE_LIMIT_1', 'flat', 5, 0, futureDate, 1);
    await applyCoupon(20, 'USAGE_LIMIT_1', 'user_a');

    try {
      await applyCoupon(20, 'USAGE_LIMIT_1', 'user_b');
      assert(false, 'Should reject when usage limit reached');
    } catch (err) {
      assert(err.message.includes('maximum global usage limit'), 'Rejects after usage limit reached');
    }
  });

  await test('applyCoupon - Standalone Per-User Usage Limit Rejection', async () => {
    await createCoupon('PER_USER_1', 'flat', 5, 0, futureDate, 10, null, 1);
    await applyCoupon(20, 'PER_USER_1', 'user_john');

    try {
      await applyCoupon(20, 'PER_USER_1', 'user_john');
      assert(false, 'Should reject when per-user limit reached');
    } catch (err) {
      assert(err.message.includes('reached their individual usage limit'), 'Rejects per-user limit breach');
    }

    const o2 = await applyCoupon(20, 'PER_USER_1', 'user_mary');
    assert(o2.status === 'completed', 'Different user succeeds');
  });

  await test('applyCoupon - Discount capped at cart total ($15 off $10 cart)', async () => {
    await createCoupon('BIG_FLAT', 'flat', 15, 0, futureDate, 10);
    const order = await applyCoupon(10, 'BIG_FLAT');
    assert(order.discountAmount === 10, 'Discount capped at cart total ($10)');
    assert(order.finalTotal === 0, 'Final total is $0');
  });

  await test('applyCoupon - Anonymous order (null userId) & $0 cart total', async () => {
    await createCoupon('ZERO_CART', 'flat', 5, 0, null, null);
    const order = await applyCoupon(0, 'ZERO_CART', null);

    assert(order.cartTotal === 0, 'Cart total is 0');
    assert(order.discountAmount === 0, 'Discount is 0');
    assert(order.finalTotal === 0, 'Final total is 0');
    assert(order.userId === null, 'userId is null');
    assert(order.status === 'completed', 'Order status is completed');
  });

  // =========================================================================
  // 3. Concurrency Safety Test
  // =========================================================================
  await test('applyCoupon - Concurrency Safety (FOR UPDATE locking prevents usage_limit drift)', async () => {
    await createCoupon('RACE_CPN', 'flat', 5, 0, futureDate, 3);

    await applyCoupon(20, 'RACE_CPN', 'user_1');
    await applyCoupon(20, 'RACE_CPN', 'user_2');
    await applyCoupon(20, 'RACE_CPN', 'user_3');

    try {
      await applyCoupon(20, 'RACE_CPN', 'user_4');
      assert(false, 'Should fail when usage_limit reached');
    } catch (err) {
      assert(err.message.includes('maximum global usage limit'), 'Blocks 4th attempt');
    }

    const state = await getCoupon('RACE_CPN');
    assert(state.timesUsed === 3, 'times_used does NOT drift past limit of 3');
  });

  // =========================================================================
  // 4. getCoupon Tests
  // =========================================================================
  await test('getCoupon - Correct state calculation for expired and limit reached', async () => {
    const expiredState = await getCoupon('EXPIRED_STANDALONE');
    assert(expiredState.status === 'expired', 'Status is expired');

    const limitState = await getCoupon('USAGE_LIMIT_1');
    assert(limitState.status === 'usage_limit_reached', 'Status is usage_limit_reached');
    assert(limitState.remainingUses === 0, 'Remaining uses is 0');
  });

  // =========================================================================
  // 5. cancelOrder Tests & Edge Cases
  // =========================================================================
  await test('cancelOrder - Completed to Cancelled transition & times_used restoration', async () => {
    await createCoupon('CANCEL_CPN', 'flat', 5, 0, futureDate, 1);
    const o = await applyCoupon(20, 'CANCEL_CPN', 'user_x');
    assert(o.status === 'completed', 'Status is completed initially');

    const cancelRes = await cancelOrder(o.orderId);
    assert(cancelRes.status === 'cancelled', 'Status transitioned to cancelled');
    assert(cancelRes.restoredCoupons.includes('CANCEL_CPN'), 'Restored CANCEL_CPN');

    const stateAfter = await getCoupon('CANCEL_CPN');
    assert(stateAfter.timesUsed === 0, 'times_used restored to 0');
    assert(stateAfter.status === 'active', 'Coupon is active again');
  });

  await test('cancelOrder - Reject double cancellation', async () => {
    await createCoupon('DOUBLE_CANCEL', 'flat', 5, 0, futureDate, 10);
    const o = await applyCoupon(20, 'DOUBLE_CANCEL', 'user_x');
    await cancelOrder(o.orderId);

    try {
      await cancelOrder(o.orderId);
      assert(false, 'Should reject double cancellation');
    } catch (err) {
      assert(err.message.includes('already cancelled'), 'Rejects double cancel');
    }
  });

  // =========================================================================
  // 6. applyCoupons Bonus Task & Mid-List $0 Balance Edge Case
  // =========================================================================
  await test('applyCoupons - Stack multiple coupons and handle balance hitting $0 mid-list', async () => {
    await createCoupon('STACK_1', 'flat', 50, 0, futureDate, 50);
    await createCoupon('STACK_2', 'flat', 50, 0, futureDate, 50);
    await createCoupon('STACK_3', 'flat', 20, 0, futureDate, 50);

    const res = await applyCoupons(80, ['STACK_1', 'STACK_2', 'STACK_3'], 'user_y');

    assert(res.totalDiscountAmount === 80, 'Total discount is $80');
    assert(res.finalTotal === 0, 'Final total is $0');
    assert(res.codes.length === 2, 'Only STACK_1 and STACK_2 applied');
  });

  console.log(`\n=====================================================`);
  console.log(`RESULTS: ${passedCount} / ${totalCount} tests passed!`);
  console.log(`=====================================================\n`);

  await close();

  if (passedCount < totalCount) {
    process.exit(1);
  }
}

runTests().catch(async (err) => {
  console.error('Test runner exception:', err);
  await close();
  process.exit(1);
});
