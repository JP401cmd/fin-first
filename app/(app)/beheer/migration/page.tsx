'use client'

import { useState, useEffect } from 'react'
import { Database, CheckCircle, XCircle, AlertCircle, Loader2, Copy, Play } from 'lucide-react'

interface SchemaStatus {
  status: 'complete' | 'incomplete' | 'error'
  tables: Record<string, boolean>
  holdings_columns: Record<string, boolean>
  snapshot_columns: Record<string, boolean>
  profile_columns: Record<string, boolean>
  rpc: Record<string, boolean>
  all_tables_exist: boolean
  all_holdings_columns_exist: boolean
  all_snapshot_columns_exist: boolean
  all_profile_columns_exist: boolean
  rpc_exists: boolean
}

interface MigrationResult {
  status: 'success' | 'error'
  error?: string
  summary?: {
    total: number
    success: number
    skipped: number
    errors: number
  }
  results?: Array<{ statement: string; status: 'ok' | 'skip' | 'error'; message?: string }>
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

  async function copySQL() {
    const res = await fetch('/api/apply-migration')
    const status = await res.json()
    const missing: string[] = []

    // Build summary of what's missing
    if (status.tables) {
      for (const [t, exists] of Object.entries(status.tables)) {
        if (!exists) missing.push(`-- Missing table: ${t}`)
      }
    }
    if (status.holdings_columns) {
      for (const [c, exists] of Object.entries(status.holdings_columns)) {
        if (!exists) missing.push(`-- Missing holdings column: ${c}`)
      }
    }

    const hint = missing.length > 0
      ? `-- ${missing.length} schema items missing.\n-- Run all migration files from supabase/migrations/ in the SQL Editor.\n${missing.join('\n')}`
      : '-- All schema items present!'

    await navigator.clipboard.writeText(hint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function StatusSection({ title, items }: { title: string; items: Record<string, boolean> | undefined }) {
    if (!items) return null
    return (
      <div>
        <h4 className="text-sm font-medium text-[var(--ink-2)] mb-2">{title}</h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(items).map(([name, exists]) => (
            <div key={name} className="flex items-center gap-2 text-sm">
              {exists ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              )}
              <code className="text-[var(--ink-2)] truncate">{name}</code>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isComplete = schemaStatus?.status === 'complete'
  const totalItems = schemaStatus ? (
    Object.keys(schemaStatus.tables || {}).length +
    Object.keys(schemaStatus.holdings_columns || {}).length +
    Object.keys(schemaStatus.snapshot_columns || {}).length +
    Object.keys(schemaStatus.profile_columns || {}).length +
    Object.keys(schemaStatus.rpc || {}).length
  ) : 0
  const passingItems = schemaStatus ? (
    Object.values(schemaStatus.tables || {}).filter(Boolean).length +
    Object.values(schemaStatus.holdings_columns || {}).filter(Boolean).length +
    Object.values(schemaStatus.snapshot_columns || {}).filter(Boolean).length +
    Object.values(schemaStatus.profile_columns || {}).filter(Boolean).length +
    Object.values(schemaStatus.rpc || {}).filter(Boolean).length
  ) : 0

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink)] flex items-center gap-2">
          <Database className="h-5 w-5 text-kern-600" />
          Database Migratie
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Volledige status van database schema ({passingItems}/{totalItems} items aanwezig)
        </p>
      </div>

      {/* Schema Status */}
      <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-[var(--ink)]">Schema Status</h3>
          <button
            onClick={checkSchema}
            disabled={loading}
            className="text-sm text-kern-600 hover:text-kern-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vernieuwen'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Schema controleren...
          </div>
        ) : schemaStatus ? (
          <div className="space-y-6">
            <div className={`flex items-center gap-2 text-sm font-medium ${
              isComplete ? 'text-green-600' : 'text-kern-600'
            }`}>
              {isComplete ? (
                <><CheckCircle className="h-4 w-4" /> Schema is compleet ({passingItems}/{totalItems})</>
              ) : (
                <><AlertCircle className="h-4 w-4" /> Schema incompleet ({passingItems}/{totalItems})</>
              )}
            </div>

            <StatusSection title="Tabellen" items={schemaStatus.tables} />
            <StatusSection title="Holdings kolommen" items={schemaStatus.holdings_columns} />
            <StatusSection title="Net Worth Snapshots kolommen" items={schemaStatus.snapshot_columns} />
            <StatusSection title="Profiles kolommen" items={schemaStatus.profile_columns} />
            <StatusSection title="RPC Functies" items={schemaStatus.rpc} />
          </div>
        ) : (
          <p className="text-sm text-red-500">Schema check mislukt</p>
        )}
      </div>

      {/* Auto-apply Migration */}
      {schemaStatus && !isComplete && (
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-6">
          <h3 className="font-medium text-[var(--ink)] mb-2">Migratie Uitvoeren</h3>
          <p className="text-sm text-[var(--ink-3)] mb-4">
            Voer je database wachtwoord in om alle pending migraties automatisch uit te voeren.
            Vind je wachtwoord in Supabase Dashboard &gt; Settings &gt; Database.
          </p>

          <div className="flex gap-2">
            <input
              type="password"
              value={dbPassword}
              onChange={(e) => setDbPassword(e.target.value)}
              placeholder="Database wachtwoord"
              className="flex-1 rounded-md border border-[var(--border-md)] px-3 py-2 text-sm focus:border-kern-500 focus:ring-1 focus:ring-kern-500 focus:outline-none"
            />
            <button
              onClick={applyMigration}
              disabled={migrating || !dbPassword.trim()}
              className="flex items-center gap-2 rounded-md bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
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

      {/* Manual SQL instructions */}
      {schemaStatus && !isComplete && (
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-[var(--ink)]">Handmatig via SQL Editor</h3>
            <button
              onClick={copySQL}
              className="flex items-center gap-1 text-sm text-kern-600 hover:text-kern-700"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Gekopieerd!' : 'Kopieer status'}
            </button>
          </div>
          <p className="text-sm text-[var(--ink-3)] mb-4">
            Run de SQL bestanden uit <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">supabase/migrations/</code> in de{' '}
            <a
              href="https://supabase.com/dashboard/project/pnnuqwdcgoympgddrvze/sql/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-kern-600 underline hover:text-kern-700"
            >
              Supabase SQL Editor
            </a>
            . Of gebruik de Supabase MCP tools: <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">apply_migration</code> / <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">execute_sql</code>.
          </p>
          <div className="rounded-md bg-zinc-900 p-4 text-xs text-zinc-300 font-mono space-y-1">
            <p>-- Pending migratie bestanden (chronologisch):</p>
            {!schemaStatus.all_holdings_columns_exist && <p>-- supabase/migrations/20260316100001_add_holdings_classification_and_target_allocations.sql</p>}
            {!schemaStatus.holdings_columns?.is_favorite && <p>-- supabase/migrations/20260316100002_add_holdings_is_favorite.sql</p>}
            {!schemaStatus.holdings_columns?.currency && <p>-- supabase/migrations/20260316200001_add_holdings_currency.sql</p>}
            {!schemaStatus.tables?.holding_prices && <p>-- supabase/migrations/20260316300001_create_holding_prices.sql</p>}
            <p>-- supabase/migrations/20260316400001_add_holding_transaction_split_type.sql</p>
            {!schemaStatus.tables?.holding_alerts && <p>-- supabase/migrations/20260316400002_create_holding_alerts.sql</p>}
            <p>-- supabase/migrations/20260316500001_create_pension_documents_bucket.sql</p>
            <p>-- supabase/migrations/20260316600001_drop_badges_streaks_tables.sql</p>
            {!schemaStatus.profile_columns?.onboarding_idempotency_key && <p>-- supabase/migrations/20260319000001_add_budgets_user_slug_parent_unique.sql</p>}
            {!schemaStatus.rpc?.save_onboarding_data && <p>-- supabase/migrations/20260319000002_create_save_onboarding_rpc.sql</p>}
            {!schemaStatus.profile_columns?.withdrawal_strategy && <p>-- supabase/migrations/20260318000001_add_withdrawal_strategy_columns.sql</p>}
            {!schemaStatus.profile_columns?.invulfase_active && <p>-- supabase/migrations/20260319000003_add_invulfase_active_to_profiles.sql</p>}
          </div>
        </div>
      )}
    </div>
  )
}
