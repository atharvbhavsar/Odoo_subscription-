import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { AuditService } from '../audit/audit.service';

export const quotationTemplatesRouter = Router();

// 1. List quotation templates
quotationTemplatesRouter.get('/', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const includeInactive = req.query.include_inactive === 'true';

  let sql = `
    SELECT qt.*, p.name as default_plan_name, p.billing_frequency as default_plan_frequency, p.price as default_plan_price,
           (SELECT COUNT(*) FROM quotation_template_lines qtl WHERE qtl.template_id = qt.id) as line_count
    FROM quotation_templates qt
    LEFT JOIN plans p ON qt.default_plan_id = p.id
  `;

  if (!includeInactive) {
    sql += ' WHERE qt.is_active = 1';
  }

  sql += ' ORDER BY qt.is_active DESC, qt.name ASC';

  const templates = await db.query(sql);
  res.json({
    data: templates,
    message: 'Quotation templates retrieved successfully',
  });
});

// 2. Get single quotation template with lines
quotationTemplatesRouter.get('/:id', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const template = await db.queryOne<{
    id: string;
    name: string;
    description: string | null;
    default_plan_id: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
    default_plan_name?: string;
    default_plan_price?: number;
    default_plan_frequency?: string;
  }>(
    `SELECT qt.*, p.name as default_plan_name, p.billing_frequency as default_plan_frequency, p.price as default_plan_price
     FROM quotation_templates qt
     LEFT JOIN plans p ON qt.default_plan_id = p.id
     WHERE qt.id = ?`,
    [req.params.id]
  );

  if (!template) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Quotation template not found' },
    });
  }

  const lines = await db.query(
    `SELECT qtl.*, pr.name as product_name, pr.sales_price as product_sales_price, pr.type as product_type,
            pv.attribute_name, pv.attribute_value, pv.price_extra
     FROM quotation_template_lines qtl
     JOIN products pr ON qtl.product_id = pr.id
     LEFT JOIN product_variants pv ON qtl.variant_id = pv.id
     WHERE qtl.template_id = ?
     ORDER BY qtl.created_at ASC`,
    [template.id]
  );

  res.json({
    data: {
      ...template,
      lines,
    },
    message: 'Quotation template details retrieved',
  });
});

const templateLineSchema = z.object({
  product_id: z.string().min(1, 'Product ID is required'),
  variant_id: z.string().optional().nullable(),
  quantity: z.number().int('Quantity must be an integer').positive('Quantity must be a positive number'),
});

const createTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required'),
  description: z.string().optional().nullable(),
  default_plan_id: z.string().optional().nullable(),
  lines: z.array(templateLineSchema).default([]),
});

// Helper to validate plan and lines
async function validateTemplateReferences(
  default_plan_id?: string | null,
  lines?: Array<{ product_id: string; variant_id?: string | null; quantity: number }>
): Promise<{ error?: { code: string; message: string } }> {
  if (default_plan_id) {
    const plan = await db.queryOne<{ id: string; is_active: number; start_date?: string | null; end_date?: string | null }>(
      'SELECT id, is_active, start_date, end_date FROM plans WHERE id = ?',
      [default_plan_id]
    );
    if (!plan) {
      return { error: { code: 'INVALID_PLAN', message: 'Default plan does not exist' } };
    }
    if (!plan.is_active) {
      return { error: { code: 'INACTIVE_PLAN', message: 'Selected default plan is inactive' } };
    }
    const today = new Date().toISOString().split('T')[0];
    if (plan.start_date && today < plan.start_date) {
      return { error: { code: 'PLAN_NOT_AVAILABLE', message: `Default plan is not yet available (available from ${plan.start_date})` } };
    }
    if (plan.end_date && today > plan.end_date) {
      return { error: { code: 'PLAN_EXPIRED', message: `Default plan availability expired on ${plan.end_date}` } };
    }
  }

  if (lines && lines.length > 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const product = await db.queryOne<{ id: string; is_active: number }>(
        'SELECT id, is_active FROM products WHERE id = ?',
        [line.product_id]
      );
      if (!product) {
        return {
          error: {
            code: 'INVALID_PRODUCT',
            message: `Product at line ${i + 1} with ID '${line.product_id}' does not exist`,
          },
        };
      }
      if (!product.is_active) {
        return {
          error: {
            code: 'INACTIVE_PRODUCT',
            message: `Product at line ${i + 1} with ID '${line.product_id}' is inactive`,
          },
        };
      }

      if (line.variant_id) {
        const variant = await db.queryOne<{ id: string; product_id: string; is_active: number }>(
          'SELECT id, product_id, is_active FROM product_variants WHERE id = ?',
          [line.variant_id]
        );
        if (!variant) {
          return {
            error: {
              code: 'INVALID_VARIANT',
              message: `Variant at line ${i + 1} with ID '${line.variant_id}' does not exist`,
            },
          };
        }
        if (variant.is_active === 0) {
          return {
            error: {
              code: 'INACTIVE_VARIANT',
              message: `Variant at line ${i + 1} with ID '${line.variant_id}' is inactive`,
            },
          };
        }
        if (variant.product_id !== line.product_id) {
          return {
            error: {
              code: 'INVALID_VARIANT_COMBINATION',
              message: `Variant '${line.variant_id}' does not belong to product '${line.product_id}'`,
            },
          };
        }
      }
    }
  }

  return {};
}

