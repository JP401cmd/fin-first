
-- Table to store user corrections to auto-categorized transactions.
-- Used by the categorizer to learn from user behavior.
CREATE TABLE public.category_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  match_field text NOT NULL CHECK (match_field IN ('counterparty_name', 'description')),
  match_value text NOT NULL,
  budget_id uuid NOT NULL REFERENCES public.budgets(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one correction per user per field+value
CREATE UNIQUE INDEX idx_category_corrections_unique
  ON public.category_corrections (user_id, match_field, lower(match_value));

ALTER TABLE public.category_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own corrections"
  ON public.category_corrections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
