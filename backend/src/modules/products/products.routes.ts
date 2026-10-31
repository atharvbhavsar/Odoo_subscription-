import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';
import { PricingService } from '../discounts/pricing.service';

export const productsRouter = Router();

// Validation Schemas
const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  type: z.string().default('service'),
  sales_price: z.number().min(0, 'Sales price must be non-negative'),
  cost_price: z.number().min(0, 'Cost price must be non-negative').default(0),
  notes: z.string().optional().nullable(),
});

const updateProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name cannot be empty').optional(),
  type: z.string().optional(),
  sales_price: z.number().min(0, 'Sales price must be non-negative').optional(),
  cost_price: z.number().min(0, 'Cost price must be non-negative').optional(),
  notes: z.string().optional().nullable(),
  is_active: z.number().int().min(0).max(1).optional(),
});

const addVariantSchema = z.object({
  attribute_name: z.string().trim().min(1, 'Attribute name is required'),
  attribute_value: z.string().trim().min(1, 'Attribute value is required'),
  price_extra: z.number().default(0),
});

const updateVariantSchema = z.object({
  attribute_name: z.string().trim().min(1, 'Attribute name cannot be empty').optional(),
  attribute_value: z.string().trim().min(1, 'Attribute value cannot be empty').optional(),
  price_extra: z.number().optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

// Helper to format variant with calculated effective price
function formatVariant(v: any, productSalesPrice: number) {
  return {
    id: v.id,
    product_id: v.product_id,
    attribute_name: v.attribute_name,
    attribute_value: v.attribute_value,
    price_extra: v.price_extra,
    is_active: v.is_active !== undefined ? v.is_active : 1,
    effective_price: PricingService.round(productSalesPrice + v.price_extra),
    created_at: v.created_at,
  };
}

// 1. GET /api/products - List all products with search & status filters
productsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const { search, status } = req.query;

  let sql = 'SELECT * FROM products WHERE 1=1';
  const params: any[] = [];

  if (status === 'active') {
    sql += ' AND is_active = 1';
  } else if (status === 'inactive') {
    sql += ' AND is_active = 0';
  }

  if (search && typeof search === 'string' && search.trim()) {
    sql += ' AND (name LIKE ? OR notes LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  sql += ' ORDER BY name ASC';

  const products = await db.query(sql, params);
  const variants = await db.query('SELECT * FROM product_variants ORDER BY attribute_name ASC, attribute_value ASC');

  const productsWithVariants = products.map((prod) => ({
    ...prod,
    variants: variants
      .filter((v) => v.product_id === prod.id)
      .map((v) => formatVariant(v, prod.sales_price)),
  }));

  res.json({
    data: productsWithVariants,
    message: 'Products retrieved successfully',
  });
});

// 2. GET /api/products/:id - Get a single product details with variants
productsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const product = await db.queryOne('SELECT * FROM products WHERE id = ?', [id]);

  if (!product) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  }

  const variants = await db.query(
    'SELECT * FROM product_variants WHERE product_id = ? ORDER BY attribute_name ASC, attribute_value ASC',
    [id]
  );

  res.json({
    data: {
      ...product,
      variants: variants.map((v) => formatVariant(v, product.sales_price)),
    },
    message: 'Product details retrieved successfully',
  });
});

// 3. POST /api/products - Create a new product (staff / admin)
productsRouter.post(
  '/',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(createProductSchema),
  async (req: Request, res: Response) => {
    const { name, type, sales_price, cost_price, notes } = req.body;
    const id = uuidv4();

    await db.execute(
      'INSERT INTO products (id, name, type, sales_price, cost_price, notes, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, name, type, sales_price, cost_price || 0, notes || null]
    );

    await AuditService.log('PRODUCT_CREATED', 'products', id, req.user?.id, { name, sales_price, cost_price });

    const created = await db.queryOne('SELECT * FROM products WHERE id = ?', [id]);

    res.status(201).json({
      data: { ...created, variants: [] },
      message: 'Product created successfully',
    });
  }
);

// 4. PATCH /api/products/:id - Update product details (staff / admin)
productsRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(updateProductSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const existing = await db.queryOne('SELECT * FROM products WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (req.body.name !== undefined) {
      updates.push('name = ?');
      params.push(req.body.name);
    }
    if (req.body.type !== undefined) {
      updates.push('type = ?');
      params.push(req.body.type);
    }
    if (req.body.sales_price !== undefined) {
      updates.push('sales_price = ?');
      params.push(req.body.sales_price);
    }
    if (req.body.cost_price !== undefined) {
      updates.push('cost_price = ?');
      params.push(req.body.cost_price);
    }
    if (req.body.notes !== undefined) {
      updates.push('notes = ?');
      params.push(req.body.notes);
    }
    if (req.body.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(req.body.is_active);
    }

    if (updates.length > 0) {
      params.push(id);
      await db.execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    await AuditService.log('PRODUCT_UPDATED', 'products', id, req.user?.id, req.body);

    const updated = await db.queryOne('SELECT * FROM products WHERE id = ?', [id]);
    const variants = await db.query('SELECT * FROM product_variants WHERE product_id = ?', [id]);

    res.json({
      data: {
        ...updated,
        variants: variants.map((v) => formatVariant(v, updated.sales_price)),
      },
      message: 'Product updated successfully',
    });
  }
);

