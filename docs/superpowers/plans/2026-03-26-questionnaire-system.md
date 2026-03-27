# Questionnaire System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app questionnaire system for the test phase — admin creates surveys, users fill them in one-question-per-page, admin reviews all responses.

**Architecture:** 4 Supabase tables (questionnaires, questions, sessions, responses) with RLS. Admin CRUD via `/beheer/vragenlijsten`. User flow via `/identity/testscenarios/vragenlijsten/[id]`. API routes for all data operations. No new dependencies.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), React 19, Tailwind CSS v4, Lucide icons, existing BottomSheet component.

**Spec:** `docs/superpowers/specs/2026-03-26-questionnaire-system-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260326000001_create_questionnaire_tables.sql` | 4 tables + RLS + indexes + triggers |
| `app/api/admin/questionnaires/route.ts` | GET (list all) + POST (create) — superadmin |
| `app/api/admin/questionnaires/[id]/route.ts` | GET (detail) + PUT (update) — superadmin |
| `app/api/admin/questionnaires/[id]/responses/route.ts` | GET all responses — superadmin |
| `app/api/questionnaires/route.ts` | GET active questionnaires — authenticated |
| `app/api/questionnaires/[id]/session/route.ts` | GET (find open) + POST (create new) — authenticated |
| `app/api/questionnaires/[id]/respond/route.ts` | POST upsert answer — authenticated |
| `app/(app)/identity/testscenarios/vragenlijsten/page.tsx` | User: questionnaire overview |
| `app/(app)/identity/testscenarios/vragenlijsten/[id]/page.tsx` | User: one-question-per-page flow |
| `app/(app)/beheer/vragenlijsten/page.tsx` | Admin: CRUD + response viewer |

### Modified files

| File | Change |
|------|--------|
| `components/app/beheer/beheer-nav.tsx` | Add "Vragenlijsten" tab |
| `app/(app)/identity/testscenarios/page.tsx` | Add feedback CTA section at bottom |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260326000001_create_questionnaire_tables.sql`

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard if using hosted)

Expected: All 4 tables created with RLS enabled, policies active, indexes created.

- [ ] **Step 3: Verify tables exist**

Run the following SQL in Supabase SQL editor or via MCP:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'questionnaire%';
```

