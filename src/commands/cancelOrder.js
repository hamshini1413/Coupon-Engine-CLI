import db from '../db.js';

/**
 * Cancels an order by ID and restores coupon usage counters atomically.
 * 
 * Signature: cancelOrder(orderId)
 * 
 * @param {number|string} orderId - ID of the order to cancel
 * @returns {Promise<Object>} Cancelled order summary
 */
export async function cancelOrder(orderId) {
  const parsedOrderId = parseInt(orderId, 10);
  if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
    throw new Error('Invalid orderId: order ID must be a positive integer.');
  }

  return await db.transaction(async (tx) => {
    // 1. Fetch Order with FOR UPDATE lock
    const orders = await tx.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [parsedOrderId]
    );

    if (!orders || orders.length === 0) {
      throw new Error(`Order #${parsedOrderId} not found.`);
    }

    const order = orders[0];

    if (order.status === 'cancelled') {
      throw new Error(`Order #${parsedOrderId} is already cancelled.`);
    }

    // 2. Fetch associated redemptions from order_coupons (column 'coupon_code')
    const redemptions = await tx.query(
      `SELECT coupon_code FROM order_coupons WHERE order_id = $1`,
      [parsedOrderId]
    );

    // 3. Mark order as cancelled
    await tx.query(
      "UPDATE orders SET status = 'cancelled' WHERE id = $1",
      [parsedOrderId]
    );

    // 4. Restore times_used counter for each redeemed coupon
    const restoredCoupons = [];
    for (const redemption of redemptions) {
      await tx.query(
        `UPDATE coupons 
         SET times_used = CASE 
           WHEN times_used > 0 THEN times_used - 1 
           ELSE 0 
         END 
         WHERE UPPER(code) = UPPER($1)`,
        [redemption.coupon_code]
      );
      restoredCoupons.push(redemption.coupon_code);
    }

    return {
      orderId: parsedOrderId,
      previousStatus: order.status,
      status: 'cancelled',
      userId: order.user_id,
      cartTotal: Number(order.cart_total),
      discountAmount: Number(order.discount_amount),
      finalTotal: Number(order.final_total),
      restoredCoupons
    };
  });
}

export default cancelOrder;
