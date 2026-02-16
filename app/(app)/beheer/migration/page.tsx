'use client'

import { useState, useEffect } from 'react'
import { Database, CheckCircle, XCircle, AlertCircle, Loader2, Copy, Play } from 'lucide-react'

interface SchemaStatus {
  status: 'complete' | 'incomplete' | 'error'
  tables: Record<string, boolean>
  columns: Record<string, boolean>
  all_tables_exist: boolean
  all_columns_exist: boolean
}

interface MigrationResult {
  status: 'success' | 'error'
  error?: string
  connection?: Record<string, string>
  summary?: {
    total: number
    success: number
    skipped: number
    errors: number
  }
  results?: Array<{ statement: string; status: 'ok' | 'skip' | 'error'; message?: string }>
  tables?: string[]
}

export default function MigrationPage() {
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [dbPassword, setDbPassword] = useState('')
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    checkSchema()
  }, [])

  async function checkSchema() {
    setLoading(true)
    try {
      const res = await fetch('/api/apply-migration')
      const data = await res.json()
      setSchemaStatus(data)
    } catch (err) {
      console.error('Schema check failed:', err)
    }
    setLoading(false)
  }

  async function applyMigration() {
    if (!dbPassword.trim()) return
    setMigrating(true)
    setMigrationResult(null)
    try {
      const res = await fetch('/api/apply-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_password: dbPassword }),
      })
      const data = await res.json()
      setMigrationResult(data)
      if (data.status === 'success') {
        await checkSchema()
      }
    } catch (err) {
      setMigrationResult({ status: 'error', error: String(err) })
    }
    setMigrating(false)
  }

  const migrationSQL = `-- Run this in Supabase Dashboard > SQL Editor
-- File: supabase/migrations/20260215000001_create_new_tables.sql

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'trophy',
  color TEXT NOT NULL DEFAULT 'amber',
  category TEXT NOT NULL CHECK (category IN ('onboarding','consistency','financial_health','fire_milestones','actions','budget','exploration','sovereignty')),
  criteria_type TEXT NOT NULL CHECK (criteria_type IN ('threshold','count','streak','milestone','manual')),
  criteria_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are viewable by authenticated users" ON badges FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, badge_id)
);
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own badges" ON user_badges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own badges" ON user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own badges" ON user_badges FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS user_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streak_type TEXT NOT NULL CHECK (streak_type IN ('login','budget_compliance','action_completion')),
  current_count INT NOT NULL DEFAULT 0,
  longest_count INT NOT NULL DEFAULT 0,
  last_activity_date DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own streaks" ON user_streaks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own streaks" ON user_streaks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streaks" ON user_streaks FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS user_feature_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_slug TEXT NOT NULL,
  first_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_count INT NOT NULL DEFAULT 1,
  UNIQUE(user_id, feature_slug)
);
ALTER TABLE user_feature_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own feature visits" ON user_feature_visits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feature visits" ON user_feature_visits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own feature visits" ON user_feature_visits FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ticker TEXT, isin TEXT,
  name TEXT NOT NULL,
  units NUMERIC NOT NULL DEFAULT 0,
  avg_purchase_price NUMERIC NOT NULL DEFAULT 0,
  current_price NUMERIC,
  last_price_update TIMESTAMPTZ,
  purchase_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own holdings" ON holdings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holdings" ON holdings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holdings" ON holdings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holdings" ON holdings FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS holding_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('buy','sell','dividend')),
  units NUMERIC NOT NULL,
  price_per_unit NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own holding transactions" ON holding_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holding transactions" ON holding_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holding transactions" ON holding_transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holding transactions" ON holding_transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS next_step_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, step_key)
);
ALTER TABLE next_step_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own next step completions" ON next_step_completions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own next step completions" ON next_step_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own next step completions" ON next_step_completions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS freedom_percentage NUMERIC;
ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS fire_age NUMERIC;
ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS sovereignty_level INT;
ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS savings_rate NUMERIC;
ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS resilience_score INT;`

  async function copySQL() {
    await navigator.clipboard.writeText(migrationSQL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          <Database className="h-5 w-5 text-amber-600" />
          Database Migratie
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Status van de database schema en migratietools
        </p>
      </div>

      {/* Schema Status */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-zinc-900">Schema Status</h3>
          <button
            onClick={checkSchema}
            disabled={loading}
            className="text-sm text-amber-600 hover:text-amber-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vernieuwen'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Schema controleren...
          </div>
        ) : schemaStatus ? (
          <div className="space-y-4">
            <div className={`flex items-center gap-2 text-sm font-medium ${
              schemaStatus.status === 'complete' ? 'text-green-600' : 'text-amber-600'
            }`}>
              {schemaStatus.status === 'complete' ? (
                <><CheckCircle className="h-4 w-4" /> Schema is compleet</>
              ) : (
                <><AlertCircle className="h-4 w-4" /> Schema is incompleet</>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-700 mb-2">Tabellen</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(schemaStatus.tables).map(([name, exists]) => (
                  <div key={name} className="flex items-center gap-2 text-sm">
                    {exists ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <code className="text-zinc-600">{name}</code>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-700 mb-2">Kolommen op net_worth_snapshots</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(schemaStatus.columns).map(([name, exists]) => (
                  <div key={name} className="flex items-center gap-2 text-sm">
                    {exists ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <code className="text-zinc-600">{name}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-500">Schema check mislukt</p>
        )}
      </div>

      {/* Auto-apply Migration */}
      {schemaStatus && schemaStatus.status !== 'complete' && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h3 className="font-medium text-zinc-900 mb-2">Migratie Uitvoeren</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Voer je database wachtwoord in om de migratie automatisch uit te voeren.
            Vind je wachtwoord in Supabase Dashboard &gt; Settings &gt; Database.
          </p>

          <div className="flex gap-2">
            <input
              type="password"
              value={dbPassword}
              onChange={(e) => setDbPassword(e.target.value)}
              placeholder="Database wachtwoord"
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
            <button
              onClick={applyMigration}
              disabled={migrating || !dbPassword.trim()}
              className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {migrating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Bezig...</>
              ) : (
                <><Play className="h-4 w-4" /> Uitvoeren</>
              )}
            </button>
          </div>

          {migrationResult && (
            <div className={`mt-4 rounded-md p-4 text-sm ${
              migrationResult.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {migrationResult.status === 'success' ? (
                <div>
                  <p className="font-medium">Migratie geslaagd!</p>
                  <p>{migrationResult.summary?.success} uitgevoerd, {migrationResult.summary?.skipped} overgeslagen, {migrationResult.summary?.errors} fouten</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium">Migratie mislukt</p>
                  <p>{migrationResult.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual SQL */}
      {schemaStatus && schemaStatus.status !== 'complete' && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-zinc-900">Handmatig via SQL Editor</h3>
            <button
              onClick={copySQL}
              className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Gekopieerd!' : 'Kopieer SQL'}
            </button>
          </div>
          <p className="text-sm text-zinc-500 mb-4">
            Als alternatief kun je de SQL handmatig uitvoeren in de{' '}
            <a
              href="https://supabase.com/dashboard/project/pnnuqwdcgoympgddrvze/sql/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 underline hover:text-amber-700"
            >
              Supabase SQL Editor
            </a>
            .
          </p>
          <div className="max-h-64 overflow-auto rounded-md bg-zinc-900 p-4">
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap">{migrationSQL.substring(0, 2000)}...</pre>
          </div>
        </div>
      )}
    </div>
  )
}