Expected: 4 rows — `questionnaires`, `questionnaire_questions`, `questionnaire_sessions`, `questionnaire_responses`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260326000001_create_questionnaire_tables.sql
git commit -m "feat(questionnaires): add database tables, RLS policies, and indexes"
```

---

## Task 2: Admin API routes — CRUD

**Files:**
- Create: `app/api/admin/questionnaires/route.ts`
- Create: `app/api/admin/questionnaires/[id]/route.ts`

- [ ] **Step 1: Create the list + create endpoint**

Create `app/api/admin/questionnaires/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: questionnaires, error } = await supabase
    .from('questionnaires')
    .select(`
      *,
      questionnaire_questions(id),
      questionnaire_sessions(id, completed_at)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (questionnaires ?? []).map(q => ({
    id: q.id,
    title: q.title,
    description: q.description,
    is_active: q.is_active,
    created_at: q.created_at,
    updated_at: q.updated_at,
    question_count: q.questionnaire_questions?.length ?? 0,
    response_count: q.questionnaire_sessions?.length ?? 0,
    completed_count: q.questionnaire_sessions?.filter((s: { completed_at: string | null }) => s.completed_at).length ?? 0,
  }))

  return NextResponse.json({ questionnaires: result })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, questions } = body as {
    title: string
    description?: string
    questions: {
      type: 'open' | 'scale' | 'multiple_choice'
      question_text: string
      options?: string[]
      scale_min_label?: string
      scale_max_label?: string
      is_required?: boolean
    }[]
  }

  if (!title || !questions?.length) {
    return NextResponse.json({ error: 'Title and at least one question required' }, { status: 400 })
  }

  // Create questionnaire
  const { data: questionnaire, error: qError } = await supabase
    .from('questionnaires')
    .insert({ title, description: description ?? null })
    .select('id')
    .single()

  if (qError || !questionnaire) {
    return NextResponse.json({ error: qError?.message ?? 'Failed to create' }, { status: 500 })
  }

  // Create questions with sort_order
  const questionRows = questions.map((q, i) => ({
    questionnaire_id: questionnaire.id,
    sort_order: i + 1,
    type: q.type,
    question_text: q.question_text,
    options: q.type === 'multiple_choice' ? q.options ?? null : null,
    scale_min_label: q.type === 'scale' ? q.scale_min_label ?? null : null,
    scale_max_label: q.type === 'scale' ? q.scale_max_label ?? null : null,
    is_required: q.is_required ?? true,
  }))

  const { error: questionsError } = await supabase
    .from('questionnaire_questions')
    .insert(questionRows)

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 })
  }

  return NextResponse.json({ id: questionnaire.id }, { status: 201 })
}
```

- [ ] **Step 2: Create the detail + update endpoint**

Create `app/api/admin/questionnaires/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('questionnaires')
    .select(`
      *,
      questionnaire_questions(*)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'questionnaire_questions', ascending: true })
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  return NextResponse.json({ questionnaire: data })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, is_active, questions } = body as {
    title?: string
    description?: string
    is_active?: boolean
    questions?: {
      id?: string
      type: 'open' | 'scale' | 'multiple_choice'
      question_text: string
      options?: string[]
      scale_min_label?: string
      scale_max_label?: string
      is_required?: boolean
    }[]
  }

  // Update questionnaire metadata
  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description
  if (is_active !== undefined) updates.is_active = is_active

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('questionnaires')
      .update(updates)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replace questions if provided (delete old, insert new)
  if (questions) {
    // Get existing question IDs for reference
    const { data: existingQuestions } = await supabase
      .from('questionnaire_questions')
      .select('id')
      .eq('questionnaire_id', id)

    const existingIds = new Set((existingQuestions ?? []).map(q => q.id))
    const incomingIds = new Set(questions.filter(q => q.id).map(q => q.id))

    // Delete removed questions
    const toDelete = [...existingIds].filter(eid => !incomingIds.has(eid))
    if (toDelete.length > 0) {
      await supabase
        .from('questionnaire_questions')
        .delete()
        .in('id', toDelete)
    }

    // Upsert questions
    const rows = questions.map((q, i) => ({
      id: q.id ?? undefined,
      questionnaire_id: id,
      sort_order: i + 1,
      type: q.type,
      question_text: q.question_text,
      options: q.type === 'multiple_choice' ? q.options ?? null : null,
      scale_min_label: q.type === 'scale' ? q.scale_min_label ?? null : null,
      scale_max_label: q.type === 'scale' ? q.scale_max_label ?? null : null,
      is_required: q.is_required ?? true,
    }))

    const { error: upsertError } = await supabase
      .from('questionnaire_questions')
      .upsert(rows, { onConflict: 'id' })

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/questionnaires/route.ts app/api/admin/questionnaires/\[id\]/route.ts
git commit -m "feat(questionnaires): add admin CRUD API routes"
```

---

## Task 3: Admin API — responses endpoint

**Files:**
- Create: `app/api/admin/questionnaires/[id]/responses/route.ts`

- [ ] **Step 1: Create the responses endpoint**

Create `app/api/admin/questionnaires/[id]/responses/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = getServiceClient()

  // Fetch sessions with responses
  const { data: sessions, error: sError } = await service
    .from('questionnaire_sessions')
    .select(`
      id,
      user_id,
      started_at,
      completed_at,
      questionnaire_responses(
        id,
        question_id,
        question_text_snapshot,
        answer_text,
        answer_scale,
        answer_choice,
        created_at
      )
    `)
    .eq('questionnaire_id', id)
    .order('started_at', { ascending: false })

  if (sError) return NextResponse.json({ error: sError.message }, { status: 500 })

  // Fetch questions for the "per vraag" view
  const { data: questions } = await service
    .from('questionnaire_questions')
    .select('id, sort_order, type, question_text')
    .eq('questionnaire_id', id)
    .order('sort_order', { ascending: true })

  // Resolve user emails via auth.admin API
  const userIds = [...new Set((sessions ?? []).map(s => s.user_id))]
  const userMap: Record<string, string> = {}

  if (userIds.length > 0) {
    const { data: { users } } = await service.auth.admin.listUsers({ perPage: 200 })
    for (const u of users ?? []) {
      if (userIds.includes(u.id)) {
        userMap[u.id] = u.email ?? u.id.slice(0, 8)
      }
    }
  }

  const enrichedSessions = (sessions ?? []).map(s => ({
    ...s,
    user_email: userMap[s.user_id] ?? s.user_id.slice(0, 8),
  }))

  return NextResponse.json({
    sessions: enrichedSessions,
    questions: questions ?? [],
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/questionnaires/\[id\]/responses/route.ts
git commit -m "feat(questionnaires): add admin responses API with user email resolution"
```

---

## Task 4: User API routes — questionnaires, sessions, respond

**Files:**
- Create: `app/api/questionnaires/route.ts`
- Create: `app/api/questionnaires/[id]/session/route.ts`
- Create: `app/api/questionnaires/[id]/respond/route.ts`

- [ ] **Step 1: Create the user questionnaire list endpoint**

Create `app/api/questionnaires/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch active questionnaires with question count
  const { data: questionnaires, error } = await supabase
    .from('questionnaires')
    .select(`
      id, title, description,
      questionnaire_questions(id)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch user's sessions to compute progress
  const { data: sessions } = await supabase
    .from('questionnaire_sessions')
    .select(`
      id, questionnaire_id, completed_at,
      questionnaire_responses(question_id)
    `)
    .eq('user_id', user.id)

  const sessionMap: Record<string, {
    session_id: string
    completed: boolean
    answered_count: number
  }> = {}

  for (const s of sessions ?? []) {
    const existing = sessionMap[s.questionnaire_id]
    // If there's an open (incomplete) session, prefer that; otherwise show latest completed
    if (!existing || (!existing.completed && s.completed_at) || !s.completed_at) {
      if (!s.completed_at || !existing) {
        sessionMap[s.questionnaire_id] = {
          session_id: s.id,
          completed: !!s.completed_at,
          answered_count: s.questionnaire_responses?.length ?? 0,
        }
      }
    }
  }

  const result = (questionnaires ?? []).map(q => {
    const progress = sessionMap[q.id]
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      question_count: q.questionnaire_questions?.length ?? 0,
      answered_count: progress?.answered_count ?? 0,
      has_open_session: progress ? !progress.completed : false,
      has_completed: !!(sessions ?? []).find(s => s.questionnaire_id === q.id && s.completed_at),
    }
  })

  return NextResponse.json({ questionnaires: result })
}
```

- [ ] **Step 2: Create the session endpoint**

Create `app/api/questionnaires/[id]/session/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find open (incomplete) session
  const { data: session } = await supabase
    .from('questionnaire_sessions')
    .select(`
      id, started_at,
      questionnaire_responses(question_id)
    `)
    .eq('questionnaire_id', id)
    .eq('user_id', user.id)
    .is('completed_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ session: null })
  }

  return NextResponse.json({
    session: {
      id: session.id,
      started_at: session.started_at,
      answered_question_ids: (session.questionnaire_responses ?? []).map(
        (r: { question_id: string }) => r.question_id
      ),
    },
  })
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session, error } = await supabase
    .from('questionnaire_sessions')
    .insert({ questionnaire_id: id, user_id: user.id })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ session: { id: session.id, answered_question_ids: [] } }, { status: 201 })
}
```

- [ ] **Step 3: Create the respond (upsert answer) endpoint**

Create `app/api/questionnaires/[id]/respond/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { session_id, question_id, question_text, answer_text, answer_scale, answer_choice } = body as {
    session_id: string
    question_id: string
    question_text: string
    answer_text?: string
    answer_scale?: number
    answer_choice?: string
  }

  if (!session_id || !question_id || !question_text) {
    return NextResponse.json({ error: 'session_id, question_id, and question_text required' }, { status: 400 })
  }

  // Verify session belongs to user
  const { data: session } = await supabase
    .from('questionnaire_sessions')
    .select('id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .eq('questionnaire_id', id)
    .is('completed_at', null)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Invalid or completed session' }, { status: 403 })
  }

  // Upsert the response
  const { error } = await supabase
    .from('questionnaire_responses')
    .upsert(
      {
        session_id,
        question_id,
        question_text_snapshot: question_text,
        answer_text: answer_text ?? null,
        answer_scale: answer_scale ?? null,
        answer_choice: answer_choice ?? null,
      },
      { onConflict: 'session_id,question_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// PATCH — mark session as completed
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { session_id } = body as { session_id: string }

  const { error } = await supabase
    .from('questionnaire_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', session_id)
    .eq('user_id', user.id)
    .eq('questionnaire_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/questionnaires/
git commit -m "feat(questionnaires): add user API routes — list, session, respond"
```

---

## Task 5: Testscenario's page — feedback CTA

**Files:**
- Modify: `app/(app)/identity/testscenarios/page.tsx`

- [ ] **Step 1: Add the feedback section at the bottom of the page**

Add after the last `GROUPS.map(...)` block (after line 319 in the current file), before the closing `</div>`:

```tsx
      {/* ── Feedback CTA ── */}
      <SectionDivider variant="asterisk" />
      <section className="mb-8 text-center">
        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
          Hoe bevalt TriFinity?
        </h2>
        <p className="mt-2 font-serif text-sm text-[var(--ink-3)]">
          Deel je ervaring en help ons de app te verbeteren.
        </p>
        <Link
          href="/identity/testscenarios/vragenlijsten"
          className="mt-4 inline-flex items-center gap-2 border border-[var(--border-md)] bg-[var(--paper)] px-6 py-3 text-sm font-semibold text-[var(--ink)] transition-all hover:-translate-y-px hover:shadow-[var(--s1)]"
        >
          Naar vragenlijsten
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
```

Note: `Link`, `ArrowRight`, and `SectionDivider` are already imported in this file.

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev` and navigate to `/identity/testscenarios`

Expected: Feedback CTA section visible at the bottom with "Naar vragenlijsten" button.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/identity/testscenarios/page.tsx
git commit -m "feat(questionnaires): add feedback CTA to testscenarios page"
```

---

## Task 6: User questionnaire overview page

**Files:**
- Create: `app/(app)/identity/testscenarios/vragenlijsten/page.tsx`

- [ ] **Step 1: Create the questionnaire overview page**

Create `app/(app)/identity/testscenarios/vragenlijsten/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react'
import { SectionDivider } from '@/components/app/section-divider'

interface QuestionnaireItem {
  id: string
  title: string
  description: string | null
  question_count: number
  answered_count: number
  has_open_session: boolean
  has_completed: boolean
}

export default function VragenlijstenPage() {
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/questionnaires')
      .then(r => r.json())
      .then(d => setQuestionnaires(d.questionnaires ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-10 border-b border-[var(--border-ed)] pb-6">
        <p className="label-editorial text-[var(--ink-3)]">Feedback</p>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-[var(--ink)] sm:text-4xl">
          Vragenlijsten
        </h1>
        <p className="mt-3 max-w-xl font-serif text-base leading-relaxed text-[var(--ink-3)]">
          Deel je ervaringen met TriFinity. Elke vragenlijst duurt een paar minuten en
          helpt ons de app te verbeteren.
        </p>
      </header>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="h-28 animate-pulse rounded border border-[var(--border-ed)] bg-[var(--subtle)]" />
          ))}
        </div>
      ) : questionnaires.length === 0 ? (
        <p className="font-serif text-sm text-[var(--ink-3)]">
          Er zijn momenteel geen vragenlijsten beschikbaar.
        </p>
      ) : (
        <div className="space-y-4">
          {questionnaires.map(q => (
            <QuestionnaireCard key={q.id} questionnaire={q} />
          ))}
        </div>
      )}

      <SectionDivider variant="asterisk" />

      <div className="text-center">
        <Link
          href="/identity/testscenarios"
          className="text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          &larr; Terug naar testscenario&rsquo;s
        </Link>
      </div>
    </div>
  )
}

function QuestionnaireCard({ questionnaire: q }: { questionnaire: QuestionnaireItem }) {
  const pct = q.question_count > 0 ? Math.round((q.answered_count / q.question_count) * 100) : 0
  const isComplete = q.has_completed && !q.has_open_session
  const isInProgress = q.has_open_session

  return (
    <Link
      href={`/identity/testscenarios/vragenlijsten/${q.id}`}
      className="group block border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-4 transition-all duration-150 hover:-translate-y-px hover:border-[var(--border-md)] hover:shadow-[var(--s1)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{q.title}</h3>
          {q.description && (
            <p className="mt-1 font-serif text-sm text-[var(--ink-3)]">{q.description}</p>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs text-[var(--ink-4)]">
            <span className="font-mono tabular-nums">{q.question_count} vragen</span>
            {isInProgress && (
              <span className="flex items-center gap-1 text-amber-600">
                <Clock className="h-3 w-3" />
                Bezig &mdash; {q.answered_count}/{q.question_count}
              </span>
            )}
            {isComplete && !isInProgress && (
              <span className="flex items-center gap-1 text-kern-600">
                <CheckCircle2 className="h-3 w-3" />
                Afgerond
              </span>
            )}
          </div>
          {isInProgress && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-kern-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--ink-3)]" />
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(app\)/identity/testscenarios/vragenlijsten/page.tsx
git commit -m "feat(questionnaires): add user questionnaire overview page"
```

---

## Task 7: User questionnaire flow — one question per page

**Files:**
- Create: `app/(app)/identity/testscenarios/vragenlijsten/[id]/page.tsx`

- [ ] **Step 1: Create the questionnaire flow page**

Create `app/(app)/identity/testscenarios/vragenlijsten/[id]/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'

interface Question {
  id: string
  sort_order: number
  type: 'open' | 'scale' | 'multiple_choice'
  question_text: string
  options: string[] | null
  scale_min_label: string | null
  scale_max_label: string | null
  is_required: boolean
}

interface SessionData {
  id: string
  answered_question_ids: string[]
}

export default function QuestionnaireFillPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [questions, setQuestions] = useState<Question[]>([])
  const [session, setSession] = useState<SessionData | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { text?: string; scale?: number; choice?: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)

  // Load questionnaire + session
  useEffect(() => {
    async function init() {
      // Fetch questions
      const qRes = await fetch(`/api/questionnaires`)
      const qData = await qRes.json()
      // We need the full question list — fetch via admin-detail won't work for users
      // Instead, fetch questions directly
      const detailRes = await fetch(`/api/questionnaires/${id}/session`)
      const detailData = await detailRes.json()

      // Fetch questions from the questionnaire
      // We'll use supabase client-side for the question list
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: qs } = await supabase
        .from('questionnaire_questions')
        .select('*')
        .eq('questionnaire_id', id)
        .order('sort_order', { ascending: true })

      setQuestions(qs ?? [])

      // Get or create session
      let sessionData = detailData.session
      if (!sessionData) {
        const createRes = await fetch(`/api/questionnaires/${id}/session`, { method: 'POST' })
        const createData = await createRes.json()
        sessionData = createData.session
      }
      setSession(sessionData)

      // Load existing answers
      if (sessionData?.answered_question_ids?.length && qs?.length) {
        const { data: existingResponses } = await supabase
          .from('questionnaire_responses')
          .select('question_id, answer_text, answer_scale, answer_choice')
          .eq('session_id', sessionData.id)

        const answerMap: Record<string, { text?: string; scale?: number; choice?: string }> = {}
        for (const r of existingResponses ?? []) {
          answerMap[r.question_id] = {
            text: r.answer_text ?? undefined,
            scale: r.answer_scale ?? undefined,
            choice: r.answer_choice ?? undefined,
          }
        }
        setAnswers(answerMap)

        // Jump to first unanswered question
        const answeredIds = new Set(sessionData.answered_question_ids)
        const firstUnanswered = qs.findIndex((q: Question) => !answeredIds.has(q.id))
        if (firstUnanswered > 0) setCurrentIndex(firstUnanswered)
      }

      setLoading(false)
    }
    init()
  }, [id])

  const currentQuestion = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined

  const saveAnswer = useCallback(async () => {
    if (!session || !currentQuestion) return
    const answer = answers[currentQuestion.id]
    if (!answer) return

    setSaving(true)
    await fetch(`/api/questionnaires/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        question_id: currentQuestion.id,
        question_text: currentQuestion.question_text,
        answer_text: answer.text,
        answer_scale: answer.scale,
        answer_choice: answer.choice,
      }),
    })
    setSaving(false)
  }, [session, currentQuestion, answers, id])

  const handleNext = useCallback(async () => {
    await saveAnswer()
    if (isLast) {
      // Complete session
      await fetch(`/api/questionnaires/${id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session?.id }),
      })
      setCompleted(true)
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [saveAnswer, isLast, id, session])

  const handlePrev = useCallback(async () => {
    if (currentAnswer) await saveAnswer()
    setCurrentIndex(i => Math.max(0, i - 1))
  }, [saveAnswer, currentAnswer])

  const setAnswer = useCallback((questionId: string, value: { text?: string; scale?: number; choice?: string }) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <div className="h-6 w-48 mx-auto animate-pulse rounded bg-[var(--subtle)]" />
      </div>
    )
  }

  if (completed) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-kern-500" />
        <h1 className="mt-4 font-display text-2xl font-bold text-[var(--ink)]">
          Bedankt!
        </h1>
        <p className="mt-2 font-serif text-sm text-[var(--ink-3)]">
          Je antwoorden zijn opgeslagen. Je kunt de vragenlijst later opnieuw invullen.
        </p>
        <Link
          href="/identity/testscenarios"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar testscenario&rsquo;s
        </Link>
      </div>
    )
  }

  if (!currentQuestion) return null

  const pct = Math.round(((currentIndex + 1) / questions.length) * 100)
  const hasAnswer = currentAnswer && (currentAnswer.text || currentAnswer.scale || currentAnswer.choice)

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
          <span>Vraag <span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">{currentIndex + 1}</span> van <span className="font-mono tabular-nums">{questions.length}</span></span>
          <span className="font-mono tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className="h-full rounded-full bg-kern-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <h2 className="font-display text-xl font-semibold leading-snug text-[var(--ink)] sm:text-2xl">
        {currentQuestion.question_text}
      </h2>

      {/* Answer input */}
      <div className="mt-6">
        {currentQuestion.type === 'open' && (
          <textarea
            value={currentAnswer?.text ?? ''}
            onChange={e => setAnswer(currentQuestion.id, { text: e.target.value })}
            placeholder="Typ je antwoord..."
            rows={4}
            className="w-full resize-none rounded border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 font-serif text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none focus:ring-2 focus:ring-kern-500/20"
          />
        )}

        {currentQuestion.type === 'scale' && (
          <div>
            <div className="flex justify-between gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAnswer(currentQuestion.id, { scale: n })}
                  className={`flex h-11 w-11 items-center justify-center rounded border font-mono text-sm font-bold tabular-nums transition-colors ${
                    currentAnswer?.scale === n
                      ? 'border-kern-500 bg-kern-500 text-white'
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>{currentQuestion.scale_min_label ?? '1'}</span>
              <span>{currentQuestion.scale_max_label ?? '10'}</span>
            </div>
          </div>
        )}

        {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
          <div className="space-y-2">
            {(currentQuestion.options as string[]).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setAnswer(currentQuestion.id, { choice: option })}
                className={`flex w-full items-center gap-3 rounded border px-4 py-3 text-left text-sm transition-colors ${
                  currentAnswer?.choice === option
                    ? 'border-kern-500 bg-kern-500/5 font-medium text-[var(--ink)]'
                    : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-[var(--border-md)]'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  currentAnswer?.choice === option
                    ? 'border-kern-500 bg-kern-500'
                    : 'border-[var(--border-md)]'
                }`}>
                  {currentAnswer?.choice === option && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </span>
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between border-t border-[var(--border-ed)] pt-6">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] disabled:opacity-30 disabled:hover:text-[var(--ink-3)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Vorige
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={saving || (currentQuestion.is_required && !hasAnswer)}
          className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-30 ${
            isLast
              ? 'bg-kern-500 text-white hover:bg-kern-600'
              : 'border border-[var(--border-md)] bg-[var(--paper)] text-[var(--ink)] hover:-translate-y-px hover:shadow-[var(--s1)]'
          }`}
        >
          {saving ? 'Opslaan...' : isLast ? 'Afronden' : 'Volgende'}
          {!isLast && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(app\)/identity/testscenarios/vragenlijsten/\[id\]/page.tsx
git commit -m "feat(questionnaires): add one-question-per-page flow for users"
```

---

## Task 8: Beheer nav — add tab

**Files:**
- Modify: `components/app/beheer/beheer-nav.tsx:6-26`

- [ ] **Step 1: Add the Vragenlijsten tab to beheer-nav**

In `components/app/beheer/beheer-nav.tsx`, add a new entry to the `tabs` array after the Regressietest entry (line 25):

```typescript
  { label: 'Vragenlijsten', href: '/beheer/vragenlijsten', activeClass: 'border-wil-500 text-wil-700' },
```

This goes after the line `{ label: 'Regressietest', href: '/beheer/regressietest', activeClass: 'border-emerald-500 text-emerald-700' },` and before the `] as const`.

- [ ] **Step 2: Commit**

```bash
git add components/app/beheer/beheer-nav.tsx
git commit -m "feat(questionnaires): add Vragenlijsten tab to beheer navigation"
```

---

## Task 9: Admin beheer page — questionnaire management

**Files:**
- Create: `app/(app)/beheer/vragenlijsten/page.tsx`

- [ ] **Step 1: Create the admin questionnaire management page**

Create `app/(app)/beheer/vragenlijsten/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, BarChart3, ChevronUp, ChevronDown, Trash2,
  AlertTriangle, ToggleLeft, ToggleRight, X,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'

// ── Types ───────────────────────────────────────────────────────────────────

type QuestionType = 'open' | 'scale' | 'multiple_choice'

interface QuestionDraft {
  id?: string
  type: QuestionType
  question_text: string
  options?: string[]
  scale_min_label?: string
  scale_max_label?: string
  is_required: boolean
}

interface QuestionnaireSummary {
  id: string
  title: string
  description: string | null
  is_active: boolean
  created_at: string
  question_count: number
  response_count: number
  completed_count: number
}

interface QuestionnaireDetail {
  id: string
  title: string
  description: string | null
  is_active: boolean
  questionnaire_questions: {
    id: string
    sort_order: number
    type: QuestionType
    question_text: string
    options: string[] | null
    scale_min_label: string | null
    scale_max_label: string | null
    is_required: boolean
  }[]
}

interface SessionResponse {
  id: string
  user_email: string
  user_id: string
  started_at: string
  completed_at: string | null
  questionnaire_responses: {
    id: string
    question_id: string
    question_text_snapshot: string
    answer_text: string | null
    answer_scale: number | null
    answer_choice: string | null
    created_at: string
  }[]
}

interface QuestionSummary {
  id: string
  sort_order: number
  type: QuestionType
  question_text: string
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function BeheerVragenlijsten() {
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [viewingResponsesId, setViewingResponsesId] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    const res = await fetch('/api/admin/questionnaires')
    const data = await res.json()
    setQuestionnaires(data.questionnaires ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const toggleActive = async (id: string, currentlyActive: boolean) => {
    await fetch(`/api/admin/questionnaires/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentlyActive }),
    })
    loadList()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Vragenlijsten</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Nieuwe vragenlijst
        </button>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-16 animate-pulse rounded border border-[var(--border-ed)] bg-[var(--subtle)]" />
          ))}
        </div>
      ) : questionnaires.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--ink-3)]">Nog geen vragenlijsten aangemaakt.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {questionnaires.map(q => (
            <div key={q.id} className="flex items-center gap-3 rounded border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{q.title}</p>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    q.is_active ? 'bg-kern-500/10 text-kern-700' : 'bg-[var(--subtle)] text-[var(--ink-4)]'
                  }`}>
                    {q.is_active ? 'Actief' : 'Inactief'}
                  </span>
                </div>
                <p className="mt-0.5 flex gap-3 text-xs text-[var(--ink-4)]">
                  <span className="font-mono tabular-nums">{q.question_count} vragen</span>
                  <span className="font-mono tabular-nums">{q.response_count} invullingen</span>
                  <span className="font-mono tabular-nums">{q.completed_count} voltooid</span>
                </p>
              </div>
              <button type="button" onClick={() => toggleActive(q.id, q.is_active)} title={q.is_active ? 'Deactiveren' : 'Activeren'}>
                {q.is_active
                  ? <ToggleRight className="h-5 w-5 text-kern-500" />
                  : <ToggleLeft className="h-5 w-5 text-[var(--ink-4)]" />
                }
              </button>
              <button type="button" onClick={() => setEditingId(q.id)} className="text-[var(--ink-3)] hover:text-[var(--ink-2)]">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setViewingResponsesId(q.id)} className="text-[var(--ink-3)] hover:text-[var(--ink-2)]">
                <BarChart3 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Editor sheet */}
      {(creating || editingId) && (
        <EditorSheet
          questionnaireId={editingId}
          onClose={() => { setEditingId(null); setCreating(false) }}
          onSaved={() => { setEditingId(null); setCreating(false); loadList() }}
        />
      )}

      {/* Responses sheet */}
      {viewingResponsesId && (
        <ResponsesSheet
          questionnaireId={viewingResponsesId}
          onClose={() => setViewingResponsesId(null)}
        />
      )}
    </div>
  )
}

// ── Editor Sheet ────────────────────────────────────────────────────────────

function EditorSheet({ questionnaireId, onClose, onSaved }: {
  questionnaireId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!questionnaireId)

  useEffect(() => {
    if (!questionnaireId) return
    fetch(`/api/admin/questionnaires/${questionnaireId}`)
      .then(r => r.json())
      .then(d => {
        const q = d.questionnaire as QuestionnaireDetail
        setTitle(q.title)
        setDescription(q.description ?? '')
        setQuestions(
          q.questionnaire_questions.map(qq => ({
            id: qq.id,
            type: qq.type,
            question_text: qq.question_text,
            options: qq.options ?? undefined,
            scale_min_label: qq.scale_min_label ?? undefined,
            scale_max_label: qq.scale_max_label ?? undefined,
            is_required: qq.is_required,
          }))
        )
        setLoading(false)
      })
  }, [questionnaireId])

  const addQuestion = (type: QuestionType) => {
    setQuestions(prev => [
      ...prev,
      {
        type,
        question_text: '',
        is_required: true,
        ...(type === 'multiple_choice' ? { options: [''] } : {}),
        ...(type === 'scale' ? { scale_min_label: 'Zeer slecht', scale_max_label: 'Uitstekend' } : {}),
      },
    ])
  }

  const updateQuestion = (index: number, updates: Partial<QuestionDraft>) => {
    setQuestions(prev => prev.map((q, i) => (i === index ? { ...q, ...updates } : q)))
  }

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= questions.length) return
    setQuestions(prev => {
      const next = [...prev]
      ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
      return next
    })
  }

  const handleSave = async () => {
    if (!title.trim() || questions.length === 0) return
    setSaving(true)

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      questions: questions.map(q => ({
        id: q.id,
        type: q.type,
        question_text: q.question_text,
        options: q.options,
        scale_min_label: q.scale_min_label,
        scale_max_label: q.scale_max_label,
        is_required: q.is_required,
      })),
    }

    if (questionnaireId) {
      await fetch(`/api/admin/questionnaires/${questionnaireId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch('/api/admin/questionnaires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    setSaving(false)
    onSaved()
  }

  const TYPE_LABELS: Record<QuestionType, string> = {
    open: 'Open',
    scale: 'Schaal 1-10',
    multiple_choice: 'Meerkeuze',
  }

  return (
    <BottomSheet open onClose={onClose} title={questionnaireId ? 'Vragenlijst bewerken' : 'Nieuwe vragenlijst'} size="full">
      {loading ? (
        <div className="p-6"><div className="h-40 animate-pulse rounded bg-[var(--subtle)]" /></div>
      ) : (
        <div className="space-y-6 p-6">
          {/* Title + description */}
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titel van de vragenlijst"
              className="w-full border-b border-[var(--border-ed)] bg-transparent pb-2 font-display text-lg font-semibold text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
            />
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optionele beschrijving..."
              rows={2}
              className="w-full resize-none border-b border-[var(--border-ed)] bg-transparent pb-2 font-serif text-sm text-[var(--ink-2)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
            />
          </div>

          {/* Warning */}
          {questions.length > 10 && (
            <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Vragenlijsten met meer dan 10 vragen hebben significant lagere voltooiingspercentages.
            </div>
          )}

          {/* Questions */}
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="rounded border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-1 rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--ink-4)]">
                    {TYPE_LABELS[q.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <textarea
                      value={q.question_text}
                      onChange={e => updateQuestion(i, { question_text: e.target.value })}
                      placeholder="Typ je vraag..."
                      rows={2}
                      className="w-full resize-none bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none"
                    />

                    {q.type === 'scale' && (
                      <div className="mt-2 flex gap-3">
                        <input
                          type="text"
                          value={q.scale_min_label ?? ''}
                          onChange={e => updateQuestion(i, { scale_min_label: e.target.value })}
                          placeholder="Label 1 (bijv. Zeer slecht)"
                          className="flex-1 border-b border-[var(--border-ed)] bg-transparent pb-1 text-xs text-[var(--ink-3)] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={q.scale_max_label ?? ''}
                          onChange={e => updateQuestion(i, { scale_max_label: e.target.value })}
                          placeholder="Label 10 (bijv. Uitstekend)"
                          className="flex-1 border-b border-[var(--border-ed)] bg-transparent pb-1 text-xs text-[var(--ink-3)] focus:outline-none"
                        />
                      </div>
                    )}

                    {q.type === 'multiple_choice' && (
                      <div className="mt-2 space-y-1.5">
                        {(q.options ?? []).map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border border-[var(--border-md)]" />
                            <input
                              type="text"
                              value={opt}
                              onChange={e => {
                                const newOpts = [...(q.options ?? [])]
                                newOpts[oi] = e.target.value
                                updateQuestion(i, { options: newOpts })
                              }}
                              placeholder={`Optie ${oi + 1}`}
                              className="flex-1 border-b border-[var(--border-ed)] bg-transparent pb-1 text-xs text-[var(--ink-2)] focus:outline-none"
                            />
                            <button type="button" onClick={() => {
                              updateQuestion(i, { options: (q.options ?? []).filter((_, j) => j !== oi) })
                            }} className="text-[var(--ink-4)] hover:text-red-500">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => updateQuestion(i, { options: [...(q.options ?? []), ''] })}
                          className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                        >
                          + Optie toevoegen
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Reorder + delete */}
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="text-[var(--ink-4)] hover:text-[var(--ink-2)] disabled:opacity-20">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} className="text-[var(--ink-4)] hover:text-[var(--ink-2)] disabled:opacity-20">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeQuestion(i)} className="mt-1 text-[var(--ink-4)] hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add question buttons */}
          <div className="flex gap-2">
            <button type="button" onClick={() => addQuestion('open')} className="rounded border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]">
              + Open vraag
            </button>
            <button type="button" onClick={() => addQuestion('scale')} className="rounded border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]">
              + Schaal 1-10
            </button>
            <button type="button" onClick={() => addQuestion('multiple_choice')} className="rounded border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]">
              + Meerkeuze
            </button>
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim() || questions.length === 0}
            className="w-full rounded bg-kern-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-kern-600 disabled:opacity-40"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

// ── Responses Sheet ─────────────────────────────────────────────────────────

function ResponsesSheet({ questionnaireId, onClose }: {
  questionnaireId: string
  onClose: () => void
}) {
  const [sessions, setSessions] = useState<SessionResponse[]>([])
  const [questions, setQuestions] = useState<QuestionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'sessions' | 'questions'>('sessions')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/questionnaires/${questionnaireId}/responses`)
      .then(r => r.json())
      .then(d => {
        setSessions(d.sessions ?? [])
        setQuestions(d.questions ?? [])
        setLoading(false)
      })
  }, [questionnaireId])

  const totalSessions = sessions.length
  const completedSessions = sessions.filter(s => s.completed_at).length
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0

  const selectedSession = selectedSessionId ? sessions.find(s => s.id === selectedSessionId) : null

  // Aggregate answers per question
  const questionAggregates = (qId: string) => {
    const allResponses = sessions.flatMap(s =>
      s.questionnaire_responses.filter(r => r.question_id === qId)
    )
    return allResponses
  }

  return (
    <BottomSheet open onClose={onClose} title="Resultaten" size="full">
      {loading ? (
        <div className="p-6"><div className="h-40 animate-pulse rounded bg-[var(--subtle)]" /></div>
      ) : (
        <div className="p-6">
          {/* Summary bar */}
          <div className="mb-6 flex gap-6 text-xs text-[var(--ink-3)]">
            <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">{totalSessions}</span> invullingen</span>
            <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">{completedSessions}</span> voltooid</span>
            <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">{completionRate}%</span> voltooiingspercentage</span>
          </div>

          {/* View toggle */}
          <div className="mb-4 flex gap-0.5 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-0.5 w-fit">
            <button
              type="button"
              onClick={() => { setView('sessions'); setSelectedQuestionId(null) }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'sessions' ? 'bg-zinc-900 text-white' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              Per invulling
            </button>
            <button
              type="button"
              onClick={() => { setView('questions'); setSelectedSessionId(null) }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'questions' ? 'bg-zinc-900 text-white' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              Per vraag
            </button>
          </div>

          {/* Per invulling view */}
          {view === 'sessions' && !selectedSession && (
            <div className="space-y-2">
              {sessions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className="flex w-full items-center justify-between rounded border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">{s.user_email}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-4)]">
                      {new Date(s.started_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    s.completed_at ? 'bg-kern-500/10 text-kern-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {s.completed_at ? 'Voltooid' : 'Onvolledig'}
                  </span>
                </button>
              ))}
              {sessions.length === 0 && (
                <p className="text-sm text-[var(--ink-3)]">Nog geen invullingen.</p>
              )}
            </div>
          )}

          {/* Session detail */}
          {view === 'sessions' && selectedSession && (
            <div>
              <button type="button" onClick={() => setSelectedSessionId(null)} className="mb-4 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]">
                &larr; Terug naar overzicht
              </button>
              <p className="text-sm font-medium text-[var(--ink)]">{selectedSession.user_email}</p>
              <p className="mb-4 text-xs text-[var(--ink-4)]">
                {new Date(selectedSession.started_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="space-y-3">
                {selectedSession.questionnaire_responses
                  .sort((a, b) => {
                    const qA = questions.findIndex(q => q.id === a.question_id)
                    const qB = questions.findIndex(q => q.id === b.question_id)
                    return qA - qB
                  })
                  .map(r => (
                  <div key={r.id} className="rounded border border-[var(--border-ed)] px-4 py-3">
                    <p className="text-xs font-medium text-[var(--ink-3)]">{r.question_text_snapshot}</p>
                    <p className="mt-1 text-sm text-[var(--ink)]">
                      {r.answer_text ?? (r.answer_scale != null ? `${r.answer_scale}/10` : r.answer_choice) ?? '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per vraag view */}
          {view === 'questions' && !selectedQuestionId && (
            <div className="space-y-2">
              {questions.map(q => {
                const responses = questionAggregates(q.id)
                const scaleAvg = q.type === 'scale' && responses.length > 0
                  ? (responses.reduce((sum, r) => sum + (r.answer_scale ?? 0), 0) / responses.length).toFixed(1)
                  : null
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedQuestionId(q.id)}
                    className="flex w-full items-center justify-between rounded border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--ink)]">{q.question_text}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-4)]">
                        {responses.length} antwoorden
                        {scaleAvg && <span className="ml-2">Gem. <span className="font-mono tabular-nums font-semibold">{scaleAvg}</span>/10</span>}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Question detail */}
          {view === 'questions' && selectedQuestionId && (() => {
            const q = questions.find(q => q.id === selectedQuestionId)
            const responses = questionAggregates(selectedQuestionId)
            if (!q) return null

            return (
              <div>
                <button type="button" onClick={() => setSelectedQuestionId(null)} className="mb-4 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]">
                  &larr; Terug naar overzicht
                </button>
                <p className="mb-4 text-sm font-medium text-[var(--ink)]">{q.question_text}</p>

                {/* Scale distribution */}
                {q.type === 'scale' && responses.length > 0 && (
                  <div className="mb-4 flex items-end gap-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                      const count = responses.filter(r => r.answer_scale === n).length
                      const maxCount = Math.max(...Array.from({ length: 10 }, (_, i) => responses.filter(r => r.answer_scale === i + 1).length), 1)
                      return (
                        <div key={n} className="flex flex-1 flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t bg-kern-500/60"
                            style={{ height: `${Math.max((count / maxCount) * 60, 2)}px` }}
                          />
                          <span className="text-[10px] font-mono tabular-nums text-[var(--ink-4)]">{n}</span>
                          <span className="text-[10px] font-mono tabular-nums text-[var(--ink-3)]">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Multiple choice distribution */}
                {q.type === 'multiple_choice' && responses.length > 0 && (() => {
                  const counts: Record<string, number> = {}
                  for (const r of responses) {
                    if (r.answer_choice) counts[r.answer_choice] = (counts[r.answer_choice] ?? 0) + 1
                  }
                  const maxCount = Math.max(...Object.values(counts), 1)
                  return (
                    <div className="mb-4 space-y-1.5">
                      {Object.entries(counts).map(([choice, count]) => (
                        <div key={choice} className="flex items-center gap-3">
                          <span className="w-24 truncate text-xs text-[var(--ink-2)]">{choice}</span>
                          <div className="flex-1 h-4 rounded bg-[var(--subtle)]">
                            <div className="h-full rounded bg-kern-500/60" style={{ width: `${(count / maxCount) * 100}%` }} />
                          </div>
                          <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">{count}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* All answers list */}
                <div className="space-y-2">
                  {responses.map((r, i) => {
                    const session = sessions.find(s => s.questionnaire_responses.some(sr => sr.id === r.id))
                    return (
                      <div key={r.id} className="rounded border border-[var(--border-ed)] px-4 py-3">
                        <p className="text-xs text-[var(--ink-4)]">
                          {session?.user_email ?? '?'} &mdash; {new Date(r.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        </p>
                        <p className="mt-1 text-sm text-[var(--ink)]">
                          {r.answer_text ?? (r.answer_scale != null ? `${r.answer_scale}/10` : r.answer_choice) ?? '—'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(app\)/beheer/vragenlijsten/page.tsx
git commit -m "feat(questionnaires): add admin beheer page with editor and response viewer"
```

---

## Task 10: Final integration verification

- [ ] **Step 1: Verify all routes render**

Run `npm run dev` and check:
1. `/identity/testscenarios` — feedback CTA visible at bottom
2. `/identity/testscenarios/vragenlijsten` — overview page loads
3. `/beheer/vragenlijsten` — admin page loads with "Vragenlijsten" tab active

- [ ] **Step 2: Test admin flow**

1. Go to `/beheer/vragenlijsten`
2. Click "Nieuwe vragenlijst"
3. Add title: "Eerste indruk"
4. Add one open question, one scale question, one multiple choice question
5. Save
6. Verify it appears in the list as "Actief"

- [ ] **Step 3: Test user flow**

1. Go to `/identity/testscenarios/vragenlijsten`
2. Click the questionnaire created in step 2
3. Answer each question, verify progress bar updates
4. Click "Afronden"
5. Verify thank-you page appears
6. Go back to overview — verify "Afgerond" badge

- [ ] **Step 4: Test admin responses view**

1. Go to `/beheer/vragenlijsten`
2. Click the chart icon on the questionnaire
3. Toggle "Per invulling" — verify session with user email and answers
4. Toggle "Per vraag" — verify aggregation (scale average, choice distribution)

- [ ] **Step 5: Test resume flow**

1. Start a new questionnaire fill (click the questionnaire again from overview)
2. Answer 2 of 3 questions, then close the browser tab
3. Re-open the questionnaire — verify it resumes at question 3

- [ ] **Step 6: Commit all verified work**

```bash
git add -A
git commit -m "feat(questionnaires): complete questionnaire system for test phase feedback"
```
