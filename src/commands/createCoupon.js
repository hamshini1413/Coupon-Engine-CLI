import db from '../db.js';

/**
 * Creates a new coupon in the database after validating all business rules.
 * 
 * Signature: createCoupon(code, discountType, discountValue, minSpend, expiresAt, usageLimit, maxDiscountAmount, usageLimitPerUser)
 * 
 * @param {string} code - Unique coupon code (case-insensitive matching)
 * @param {string} discountType - 'percent' or 'flat'
 * @param {number} discountValue - Value of discount (> 0, <= 100 if percent)
 * @param {number} [minSpend=0] - Minimum cart total required
 * @param {string|Date|null} [expiresAt=null] - Optional expiration date timestamp
 * @param {number|null} [usageLimit=null] - Optional global usage limit
 * @param {number|null} [maxDiscountAmount=null] - Optional cap for percentage discount (Bonus 1)
 * @param {number|null} [usageLimitPerUser=null] - Optional redemptions per user limit (Bonus 2)
 * @returns {Promise<Object>} Created coupon database record
 */
export async function createCoupon(
  code,
  discountType,
  discountValue,
  minSpend = 0,
  expiresAt = null,
  usageLimit = null,
  maxDiscountAmount = null,
  usageLimitPerUser = null
) {
  // Support both positional arguments and single object argument
  let params = {};
  if (typeof code === 'object' && code !== null) {
    params = code;
    code = params.code;
    discountType = params.discountType || params.discount_type;
    discountValue = params.discountValue || params.discount_value;
    minSpend = params.minSpend ?? params.min_spend ?? 0;
    expiresAt = params.expiresAt ?? params.expires_at ?? null;
    usageLimit = params.usageLimit ?? params.usage_limit ?? null;
    maxDiscountAmount = params.maxDiscountAmount ?? params.max_discount_amount ?? null;
    usageLimitPerUser = params.usageLimitPerUser ?? params.usage_limit_per_user ?? null;
  }

  // 1. Validation
  if (!code || typeof code !== 'string' || code.trim() === '') {
    throw new Error('Invalid coupon code: must be a non-empty string.');
  }

  const trimmedCode = code.trim();

  const typeLower = (discountType || '').toLowerCase();
  if (!['percent', 'flat'].includes(typeLower)) {
    throw new Error(`Invalid discountType: '${discountType}'. Must be 'percent' or 'flat'.`);
  }

  const numericValue = Number(discountValue);
  if (isNaN(numericValue) || numericValue <= 0) {
    throw new Error('Invalid discountValue: must be a positive number greater than 0.');
  }

  if (typeLower === 'percent' && numericValue > 100) {
    throw new Error('Invalid discountValue: percentage discount cannot exceed 100%.');
  }

  const numericMinSpend = Number(minSpend ?? 0);
  if (isNaN(numericMinSpend) || numericMinSpend < 0) {
    throw new Error('Invalid minSpend: must be a non-negative number.');
  }

  let formattedExpiresAt = null;
  if (expiresAt !== null && expiresAt !== undefined && expiresAt !== '') {
    const expDate = new Date(expiresAt);
    if (isNaN(expDate.getTime())) {
      throw new Error('Invalid expiresAt: must be a valid date or ISO timestamp string.');
    }
    formattedExpiresAt = expDate.toISOString();
  }

  let parsedUsageLimit = null;
  if (usageLimit !== null && usageLimit !== undefined && usageLimit !== '') {
    parsedUsageLimit = parseInt(usageLimit, 10);
    if (isNaN(parsedUsageLimit) || parsedUsageLimit <= 0) {
      throw new Error('Invalid usageLimit: must be a positive integer greater than 0.');
    }
  }

  let parsedMaxDiscountAmount = null;
  if (maxDiscountAmount !== null && maxDiscountAmount !== undefined && maxDiscountAmount !== '') {
    parsedMaxDiscountAmount = Number(maxDiscountAmount);
    if (isNaN(parsedMaxDiscountAmount) || parsedMaxDiscountAmount <= 0) {
      throw new Error('Invalid maxDiscountAmount: must be a positive number.');
    }
  }

  let parsedUsageLimitPerUser = null;
  if (usageLimitPerUser !== null && usageLimitPerUser !== undefined && usageLimitPerUser !== '') {
    parsedUsageLimitPerUser = parseInt(usageLimitPerUser, 10);
    if (isNaN(parsedUsageLimitPerUser) || parsedUsageLimitPerUser <= 0) {
      throw new Error('Invalid usageLimitPerUser: must be a positive integer.');
    }
  }

  // 2. Check for duplicate code (case-insensitive matching)
  const existing = await db.query(
    'SELECT code FROM coupons WHERE UPPER(code) = UPPER($1)',
    [trimmedCode]
  );

  if (existing && existing.length > 0) {
    throw new Error(`Coupon with code '${trimmedCode}' already exists.`);
  }

  // 3. Insert into DB
  await db.query(
    `INSERT INTO coupons (code, discount_type, discount_value, min_spend, expires_at, usage_limit, times_used, max_discount_amount, usage_limit_per_user)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      trimmedCode,
      typeLower,
      numericValue,
      numericMinSpend,
      formattedExpiresAt,
      parsedUsageLimit,
      0,
      parsedMaxDiscountAmount,
      parsedUsageLimitPerUser
    ]
  );

  // 4. Return created record
  const result = await db.query(
    'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)',
    [trimmedCode]
  );

  return result[0];
}

export default createCoupon;
