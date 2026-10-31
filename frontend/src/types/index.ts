export type UserRole = 'admin' | 'staff' | 'customer';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  customerId?: string;
  name?: string;
}

export interface CustomerProfile {
  id: string;
  user_id: string;
  name: string;
  company_name?: string;
  phone?: string;
  address?: string;
  email?: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  attribute_name: string;
  attribute_value: string;
  price_extra: number;
  is_active?: number;
  effective_price?: number;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  type: string;
  sales_price: number;
  cost_price: number;
  notes?: string;
  is_active: number;
  created_at?: string;
  variants?: ProductVariant[];
}

export interface PlanLine {
  id: string;
  plan_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  product_name?: string;
  product_type?: string;
  sales_price?: number;
  product_is_active?: number;
  attribute_name?: string | null;
  attribute_value?: string | null;
  price_extra?: number;
  variant_is_active?: number;
  effective_price?: number;
  created_at?: string;
}

export interface Plan {
  id: string;
  name: string;
  description?: string | null;
  billing_frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  billing_interval?: number;
  price: number;
  min_qty: number;
  start_date?: string | null;
  end_date?: string | null;
  is_active: number | boolean;
  can_pause: number | boolean;
  can_renew: number | boolean;
  can_close_early: number | boolean;
  auto_close: number | boolean;
  created_at?: string;
  updated_at?: string;
  lines?: PlanLine[];
}

export interface Tax {
  id: string;
  name: string;
  rate_percentage: number;
  is_active: number;
}

export interface Discount {
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
  is_active: number;
}

export interface QuotationLine {
  id: string;
  quotation_id: string;
  product_id: string;
  variant_id?: string | null;
  product_name?: string;
  attribute_value?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string;
  customer_name?: string;
  company_name?: string;
  plan_id: string;
  plan_name?: string;
  billing_frequency?: string;
  discount_id?: string | null;
  tax_id?: string | null;
  status: 'draft' | 'quotation' | 'confirmed' | 'cancelled';
  valid_until: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  lines?: QuotationLine[];
}

export interface SubscriptionLine {
  id: string;
  subscription_id: string;
  product_id: string;
  variant_id?: string | null;
  product_name?: string;
  attribute_value?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Subscription {
  id: string;
  subscription_number: string;
  customer_id: string;
  customer_name?: string;
  company_name?: string;
  plan_id: string;
  plan_name?: string;
  status: 'draft' | 'quotation' | 'confirmed' | 'active' | 'paused' | 'closed' | 'expired';
  start_date: string;
  end_date?: string;
  next_billing_date: string;
  billing_frequency: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  can_pause?: number;
  can_renew?: number;
  can_close_early?: number;
  created_at: string;
  lines?: SubscriptionLine[];
  addons?: SubscriptionAddon[];
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  product_id: string;
  variant_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: string;
  gateway_payment_id?: string;
  status: 'pending' | 'successful' | 'failed';
  recorded_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  subscription_id: string;
  subscription_number?: string;
  customer_id: string;
  customer_name?: string;
  company_name?: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: 'draft' | 'confirmed' | 'partially_paid' | 'paid' | 'cancelled';
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  created_at: string;
  lines?: InvoiceLine[];
  payments?: Payment[];
}

export interface DashboardSummary {
  mrr: number;
  activeSubscriptions: number;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  recentInvoices: any[];
  recentPayments: any[];
  overdueAging?: Array<{ bucket: string; count: number; amount: number }>;
  monthlyCashflow?: Array<{ month: string; invoiced: number; collected: number }>;
  subscriptionsByStatus?: Array<{ status: string; count: number; totalValue: number }>;
  subscriptionsByPlan?: Array<{ planName: string; count: number; totalValue: number }>;
  filtersApplied?: { startDate?: string; endDate?: string };
}

export interface QuotationTemplateLine {
  id: string;
  template_id: string;
  product_id: string;
  product_name?: string;
  product_sales_price?: number;
  product_type?: string;
  variant_id?: string | null;
  attribute_name?: string;
  attribute_value?: string;
  price_extra?: number;
  quantity: number;
}

export interface QuotationTemplate {
  id: string;
  name: string;
  description?: string | null;
  default_plan_id?: string | null;
  default_plan_name?: string;
  default_plan_price?: number;
  default_plan_frequency?: string;
  is_active: number;
  line_count?: number;
  created_at: string;
  updated_at?: string;
  lines?: QuotationTemplateLine[];
}

export interface SkippedSubscriptionRecord {
  subscriptionId: string;
  subscriptionNumber?: string;
  reason: string;
}

export interface AlreadyBilledRecord {
  subscriptionId: string;
  subscriptionNumber?: string;
  periodStart: string;
  reason: string;
}

export interface BillingRunResult {
  runId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  subscriptionsChecked: number;
  invoicesGenerated: number;
  alreadyBilledCount: number;
  alreadyBilledRecords: AlreadyBilledRecord[];
  skippedCount: number;
  skippedReasons: SkippedSubscriptionRecord[];
  errors: Array<{ subscriptionId: string; error: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; amount: number; periodStart: string; periodEnd: string }>;
}

export interface SubscriptionAddon {
  id: string;
  subscription_id: string;
  product_id: string;
  product_name?: string;
  variant_id?: string | null;
  attribute_name?: string | null;
  attribute_value?: string | null;
  quantity: number;
  unit_price: number;
  status: 'pending_activation' | 'active' | 'pending_removal' | 'removed';
  effective_start_date: string;
  effective_end_date?: string | null;
  created_at: string;
}
