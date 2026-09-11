import db from '../db.js';

/**
 * Applies a coupon to a cart total for an optional user.
 * 
 * Signature: applyCoupon(cartTotal, code, userId)
 * 
 * @param {number} cartTotal - Subtotal of cart (>= 0)
 * @param {string} code - Coupon code
 * @param {string|null} [userId=null] - Optional user identifier
 * @returns {Promise<Object>} Order confirmation details
 */
export async function applyCoupon(cartTotal, code, userId = null) {
  // Support positional parameters as well as object options parameter
  if (typeof cartTotal === 'object' && cartTotal !== null) {
    const opts = cartTotal;
    cartTotal = opts.cartTotal ?? opts.cart_total;
    code = opts.code;
    userId = opts.userId ?? opts.user_id ?? null;
  }

  const numericCart = Number(cartTotal);
  if (isNaN(numericCart) || numericCart < 0) {
    throw new Error('Invalid cartTotal: cart total must be a non-negative number.');
  }

  if (!code || typeof code !== 'string' || code.trim() === '') {
    throw new Error('Invalid coupon code: must be a non-empty string.');
  }

  const trimmedCode = code.trim();
  const normalizedUserId = userId !== null && userId !== undefined ? String(userId).trim() : null;

  return await db.transaction(async (tx) => {
    // 1. Fetch Coupon with FOR UPDATE row-level lock to prevent race conditions
    const coupons = await tx.query(
      'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) FOR UPDATE',
      [trimmedCode]
    );

    if (!coupons || coupons.length === 0) {
      throw new Error(`Coupon '${trimmedCode}' not found.`);
    }

    const coupon = coupons[0];

    // 2. Validate Expiration (if set)
    if (coupon.expires_at) {
      const expTime = new Date(coupon.expires_at).getTime();
      if (expTime < Date.now()) {
        throw new Error(`Coupon '${trimmedCode}' has expired.`);
      }
    }

    // 3. Validate Global Usage Limit (if set)
    if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
      if (coupon.times_used >= coupon.usage_limit) {
        throw new Error(`Coupon '${trimmedCode}' has reached its maximum global usage limit (${coupon.usage_limit}).`);
      }
    }

    // 4. Validate Minimum Spend
    const minSpend = Number(coupon.min_spend || 0);
    if (numericCart < minSpend) {
      throw new Error(`Cart total ($${numericCart.toFixed(2)}) does not meet minimum spend threshold ($${minSpend.toFixed(2)}) for coupon '${trimmedCode}'.`);
    }

    // 5. Validate Per-User Usage Limit (Bonus Task 2)
    if (coupon.usage_limit_per_user !== null && coupon.usage_limit_per_user !== undefined && normalizedUserId !== null) {
      const userRedemptions = await tx.query(
        `SELECT COUNT(*) as count 
         FROM order_coupons oc
         JOIN orders o ON oc.order_id = o.id
         WHERE UPPER(oc.coupon_code) = UPPER($1) AND oc.user_id = $2 AND o.status = 'completed'`,
        [trimmedCode, normalizedUserId]
      );
      const timesUsedByUser = parseInt(userRedemptions[0]?.count || 0, 10);

      if (timesUsedByUser >= coupon.usage_limit_per_user) {
        throw new Error(`User '${normalizedUserId}' has reached their individual usage limit (${coupon.usage_limit_per_user}) for coupon '${trimmedCode}'.`);
      }
    }

    // 6. Calculate Discount Amount
    let discountAmount = 0;
    const discountValue = Number(coupon.discount_value);

    if (coupon.discount_type === 'percent') {
      discountAmount = (numericCart * discountValue) / 100;
      // Bonus Task 1: Max Discount Amount cap for percentage coupons
      if (coupon.max_discount_amount !== null && coupon.max_discount_amount !== undefined) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
      }
    } else if (coupon.discount_type === 'flat') {
      discountAmount = discountValue;
    }

    // Cap discount at total cart value and round to 2 decimal places
    discountAmount = Math.min(discountAmount, numericCart);
    discountAmount = Math.round(discountAmount * 100) / 100;

    const finalTotal = Math.round((numericCart - discountAmount) * 100) / 100;

    // 7. Update Coupon Global Usage Count
    await tx.query(
      'UPDATE coupons SET times_used = times_used + 1 WHERE UPPER(code) = UPPER($1)',
      [trimmedCode]
    );

    // 8. Create Order Record and RETURNING id atomically with status 'completed'
    const orderInsert = await tx.query(
      `INSERT INTO orders (user_id, cart_total, discount_amount, final_total, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [normalizedUserId, numericCart, discountAmount, finalTotal, 'completed']
    );

    const orderId = orderInsert[0].id;

    // 9. Record Redemption in order_coupons (using column 'coupon_code')
    await tx.query(
      `INSERT INTO order_coupons (order_id, coupon_code, discount_applied, user_id)
       VALUES ($1, $2, $3, $4)`,
      [orderId, coupon.code, discountAmount, normalizedUserId]
    );

    return {
      orderId,
      code: coupon.code,
      cartTotal: numericCart,
      discountAmount,
      finalTotal,
      userId: normalizedUserId,
      status: 'completed'
    };
  });
}

export default applyCoupon;
