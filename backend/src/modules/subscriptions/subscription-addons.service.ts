import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database';
import { PricingService } from '../discounts/pricing.service';
import { AuditService } from '../audit/audit.service';

export interface SubscriptionAddonRecord {
  id: string;
  subscription_id: string;
  product_id: string;
  product_name?: string;
  product_type?: string;
  variant_id: string | null;
  attribute_name?: string | null;
  attribute_value?: string | null;
  price_extra?: number | null;
  quantity: number;
  unit_price: number;
  status: 'pending_activation' | 'active' | 'pending_removal' | 'removed';
  effective_start_date: string;
  effective_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserContext {
  id: string;
  role: string;
  customerId?: string;
}

export class SubscriptionAddonService {
  /**
   * List all add-ons for a subscription with product and variant details
   */
  static async getAddons(subscriptionId: string, user?: UserContext): Promise<SubscriptionAddonRecord[]> {
    const sub = await db.queryOne<{ id: string; customer_id: string }>(
      'SELECT id, customer_id FROM subscriptions WHERE id = ?',
      [subscriptionId]
    );

    if (!sub) {
      const err = new Error('Subscription not found') as any;
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (user?.role === 'customer' && user.customerId !== sub.customer_id) {
      const err = new Error('Unauthorized access to subscription') as any;
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    const addons = await db.query<SubscriptionAddonRecord>(
      `SELECT sa.*, pr.name as product_name, pr.type as product_type,
              pv.attribute_name, pv.attribute_value, pv.price_extra
       FROM subscription_addons sa
       JOIN products pr ON sa.product_id = pr.id
       LEFT JOIN product_variants pv ON sa.variant_id = pv.id
       WHERE sa.subscription_id = ?
       ORDER BY sa.created_at DESC`,
      [subscriptionId]
    );

    return addons;
  }

  /**
   * Request / Schedule an add-on addition to a subscription.
   * Effective from next billing period as per business rules.
   */
  static async addAddon(
    subscriptionId: string,
    data: {
      productId: string;
      variantId?: string | null;
      quantity: number;
      unitPrice?: number;
    },
    user: UserContext
  ): Promise<SubscriptionAddonRecord> {
    const sub = await db.queryOne<{
      id: string;
      customer_id: string;
      status: string;
      next_billing_date: string;
      end_date: string | null;
    }>('SELECT id, customer_id, status, next_billing_date, end_date FROM subscriptions WHERE id = ?', [
      subscriptionId,
    ]);

    if (!sub) {
      const err = new Error('Subscription not found') as any;
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // Role check: customer ownership
    if (user.role === 'customer' && user.customerId !== sub.customer_id) {
      const err = new Error('Unauthorized access to subscription') as any;
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    // Subscription status validation
    if (sub.status !== 'active' && sub.status !== 'paused') {
      const err = new Error(`Cannot add add-ons to subscription with status '${sub.status}'`) as any;
      err.code = 'INVALID_STATUS';
      err.status = 400;
      throw err;
    }

    // Quantity validation
    if (!Number.isInteger(data.quantity) || data.quantity <= 0) {
      const err = new Error('Quantity must be a positive integer') as any;
      err.code = 'INVALID_QUANTITY';
      err.status = 400;
      throw err;
    }

    // Product validation
    const product = await db.queryOne<{ id: string; name: string; sales_price: number; is_active: number }>(
      'SELECT id, name, sales_price, is_active FROM products WHERE id = ?',
      [data.productId]
    );

    if (!product || !product.is_active) {
      const err = new Error('Selected product does not exist or is inactive') as any;
      err.code = 'INVALID_PRODUCT';
      err.status = 400;
      throw err;
    }

    // Variant validation
    let priceExtra = 0;
    if (data.variantId) {
      const variant = await db.queryOne<{ id: string; product_id: string; price_extra: number }>(
        'SELECT id, product_id, price_extra, is_active FROM product_variants WHERE id = ? AND product_id = ?',
        [data.variantId, data.productId]
      );

      if (!variant) {
        const err = new Error('Selected variant does not exist or does not belong to the selected product') as any;
        err.code = 'INVALID_VARIANT';
        err.status = 400;
        throw err;
      }
      if (variant.is_active === 0) {
        const err = new Error('Selected variant is inactive and cannot be selected for new add-ons') as any;
        err.code = 'INACTIVE_VARIANT';
        err.status = 400;
        throw err;
      }
      priceExtra = variant.price_extra || 0;
    }

    // Check duplicate or conflicting active/pending add-on for the exact product & variant combination
    let duplicateCheckSql = `
      SELECT id, status FROM subscription_addons
      WHERE subscription_id = ?
        AND product_id = ?
        AND status IN ('pending_activation', 'active')
    `;
    const duplicateParams: any[] = [subscriptionId, data.productId];

    if (data.variantId) {
      duplicateCheckSql += ' AND variant_id = ?';
      duplicateParams.push(data.variantId);
    } else {
      duplicateCheckSql += ' AND variant_id IS NULL';
    }

    const existingActive = await db.queryOne(duplicateCheckSql, duplicateParams);
    if (existingActive) {
      const err = new Error(
        'An active or pending add-on for this product and variant already exists on this subscription. Update its quantity instead.'
      ) as any;
      err.code = 'DUPLICATE_ADDON';
      err.status = 400;
      throw err;
    }

    // Determine unit price snapshot (authoritative calculation)
    let unitPrice = product.sales_price + priceExtra;
    if (data.unitPrice !== undefined && user.role !== 'customer') {
      // Staff/Admin can override price if authorized
      unitPrice = data.unitPrice;
    }
    unitPrice = PricingService.round(unitPrice);

    // Business rule: effective from the next billing period
    const effectiveStartDate = sub.next_billing_date;
    const today = new Date().toISOString().split('T')[0];
    const initialStatus = effectiveStartDate <= today ? 'active' : 'pending_activation';

    const addonId = uuidv4();

    await db.execute(
      `INSERT INTO subscription_addons (
        id, subscription_id, product_id, variant_id, quantity, unit_price, status, effective_start_date, effective_end_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))`,
      [addonId, subscriptionId, data.productId, data.variantId || null, data.quantity, unitPrice, initialStatus, effectiveStartDate]
    );

    await AuditService.log('SUBSCRIPTION_ADDON_ADDED', 'subscription_addons', addonId, user.id, {
      subscriptionId,
      productId: data.productId,
      variantId: data.variantId,
      quantity: data.quantity,
      unitPrice,
      effectiveStartDate,
      initialStatus,
    });

    const created = await db.queryOne<SubscriptionAddonRecord>(
      `SELECT sa.*, pr.name as product_name, pv.attribute_name, pv.attribute_value
       FROM subscription_addons sa
       JOIN products pr ON sa.product_id = pr.id
       LEFT JOIN product_variants pv ON sa.variant_id = pv.id
       WHERE sa.id = ?`,
      [addonId]
    );

    return created!;
  }

  /**
   * Update quantity of an eligible add-on
   */
  static async updateQuantity(
    subscriptionId: string,
    addonId: string,
    quantity: number,
    user: UserContext
  ): Promise<SubscriptionAddonRecord> {
    const sub = await db.queryOne<{ id: string; customer_id: string; status: string }>(
      'SELECT id, customer_id, status FROM subscriptions WHERE id = ?',
      [subscriptionId]
    );

    if (!sub) {
      const err = new Error('Subscription not found') as any;
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (user.role === 'customer' && user.customerId !== sub.customer_id) {
      const err = new Error('Unauthorized access to subscription') as any;
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    if (sub.status !== 'active' && sub.status !== 'paused') {
      const err = new Error(`Cannot modify add-ons for subscription in status '${sub.status}'`) as any;
      err.code = 'INVALID_STATUS';
      err.status = 400;
      throw err;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      const err = new Error('Quantity must be a positive integer') as any;
      err.code = 'INVALID_QUANTITY';
      err.status = 400;
      throw err;
    }

    const addon = await db.queryOne<SubscriptionAddonRecord>(
      'SELECT * FROM subscription_addons WHERE id = ? AND subscription_id = ?',
      [addonId, subscriptionId]
    );

    if (!addon) {
      const err = new Error('Subscription add-on not found') as any;
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (addon.status === 'removed' || addon.status === 'pending_removal') {
      const err = new Error(`Cannot update quantity of an add-on in status '${addon.status}'`) as any;
      err.code = 'CANNOT_UPDATE_REMOVED_ADDON';
      err.status = 400;
      throw err;
    }

    await db.execute(
      `UPDATE subscription_addons
       SET quantity = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [quantity, addonId]
    );

    await AuditService.log('SUBSCRIPTION_ADDON_UPDATED', 'subscription_addons', addonId, user.id, {
      previousQuantity: addon.quantity,
      newQuantity: quantity,
    });

    const updated = await db.queryOne<SubscriptionAddonRecord>(
      `SELECT sa.*, pr.name as product_name, pv.attribute_name, pv.attribute_value
       FROM subscription_addons sa
       JOIN products pr ON sa.product_id = pr.id
       LEFT JOIN product_variants pv ON sa.variant_id = pv.id
       WHERE sa.id = ?`,
      [addonId]
    );

    return updated!;
  }

  /**
   * Schedule removal of an add-on (takes effect from next billing period)
   */
  static async scheduleRemoval(
    subscriptionId: string,
    addonId: string,
    user: UserContext
  ): Promise<SubscriptionAddonRecord> {
    const sub = await db.queryOne<{ id: string; customer_id: string; status: string; next_billing_date: string }>(
      'SELECT id, customer_id, status, next_billing_date FROM subscriptions WHERE id = ?',
      [subscriptionId]
    );

    if (!sub) {
      const err = new Error('Subscription not found') as any;
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (user.role === 'customer' && user.customerId !== sub.customer_id) {
      const err = new Error('Unauthorized access to subscription') as any;
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    const addon = await db.queryOne<SubscriptionAddonRecord>(
      'SELECT * FROM subscription_addons WHERE id = ? AND subscription_id = ?',
      [addonId, subscriptionId]
    );

    if (!addon) {
      const err = new Error('Subscription add-on not found') as any;
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (addon.status === 'removed') {
      const err = new Error('Add-on is already removed') as any;
      err.code = 'ALREADY_REMOVED';
      err.status = 400;
      throw err;
    }

    if (addon.status === 'pending_removal') {
      const err = new Error('Add-on is already scheduled for removal on the next billing date') as any;
      err.code = 'ALREADY_PENDING_REMOVAL';
      err.status = 400;
      throw err;
    }

    // Business rule: effective removal on next billing cycle
    const effectiveEndDate = sub.next_billing_date;
    const today = new Date().toISOString().split('T')[0];
    const newStatus = effectiveEndDate <= today ? 'removed' : 'pending_removal';

    await db.execute(
      `UPDATE subscription_addons
       SET status = ?, effective_end_date = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [newStatus, effectiveEndDate, addonId]
    );

    await AuditService.log('SUBSCRIPTION_ADDON_REMOVED', 'subscription_addons', addonId, user.id, {
      previousStatus: addon.status,
      newStatus,
      effectiveEndDate,
    });

    const removed = await db.queryOne<SubscriptionAddonRecord>(
      `SELECT sa.*, pr.name as product_name, pv.attribute_name, pv.attribute_value
       FROM subscription_addons sa
       JOIN products pr ON sa.product_id = pr.id
       LEFT JOIN product_variants pv ON sa.variant_id = pv.id
       WHERE sa.id = ?`,
      [addonId]
    );

    return removed!;
  }

  /**
   * Helper query for Billing Engine integration:
   * Returns all add-ons that are active and effective for a given period start date.
   */
  static async getActiveAddonsForPeriod(subscriptionId: string, periodStart: string): Promise<SubscriptionAddonRecord[]> {
    return db.query<SubscriptionAddonRecord>(
      `SELECT sa.*, pr.name as product_name, pv.attribute_name, pv.attribute_value
       FROM subscription_addons sa
       JOIN products pr ON sa.product_id = pr.id
       LEFT JOIN product_variants pv ON sa.variant_id = pv.id
       WHERE sa.subscription_id = ?
         AND sa.effective_start_date <= ?
         AND (sa.effective_end_date IS NULL OR sa.effective_end_date > ?)
         AND sa.status != 'removed'`,
      [subscriptionId, periodStart, periodStart]
    );
  }
}
