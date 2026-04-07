-- Cleanup: rewrite household_invitations policies to use helper functions
-- instead of subqueries against household_members. Functionally equivalent
-- to the previous policies (the household_members policies are no longer
-- recursive after migration 20260407000003), but cleaner and faster.

DROP POLICY IF EXISTS "Members can view household invitations" ON public.household_invitations;
CREATE POLICY "Members can view household invitations"
  ON public.household_invitations FOR SELECT TO authenticated
  USING (
    household_id = public.user_household_id()
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Owner can create invitations" ON public.household_invitations;
CREATE POLICY "Owner can create invitations"
  ON public.household_invitations FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND household_id = public.user_owned_household_id()
  );
