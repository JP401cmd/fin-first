-- In-app feedback van gebruikers (tester-feedbackloop).
-- Bron: /mijn/feedback → POST /api/feedback (auth-gated) → public.feedback.
-- Beheer: /beheer/feedback → GET/PATCH /api/admin/feedback (superadmin-gated).
--
-- LET OP — drift-backfill: deze tabel is ooit direct op de remote aangemaakt
-- (er bestond nog geen migratiebestand). Deze migratie legt het schema
-- reproduceerbaar vast zodat `supabase db reset` de tabel lokaal opbouwt.
-- Alles is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS) zodat re-apply
-- op de remote — waar de tabel al bestaat — een no-op is. Exact gelijk aan
-- de live-definitie (kolommen, checks, index, RLS) geverifieerd 13-07-2026.

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                       -- geen FK op remote; bewust behouden
  email TEXT,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug', 'idea', 'question', 'other')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_created_idx
  ON public.feedback USING btree (created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Eigen inzendingen: gebruiker mag alleen op eigen naam inserten.
DROP POLICY IF EXISTS "feedback own insert" ON public.feedback;
CREATE POLICY "feedback own insert" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Beheer leest alle feedback (superadmin).
DROP POLICY IF EXISTS "feedback superadmin select" ON public.feedback;
CREATE POLICY "feedback superadmin select" ON public.feedback
  FOR SELECT TO authenticated
  USING (is_superadmin());

-- Beheer zet feedback op 'gelezen' (superadmin).
DROP POLICY IF EXISTS "feedback superadmin update" ON public.feedback;
CREATE POLICY "feedback superadmin update" ON public.feedback
  FOR UPDATE TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());
