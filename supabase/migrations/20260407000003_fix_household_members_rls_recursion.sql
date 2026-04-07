-- Fix: infinite recursion in RLS policies for household_members.
-- The original policies queried household_members from inside their own USING
-- clauses, which re-triggered the policy → infinite recursion. Same pattern
-- broke the households table policies that referenced household_members.
--
-- Fix: introduce a SECURITY DEFINER helper user_owned_household_id() (RLS-bypassing)
-- and rewrite all four household_members policies + the two recursive households
-- policies to use the helpers instead of self-referential subqueries.

-- 1. New helper: returns the household the user OWNS (or NULL)
CREATE OR REPLACE FUNCTION public.user_owned_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM household_members
   WHERE user_id = auth.uid() AND role = 'owner'
   LIMIT 1;
$$;

-- 2. Drop & recreate household_members policies (no self-reference)
DROP POLICY IF EXISTS "Members can view household members" ON public.household_members;
CREATE POLICY "Members can view household members"
  ON public.household_members FOR SELECT TO authenticated
  USING (household_id = public.user_household_id());

DROP POLICY IF EXISTS "Can insert household members" ON public.household_members;
CREATE POLICY "Can insert household members"
  ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (
    household_id = public.user_owned_household_id()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Owner can update household members" ON public.household_members;
CREATE POLICY "Owner can update household members"
  ON public.household_members FOR UPDATE TO authenticated
  USING (household_id = public.user_owned_household_id());

DROP POLICY IF EXISTS "Members can leave or owner can remove" ON public.household_members;
CREATE POLICY "Members can leave or owner can remove"
  ON public.household_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR household_id = public.user_owned_household_id()
  );

-- 3. Replace households policies that referenced household_members
DROP POLICY IF EXISTS "Members can view own household" ON public.households;
CREATE POLICY "Members can view own household"
  ON public.households FOR SELECT TO authenticated
  USING (id = public.user_household_id());

DROP POLICY IF EXISTS "Owner can update household" ON public.households;
CREATE POLICY "Owner can update household"
  ON public.households FOR UPDATE TO authenticated
  USING (id = public.user_owned_household_id());