// 5. PATCH /api/products/:id/activate - Activate product (staff / admin)
productsRouter.patch('/:id/activate', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const product = await db.queryOne('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  }

  await db.execute('UPDATE products SET is_active = 1 WHERE id = ?', [id]);
  await AuditService.log('PRODUCT_ACTIVATED', 'products', id, req.user?.id);

  const updated = await db.queryOne('SELECT * FROM products WHERE id = ?', [id]);
  const variants = await db.query('SELECT * FROM product_variants WHERE product_id = ?', [id]);

  res.json({
    data: {
      ...updated,
      variants: variants.map((v) => formatVariant(v, updated.sales_price)),
    },
    message: 'Product activated successfully',
  });
});

// 6. PATCH /api/products/:id/deactivate - Soft deactivate product (staff / admin)
productsRouter.patch('/:id/deactivate', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const product = await db.queryOne('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  }

  // Soft deactivation preserves historical transactions
  await db.execute('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  await AuditService.log('PRODUCT_DEACTIVATED', 'products', id, req.user?.id);

  const updated = await db.queryOne('SELECT * FROM products WHERE id = ?', [id]);
  const variants = await db.query('SELECT * FROM product_variants WHERE product_id = ?', [id]);

  res.json({
    data: {
      ...updated,
      variants: variants.map((v) => formatVariant(v, updated.sales_price)),
    },
    message: 'Product deactivated successfully',
  });
});

// 7. GET /api/products/:id/variants - List variants of a product
productsRouter.get('/:id/variants', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const product = await db.queryOne<{ id: string; sales_price: number }>('SELECT id, sales_price FROM products WHERE id = ?', [id]);
  if (!product) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  }

  const variants = await db.query(
    'SELECT * FROM product_variants WHERE product_id = ? ORDER BY attribute_name ASC, attribute_value ASC',
    [id]
  );

  res.json({
    data: variants.map((v) => formatVariant(v, product.sales_price)),
    message: 'Product variants retrieved successfully',
  });
});

// 8. GET /api/products/:id/variants/:variantId - Get single variant
productsRouter.get('/:id/variants/:variantId', requireAuth, async (req: Request, res: Response) => {
  const { id, variantId } = req.params;
  const product = await db.queryOne<{ id: string; sales_price: number }>('SELECT id, sales_price FROM products WHERE id = ?', [id]);
  if (!product) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  }

  const variant = await db.queryOne('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [variantId, id]);
  if (!variant) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Variant not found on this product' } });
  }

  res.json({
    data: formatVariant(variant, product.sales_price),
    message: 'Variant details retrieved successfully',
  });
});

// 9. POST /api/products/:id/variants - Add variant to product (staff / admin)
productsRouter.post(
  '/:id/variants',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(addVariantSchema),
  async (req: Request, res: Response) => {
    const productId = req.params.id;
    const product = await db.queryOne<{ id: string; name: string; sales_price: number; is_active: number }>(
      'SELECT id, name, sales_price, is_active FROM products WHERE id = ?',
      [productId]
    );

    if (!product) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    const { attribute_name, attribute_value, price_extra } = req.body;

    // Validate that resulting effective price is non-negative
    const effectivePrice = product.sales_price + price_extra;
    if (effectivePrice < 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PRICE',
          message: `Effective price cannot be negative (Sales price $${product.sales_price} + Price extra $${price_extra} = $${effectivePrice})`,
        },
      });
    }

    // Check duplicate variant on this product
    const duplicate = await db.queryOne(
      'SELECT id FROM product_variants WHERE product_id = ? AND LOWER(attribute_name) = LOWER(?) AND LOWER(attribute_value) = LOWER(?)',
      [productId, attribute_name, attribute_value]
    );

    if (duplicate) {
      return res.status(400).json({
        error: {
          code: 'DUPLICATE_VARIANT',
          message: `Variant '${attribute_name}: ${attribute_value}' already exists on this product`,
        },
      });
    }

    const variantId = uuidv4();
    await db.execute(
      'INSERT INTO product_variants (id, product_id, attribute_name, attribute_value, price_extra, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [variantId, productId, attribute_name, attribute_value, price_extra]
    );

    await AuditService.log('PRODUCT_VARIANT_CREATED', 'product_variants', variantId, req.user?.id, {
      productId,
      attribute_name,
      attribute_value,
      price_extra,
    });

    const created = await db.queryOne('SELECT * FROM product_variants WHERE id = ?', [variantId]);

    res.status(201).json({
      data: formatVariant(created, product.sales_price),
      message: 'Variant added successfully',
    });
  }
);

