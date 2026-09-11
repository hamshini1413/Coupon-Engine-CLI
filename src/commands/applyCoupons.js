import db from '../db.js';

/**
 * Bonus Task: Applies multiple stacked coupons to a cart total for an optional user.
 * 
 * Signature: applyCoupons(cartTotal, codes, userId)
 * 
 * @param {number} cartTotal - Subtotal of cart (>= 0)
 * @param {string[]} codes - Array of coupon codes to stack
 * @param {string|null} [userId=null] - Optional user identifier
 * @returns {Promise<Object>} Stacked order confirmation details
 */
export async function applyCoupons(cartTotal, codes = [], userId = null) {
  // Support positional arguments as well as object options parameter
  if (typeof cartTotal === 'object' && cartTotal !== null) {
    const opts = cartTotal;
    cartTotal = opts.cartTotal ?? opts.cart_total;
    codes = opts.codes || [];
    userId = opts.userId ?? opts.user_id ?? null;
  }

  const numericCart = Number(cartTotal);
  if (isNaN(numericCart) || numericCart < 0) {
    throw new Error('Invalid cartTotal: cart total must be a non-negative number.');
  }

  if (!Array.isArray(codes) || codes.length === 0) {
    throw new Error('Invalid codes parameter: must provide an array of at least one coupon code.');
  }

  const normalizedUserId = userId !== null && userId !== undefined ? String(userId).trim() : null;

  return await db.transaction(async (tx) => {
    let runningBalance = numericCart;
    let totalDiscountAmount = 0;
    const appliedDetails = [];

    const uniqueCodes = [...new Set(codes.map(c => (c || '').trim()))].filter(Boolean);

    for (const code of uniqueCodes) {
      if (runningBalance <= 0) break;

      // Lock row with FOR UPDATE
      const coupons = await tx.query(
        'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) FOR UPDATE',
        [code]
      );

      if (!coupons || coupons.length === 0) {
        throw new Error(`Stacked coupon '${code}' not found.`);
      }

      const coupon = coupons[0];

      // Expiration (if set)
      if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
        throw new Error(`Stacked coupon '${code}' has expired.`);
      }

      // Usage limit (if set)
      if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) {
        throw new Error(`Stacked coupon '${code}' has reached its global usage limit.`);
      }

      // Min spend
      const minSpend = Number(coupon.min_spend || 0);
      if (numericCart < minSpend) {
        throw new Error(`Cart total ($${numericCart.toFixed(2)}) does not meet minimum spend threshold ($${minSpend.toFixed(2)}) for coupon '${code}'.`);
      }

      // Per-user limit (if set)
      if (coupon.usage_limit_per_user !== null && normalizedUserId !== null) {
        const userRedemptions = await tx.query(
          `SELECT COUNT(*) as count 
           FROM order_coupons oc
           JOIN orders o ON oc.order_id = o.id
           WHERE UPPER(oc.coupon_code) = UPPER($1) AND oc.user_id = $2 AND o.status = 'completed'`,
          [code, normalizedUserId]
        );
        const timesUsedByUser = parseInt(userRedemptions[0]?.count || 0, 10);
        if (timesUsedByUser >= coupon.usage_limit_per_user) {
          throw new Error(`User '${normalizedUserId}' has reached their limit for coupon '${code}'.`);
        }
      }

      // Discount calculation on remaining balance
      let discountForThis = 0;
      const val = Number(coupon.discount_value);

      if (coupon.discount_type === 'percent') {
        discountForThis = (runningBalance * val) / 100;
        if (coupon.max_discount_amount !== null) {
          discountForThis = Math.min(discountForThis, Number(coupon.max_discount_amount));
        }
      } else if (coupon.discount_type === 'flat') {
        discountForThis = val;
      }

      discountForThis = Math.min(discountForThis, runningBalance);
      discountForThis = Math.round(discountForThis * 100) / 100;

      if (discountForThis > 0) {
        runningBalance = Math.round((runningBalance - discountForThis) * 100) / 100;
        totalDiscountAmount += discountForThis;

        appliedDetails.push({
          code: coupon.code,
          discountApplied: discountForThis
        });
      }
    }

    totalDiscountAmount = Math.round(totalDiscountAmount * 100) / 100;
    const finalTotal = Math.round((numericCart - totalDiscountAmount) * 100) / 100;

    // Create Order Record with RETURNING id and status 'completed'
    const orderInsert = await tx.query(
      `INSERT INTO orders (user_id, cart_total, discount_amount, final_total, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [normalizedUserId, numericCart, totalDiscountAmount, finalTotal, 'completed']
    );

    const orderId = orderInsert[0].id;

    // Record redemptions and increment times_used
    for (const item of appliedDetails) {
      await tx.query(
        'UPDATE coupons SET times_used = times_used + 1 WHERE UPPER(code) = UPPER($1)',
        [item.code]
      );

      await tx.query(
        `INSERT INTO order_coupons (order_id, coupon_code, discount_applied, user_id)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.code, item.discountApplied, normalizedUserId]
      );
    }

    return {
      orderId,
      codes: appliedDetails.map(a => a.code),
      cartTotal: numericCart,
      totalDiscountAmount,
      finalTotal,
      userId: normalizedUserId,
      status: 'completed'
    };
  });
}

export default applyCoupons;