// 3. Create quotation template
quotationTemplatesRouter.post(
  '/',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(createTemplateSchema),
  async (req: Request, res: Response) => {
    const { name, description, default_plan_id, lines } = req.body;

    const validation = await validateTemplateReferences(default_plan_id, lines);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const templateId = uuidv4();
    const createdLines: any[] = [];

    await db.transaction(async () => {
      await db.execute(
        `INSERT INTO quotation_templates (id, name, description, default_plan_id, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [templateId, name, description || null, default_plan_id || null]
      );

      for (const line of lines) {
        const lineId = uuidv4();
        await db.execute(
          `INSERT INTO quotation_template_lines (id, template_id, product_id, variant_id, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [lineId, templateId, line.product_id, line.variant_id || null, line.quantity]
        );
        createdLines.push({
          id: lineId,
          template_id: templateId,
          product_id: line.product_id,
          variant_id: line.variant_id || null,
          quantity: line.quantity,
        });
      }
    });

    await AuditService.log('QUOTATION_TEMPLATE_CREATED', 'quotation_templates', templateId, req.user?.id, {
      name,
      line_count: lines.length,
    });

    res.status(201).json({
      data: {
        id: templateId,
        name,
        description: description || null,
        default_plan_id: default_plan_id || null,
        is_active: 1,
        lines: createdLines,
      },
      message: 'Quotation template created successfully',
    });
  }
);

const updateTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name cannot be empty').optional(),
  description: z.string().optional().nullable(),
  default_plan_id: z.string().optional().nullable(),
  is_active: z.number().int().min(0).max(1).optional(),
  lines: z.array(templateLineSchema).optional(),
});

// 4. Update quotation template safely
quotationTemplatesRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(updateTemplateSchema),
  async (req: Request, res: Response) => {
    const templateId = req.params.id;

    const existing = await db.queryOne<{ id: string; name: string; description: string | null; default_plan_id: string | null; is_active: number }>(
      'SELECT * FROM quotation_templates WHERE id = ?',
      [templateId]
    );

    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Quotation template not found' },
      });
    }

    const { name, description, default_plan_id, is_active, lines } = req.body;

    const planToCheck = default_plan_id !== undefined ? default_plan_id : existing.default_plan_id;
    const validation = await validateTemplateReferences(planToCheck, lines);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    await db.transaction(async () => {
      const updatedName = name !== undefined ? name : existing.name;
      const updatedDescription = description !== undefined ? description : existing.description;
      const updatedPlanId = default_plan_id !== undefined ? default_plan_id : existing.default_plan_id;
      const updatedActive = is_active !== undefined ? is_active : existing.is_active;

      await db.execute(
        `UPDATE quotation_templates
         SET name = ?, description = ?, default_plan_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [updatedName, updatedDescription, updatedPlanId, updatedActive, templateId]
      );

      // If lines array was explicitly supplied, replace existing lines atomically
      if (lines !== undefined) {
        await db.execute('DELETE FROM quotation_template_lines WHERE template_id = ?', [templateId]);
        for (const line of lines) {
          await db.execute(
            `INSERT INTO quotation_template_lines (id, template_id, product_id, variant_id, quantity)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), templateId, line.product_id, line.variant_id || null, line.quantity]
          );
        }
      }
    });

    await AuditService.log('QUOTATION_TEMPLATE_UPDATED', 'quotation_templates', templateId, req.user?.id, {
      name,
      updated_lines: lines ? lines.length : undefined,
    });

    const updatedTemplate = await db.queryOne(
      `SELECT qt.*, p.name as default_plan_name
       FROM quotation_templates qt
       LEFT JOIN plans p ON qt.default_plan_id = p.id
       WHERE qt.id = ?`,
      [templateId]
    );
    const updatedLines = await db.query('SELECT * FROM quotation_template_lines WHERE template_id = ?', [templateId]);

    res.json({
      data: {
        ...updatedTemplate,
        lines: updatedLines,
      },
      message: 'Quotation template updated successfully',
    });
  }
);

// 5. Deactivate quotation template
quotationTemplatesRouter.patch(
  '/:id/deactivate',
  requireAuth,
  requireRole(['admin', 'staff']),
  async (req: Request, res: Response) => {
    const templateId = req.params.id;

    const existing = await db.queryOne<{ id: string; is_active: number }>(
      'SELECT id, is_active FROM quotation_templates WHERE id = ?',
      [templateId]
    );

    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Quotation template not found' },
      });
    }

    await db.execute(
      'UPDATE quotation_templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [templateId]
    );

    await AuditService.log('QUOTATION_TEMPLATE_DEACTIVATED', 'quotation_templates', templateId, req.user?.id);

    res.json({
      data: {
        id: templateId,
        is_active: 0,
      },
      message: 'Quotation template deactivated successfully',
    });
  }
);
