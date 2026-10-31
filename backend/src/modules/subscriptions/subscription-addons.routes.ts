import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { SubscriptionAddonService } from './subscription-addons.service';

export const subscriptionAddonsRouter = Router({ mergeParams: true });

const addAddonSchema = z.object({
  product_id: z.string().min(1, 'Product ID is required'),
  variant_id: z.string().optional().nullable(),
  quantity: z.number().int('Quantity must be an integer').positive('Quantity must be greater than 0'),
  unit_price: z.number().min(0, 'Unit price cannot be negative').optional(),
});

const updateQuantitySchema = z.object({
  quantity: z.number().int('Quantity must be an integer').positive('Quantity must be greater than 0'),
});

// 1. GET /api/subscriptions/:id/addons - Retrieve add-ons belonging to a subscription
subscriptionAddonsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptionId = req.params.id;
    const addons = await SubscriptionAddonService.getAddons(subscriptionId, {
      id: req.user!.id,
      role: req.user!.role,
      customerId: req.user!.customerId,
    });

    res.json({
      data: addons,
      message: 'Subscription add-ons retrieved successfully',
    });
  } catch (err) {
    next(err);
  }
});

// 2. POST /api/subscriptions/:id/addons - Request or schedule an add-on addition
subscriptionAddonsRouter.post(
  '/',
  requireAuth,
  validateRequest(addAddonSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscriptionId = req.params.id;
      const { product_id, variant_id, quantity, unit_price } = req.body;

      const addon = await SubscriptionAddonService.addAddon(
        subscriptionId,
        {
          productId: product_id,
          variantId: variant_id,
          quantity,
          unitPrice: unit_price,
        },
        {
          id: req.user!.id,
          role: req.user!.role,
          customerId: req.user!.customerId,
        }
      );

      res.status(201).json({
        data: addon,
        message: 'Subscription add-on scheduled successfully for next billing period',
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3. PATCH /api/subscriptions/:id/addons/:addonId - Update an eligible add-on quantity
subscriptionAddonsRouter.patch(
  '/:addonId',
  requireAuth,
  validateRequest(updateQuantitySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: subscriptionId, addonId } = req.params;
      const { quantity } = req.body;

      const updated = await SubscriptionAddonService.updateQuantity(
        subscriptionId,
        addonId,
        quantity,
        {
          id: req.user!.id,
          role: req.user!.role,
          customerId: req.user!.customerId,
        }
      );

      res.json({
        data: updated,
        message: 'Subscription add-on quantity updated successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

// 4. PATCH /api/subscriptions/:id/addons/:addonId/remove - Schedule an add-on removal
subscriptionAddonsRouter.patch(
  '/:addonId/remove',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: subscriptionId, addonId } = req.params;

      const removed = await SubscriptionAddonService.scheduleRemoval(
        subscriptionId,
        addonId,
        {
          id: req.user!.id,
          role: req.user!.role,
          customerId: req.user!.customerId,
        }
      );

      res.json({
        data: removed,
        message: 'Subscription add-on scheduled for removal on next billing period',
      });
    } catch (err) {
      next(err);
    }
  }
);
