import { db } from '../../config/database';

export interface PricingLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice?: number;
}

export interface CalculatedLine {
  productId: string;
  variantId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PricingResult {
  lines: CalculatedLine[];
  subtotal: number;
  discountAmount: number;
  discountId?: string | null;
  taxAmount: number;
  taxId?: string | null;
  totalAmount: number;
}

export interface PricingOptions {
  evalDate?: string;
  allowInactiveProducts?: boolean;
}

export class PricingService {
  static round(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  static async calculatePricing(
    lineInputs: PricingLineInput[],
    discountId?: string | null,
    taxId?: string | null,
    options?: PricingOptions | string
  ): Promise<PricingResult> {
    const opts: PricingOptions = typeof options === 'string' ? { evalDate: options } : options || {};
    const evalDate = opts.evalDate || new Date().toISOString().split('T')[0];
    const allowInactive = opts.allowInactiveProducts ?? false;

    const lines: CalculatedLine[] = [];
    let subtotal = 0;
    let totalQuantity = 0;

    for (const input of lineInputs) {
      const product = await db.queryOne<{ id: string; name: string; sales_price: number; is_active: number }>(
        'SELECT id, name, sales_price, is_active FROM products WHERE id = ?',
        [input.productId]
      );

      if (!product) {
        throw new Error(`Product with ID ${input.productId} not found`);
      }

      if (product.is_active === 0 && !allowInactive) {
        throw new Error(`Product '${product.name}' is inactive and cannot be selected for new transactions`);
      }

      let unitPrice = input.unitPrice !== undefined ? input.unitPrice : product.sales_price;
      let description = product.name;

      if (input.variantId) {
        const variant = await db.queryOne<{
          id: string;
          product_id: string;
          attribute_name: string;
          attribute_value: string;
          price_extra: number;
          is_active: number;
        }>(
          'SELECT id, product_id, attribute_name, attribute_value, price_extra, is_active FROM product_variants WHERE id = ?',
          [input.variantId]
        );

        if (!variant) {
          throw new Error(`Variant with ID ${input.variantId} not found`);
        }

        if (variant.product_id !== input.productId) {
          throw new Error(`Variant '${variant.attribute_value}' does not belong to product '${product.name}'`);
        }

        if (variant.is_active === 0 && !allowInactive) {
          throw new Error(`Variant '${variant.attribute_value}' is inactive and cannot be selected for new transactions`);
        }

        if (input.unitPrice === undefined) {
          unitPrice += variant.price_extra;
        }
        description += ` (${variant.attribute_name}: ${variant.attribute_value})`;
      }

      const lineSubtotal = this.round(unitPrice * input.quantity);
      subtotal += lineSubtotal;
      totalQuantity += input.quantity;

      lines.push({
        productId: product.id,
        variantId: input.variantId || null,
        description,
        quantity: input.quantity,
        unitPrice: this.round(unitPrice),
        subtotal: lineSubtotal,
      });
    }

    subtotal = this.round(subtotal);

    // Apply Discount
    let discountAmount = 0;
    if (discountId) {
      const discount = await db.queryOne<{
        id: string;
        code: string;
        type: 'fixed' | 'percentage';
        value: number;
        min_purchase_amount: number;
        min_quantity: number;
        start_date?: string;
        end_date?: string;
        max_uses: number;
        used_count: number;
        applicable_product_id?: string | null;
        is_active: number;
      }>('SELECT * FROM discounts WHERE id = ?', [discountId]);

      if (discount && discount.is_active) {
        const now = new Date().toISOString().split('T')[0];
        const withinDates =
          (!discount.start_date || discount.start_date <= evalDate) &&
          (!discount.end_date || discount.end_date >= evalDate);
        const withinUsage = !discount.max_uses || discount.used_count < discount.max_uses;
        const meetsPurchase = subtotal >= (discount.min_purchase_amount || 0);
        const meetsQuantity = totalQuantity >= (discount.min_quantity || 0);

        if (withinDates && withinUsage && meetsPurchase && meetsQuantity) {
          let eligibleSubtotal = subtotal;
          if (discount.applicable_product_id) {
            eligibleSubtotal = lines
              .filter((l) => l.productId === discount.applicable_product_id)
              .reduce((sum, l) => sum + l.subtotal, 0);
            eligibleSubtotal = this.round(eligibleSubtotal);
          }

          if (eligibleSubtotal > 0) {
            if (discount.type === 'percentage') {
              discountAmount = this.round((eligibleSubtotal * discount.value) / 100);
            } else {
              discountAmount = this.round(Math.min(discount.value, eligibleSubtotal));
            }
          }
        }
      }
    }

    const discountedSubtotal = Math.max(0, subtotal - discountAmount);

    // Apply Tax
    let taxAmount = 0;
    if (taxId) {
      const tax = await db.queryOne<{
        id: string;
        name: string;
        rate_percentage: number;
        start_date?: string;
        end_date?: string;
        is_active: number;
      }>('SELECT * FROM taxes WHERE id = ?', [taxId]);

      if (tax && tax.is_active) {
        const now = new Date().toISOString().split('T')[0];
        const withinTaxDates =
          (!tax.start_date || tax.start_date <= evalDate) &&
          (!tax.end_date || tax.end_date >= evalDate);

        if (withinTaxDates) {
          taxAmount = this.round((discountedSubtotal * tax.rate_percentage) / 100);
        }
      }
    }

    const totalAmount = this.round(discountedSubtotal + taxAmount);

    return {
      lines,
      subtotal,
      discountAmount,
      discountId: discountAmount > 0 ? discountId : null,
      taxAmount,
      taxId: taxAmount > 0 ? taxId : null,
      totalAmount,
    };
  }
}
