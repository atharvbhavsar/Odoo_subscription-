import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';

export const productsRouter = Router();

// List all products and their variants
productsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const products = await db.query('SELECT * FROM products ORDER BY name ASC');
  const variants = await db.query('SELECT * FROM product_variants');

  const productsWithVariants = products.map((prod) => ({
    ...prod,
    variants: variants.filter((v) => v.product_id === prod.id),
  }));

  res.json({
    data: productsWithVariants,
    message: 'Products retrieved successfully',
  });
});

const createProductSchema = z.object({
  name: z.string().min(1),
  type: z.string().default('service'),
  sales_price: z.number().min(0),
  cost_price: z.number().min(0).default(0),
  notes: z.string().optional(),
});

// Admin creates product
productsRouter.post('/', requireAuth, requireRole(['admin']), validateRequest(createProductSchema), async (req: Request, res: Response) => {
  const { name, type, sales_price, cost_price, notes } = req.body;
  const id = uuidv4();

  await db.execute(
    'INSERT INTO products (id, name, type, sales_price, cost_price, notes, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [id, name, type, sales_price, cost_price, notes || null]
  );

  await AuditService.log('PRODUCT_CREATED', 'products', id, req.user?.id, { name, sales_price });

  res.status(201).json({
    data: { id, name, type, sales_price, cost_price, notes, is_active: 1, variants: [] },
    message: 'Product created successfully',
  });
});

const addVariantSchema = z.object({
  attribute_name: z.string().min(1),
  attribute_value: z.string().min(1),
  price_extra: z.number(),
});

// Admin adds variant
productsRouter.post('/:id/variants', requireAuth, requireRole(['admin']), validateRequest(addVariantSchema), async (req: Request, res: Response) => {
  const productId = req.params.id;
  const product = await db.queryOne('SELECT id FROM products WHERE id = ?', [productId]);
  if (!product) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  }

  const { attribute_name, attribute_value, price_extra } = req.body;
  const variantId = uuidv4();

  await db.execute(
    'INSERT INTO product_variants (id, product_id, attribute_name, attribute_value, price_extra) VALUES (?, ?, ?, ?, ?)',
    [variantId, productId, attribute_name, attribute_value, price_extra]
  );

  await AuditService.log('PRODUCT_VARIANT_CREATED', 'product_variants', variantId, req.user?.id, { productId, attribute_value, price_extra });

  res.status(201).json({
    data: { id: variantId, product_id: productId, attribute_name, attribute_value, price_extra },
    message: 'Variant added successfully',
  });
});

