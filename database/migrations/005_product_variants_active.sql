-- Migration 005: Add is_active column to product_variants for variant lifecycle management
ALTER TABLE product_variants ADD COLUMN is_active INTEGER DEFAULT 1;
