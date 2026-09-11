import db from '../db.js';

/**
 * Looks up and returns coupon details and state.
 * 
 * Signature: getCoupon(code)
 * 
 * @param {string} code - Coupon code to look up
 * @returns {Promise<Object>} Coupon details and status
 */
export async function getCoupon(code) {
  if (!code || typeof code !== 'string' || code.trim() === '') {
    throw new Error('Invalid coupon code: must be a non-empty string.');
  }

  const trimmedCode = code.trim();

  const coupons = await db.query(
    'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)',
    [trimmedCode]
  );

  if (!coupons || coupons.length === 0) {
    throw new Error(`Coupon '${trimmedCode}' not found.`);
  }

  const coupon = coupons[0];

  // Fetch redemption history from order_coupons (column 'coupon_code')
  const redemptions = await db.query(
    `SELECT oc.id, oc.order_id, oc.coupon_code, oc.discount_applied, oc.user_id, oc.created_at as redeemed_at, o.status as order_status
     FROM order_coupons oc
     JOIN orders o ON oc.order_id = o.id
     WHERE UPPER(oc.coupon_code) = UPPER($1)
     ORDER BY oc.created_at DESC`,
    [trimmedCode]
  );

  // Compute calculated status
  let status = 'active';
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    status = 'expired';
  } else if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) {
    status = 'usage_limit_reached';
  }

  const remainingUses = coupon.usage_limit !== null
    ? Math.max(0, coupon.usage_limit - coupon.times_used)
    : 'unlimited';

  return {
    code: coupon.code,
    discountType: coupon.discount_type,
    discountValue: Number(coupon.discount_value),
    minSpend: Number(coupon.min_spend || 0),
    expiresAt: coupon.expires_at,
    usageLimit: coupon.usage_limit,
    timesUsed: coupon.times_used,
    remainingUses,
    maxDiscountAmount: coupon.max_discount_amount ? Number(coupon.max_discount_amount) : null,
    usageLimitPerUser: coupon.usage_limit_per_user ? Number(coupon.usage_limit_per_user) : null,
    status,
    createdAt: coupon.created_at,
    redemptions
  };
}

export default getCoupon;
