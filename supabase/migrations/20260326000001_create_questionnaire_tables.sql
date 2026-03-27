-- Questionnaire system for test phase feedback

-- ── questionnaires ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_active_questionnaires" ON questionnaires
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "superadmin_all_questionnaires" ON questionnaires
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin')
  );

CREATE POLICY "service_role_all_questionnaires" ON questionnaires
  FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION update_questionnaires_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER questionnaires_updated_at
  BEFORE UPDATE ON questionnaires
  FOR EACH ROW EXECUTE FUNCTION update_questionnaires_updated_at();

-- ── questionnaire_questions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS questionnaire_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('open', 'scale', 'multiple_choice')),
  question_text TEXT NOT NULL,
  options JSONB,
  scale_min_label TEXT,
  scale_max_label TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_multi_select BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE questionnaire_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_questions" ON questionnaire_questions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "superadmin_all_questions" ON questionnaire_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin')
  );

CREATE POLICY "service_role_all_questions" ON questionnaire_questions
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_questionnaire_questions_questionnaire
  ON questionnaire_questions (questionnaire_id, sort_order);

-- ── questionnaire_sessions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS questionnaire_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE questionnaire_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sessions" ON questionnaire_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "superadmin_read_all_sessions" ON questionnaire_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin')
  );

CREATE POLICY "service_role_all_sessions" ON questionnaire_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_questionnaire_sessions_user
  ON questionnaire_sessions (user_id, questionnaire_id);

-- ── questionnaire_responses ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS questionnaire_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questionnaire_questions(id) ON DELETE SET NULL,
  question_text_snapshot TEXT NOT NULL,
  answer_text TEXT,
  answer_scale INTEGER CHECK (answer_scale >= 1 AND answer_scale <= 10),
  answer_choice TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_responses" ON questionnaire_responses
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM questionnaire_sessions s
      WHERE s.id = questionnaire_responses.session_id
      AND s.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM questionnaire_sessions s
      WHERE s.id = questionnaire_responses.session_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "superadmin_read_all_responses" ON questionnaire_responses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin')
  );

CREATE POLICY "service_role_all_responses" ON questionnaire_responses
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_questionnaire_responses_session
  ON questionnaire_responses (session_id);
