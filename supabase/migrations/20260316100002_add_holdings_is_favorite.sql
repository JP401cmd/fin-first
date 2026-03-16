-- =============================================
-- Migration: Add is_favorite column to holdings table
-- Same pattern as budgets.is_favorite
-- Date: 2026-03-16
-- =============================================

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
