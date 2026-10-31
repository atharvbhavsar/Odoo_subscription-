-- Migration 007: Tax and Discount Improvements
ALTER TABLE taxes ADD COLUMN description TEXT;
ALTER TABLE taxes ADD COLUMN start_date TEXT;
ALTER TABLE taxes ADD COLUMN end_date TEXT;
ALTER TABLE taxes ADD COLUMN updated_at TIMESTAMP;

ALTER TABLE discounts ADD COLUMN description TEXT;
ALTER TABLE discounts ADD COLUMN applicable_product_id TEXT REFERENCES products(id);
ALTER TABLE discounts ADD COLUMN updated_at TIMESTAMP;