// 10. PATCH /api/products/:id/variants/:variantId - Edit variant (staff / admin)
productsRouter.patch(
  '/:id/variants/:variantId',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(updateVariantSchema),
  async (req: Request, res: Response) => {
    const { id: productId, variantId } = req.params;
    const product = await db.queryOne<{ id: string; sales_price: number }>(
      'SELECT id, sales_price FROM products WHERE id = ?',
      [productId]
    );

    if (!product) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    const variant = await db.queryOne<{ id: string; price_extra: number }>(
      'SELECT * FROM product_variants WHERE id = ? AND product_id = ?',
      [variantId, productId]
    );

    if (!variant) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Variant not found on this product' } });
    }

    const priceExtraToCheck = req.body.price_extra !== undefined ? req.body.price_extra : variant.price_extra;
    const effectivePrice = product.sales_price + priceExtraToCheck;
    if (effectivePrice < 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PRICE',
          message: `Effective price cannot be negative (Sales price $${product.sales_price} + Price extra $${priceExtraToCheck} = $${effectivePrice})`,
        },
      });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (req.body.attribute_name !== undefined) {
      updates.push('attribute_name = ?');
      params.push(req.body.attribute_name);
    }
    if (req.body.attribute_value !== undefined) {
      updates.push('attribute_value = ?');
      params.push(req.body.attribute_value);
    }
    if (req.body.price_extra !== undefined) {
      updates.push('price_extra = ?');
      params.push(req.body.price_extra);
    }
    if (req.body.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(req.body.is_active);
    }

    if (updates.length > 0) {
      params.push(variantId, productId);
      await db.execute(`UPDATE product_variants SET ${updates.join(', ')} WHERE id = ? AND product_id = ?`, params);
    }

    await AuditService.log('PRODUCT_VARIANT_UPDATED', 'product_variants', variantId, req.user?.id, req.body);

    const updated = await db.queryOne('SELECT * FROM product_variants WHERE id = ?', [variantId]);

    res.json({
      data: formatVariant(updated, product.sales_price),
      message: 'Variant updated successfully',
    });
  }
);

// 11. PATCH /api/products/:id/variants/:variantId/activate - Activate variant (staff / admin)
productsRouter.patch(
  '/:id/variants/:variantId/activate',
  requireAuth,
  requireRole(['admin', 'staff']),
  async (req: Request, res: Response) => {
    const { id: productId, variantId } = req.params;
    const product = await db.queryOne<{ id: string; sales_price: number }>('SELECT id, sales_price FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    const variant = await db.queryOne('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [variantId, productId]);
    if (!variant) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Variant not found on this product' } });
    }

    await db.execute('UPDATE product_variants SET is_active = 1 WHERE id = ? AND product_id = ?', [variantId, productId]);
    await AuditService.log('PRODUCT_VARIANT_ACTIVATED', 'product_variants', variantId, req.user?.id);

    const updated = await db.queryOne('SELECT * FROM product_variants WHERE id = ?', [variantId]);

    res.json({
      data: formatVariant(updated, product.sales_price),
      message: 'Variant activated successfully',
    });
  }
);

// 12. PATCH /api/products/:id/variants/:variantId/deactivate - Soft deactivate variant (staff / admin)
productsRouter.patch(
  '/:id/variants/:variantId/deactivate',
  requireAuth,
  requireRole(['admin', 'staff']),
  async (req: Request, res: Response) => {
    const { id: productId, variantId } = req.params;
    const product = await db.queryOne<{ id: string; sales_price: number }>('SELECT id, sales_price FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    const variant = await db.queryOne('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [variantId, productId]);
    if (!variant) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Variant not found on this product' } });
    }

    // Soft deactivation preserves historical quotation lines and invoices
    await db.execute('UPDATE product_variants SET is_active = 0 WHERE id = ? AND product_id = ?', [variantId, productId]);
    await AuditService.log('PRODUCT_VARIANT_DEACTIVATED', 'product_variants', variantId, req.user?.id);

    const updated = await db.queryOne('SELECT * FROM product_variants WHERE id = ?', [variantId]);

    res.json({
      data: formatVariant(updated, product.sales_price),
      message: 'Variant deactivated successfully',
    });
  }
);
