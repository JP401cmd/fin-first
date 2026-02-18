'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  name: string
  step: number
  passed: boolean
  detail: string
  level: 'code' | 'database'
}

interface VerificationResponse {
  feature: string
  summary: {
    code: { passing: number; total: number; percentage: number }
    database: { passing: number; total: number; percentage: number; note?: string }
    overall: { passing: number; total: number; percentage: number }
  }
  code_verification: {
    migration_file_found: boolean
    all_code_tests_passing: boolean
    passing: number
    total: number
  }
  database_verification: {
    supabase_reachable: boolean
    tests_run: boolean
    all_db_tests_passing: boolean
    passing: number
    total: number
    note?: string
  }
  all_passing: boolean
  results: TestResult[]
}

export default function TestHouseholdDB() {
  const [data, setData] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-household-db')
      .then(res => res.json())
      .then(json => {
        setData(json)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <div style={{ padding: 24, fontFamily: 'monospace' }}>Loading verification...</div>
  if (error) return <div style={{ padding: 24, fontFamily: 'monospace', color: 'red' }}>Error: {error}</div>
  if (!data) return <div style={{ padding: 24, fontFamily: 'monospace' }}>No data</div>

  const codeResults = data.results.filter(r => r.level === 'code')
  const dbResults = data.results.filter(r => r.level === 'database')

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Feature #239: Household Database Foundation
      </h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Two-level verification: Code analysis (migration SQL) + Live database checks
      </p>

      {/* Overall summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{
          padding: 16, borderRadius: 8,
          backgroundColor: data.code_verification.all_code_tests_passing ? '#d4edda' : '#f8d7da',
          border: `1px solid ${data.code_verification.all_code_tests_passing ? '#c3e6cb' : '#f5c6cb'}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Code Verification</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {data.summary.code.passing}/{data.summary.code.total}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>{data.summary.code.percentage}% passing</div>
        </div>

        <div style={{
          padding: 16, borderRadius: 8,
          backgroundColor: data.database_verification.all_db_tests_passing ? '#d4edda' : '#fff3cd',
          border: `1px solid ${data.database_verification.all_db_tests_passing ? '#c3e6cb' : '#ffc107'}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Database Verification</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {data.summary.database.passing}/{data.summary.database.total}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {data.database_verification.tests_run
              ? `${data.summary.database.percentage}% passing`
              : 'Tests not run'}
          </div>
        </div>

        <div style={{
          padding: 16, borderRadius: 8,
          backgroundColor: data.all_passing ? '#d4edda' : '#fff3cd',
          border: `1px solid ${data.all_passing ? '#c3e6cb' : '#ffc107'}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Overall</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {data.summary.overall.passing}/{data.summary.overall.total}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>{data.summary.overall.percentage}% passing</div>
        </div>
      </div>

      {/* Code-level results */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#2d6a4f' }}>
        Code-Level Verification ({data.summary.code.passing}/{data.summary.code.total})
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }} data-testid="code-results">
        {codeResults.map((result, i) => (
          <div key={i} style={{
            padding: 10, borderRadius: 6,
            border: `1px solid ${result.passed ? '#c3e6cb' : '#f5c6cb'}`,
            backgroundColor: result.passed ? '#f8fff8' : '#fff5f5',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{result.passed ? '\u2705' : '\u274C'}</span>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{result.name}</span>
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: '#666', paddingLeft: 28 }}>
              {result.detail}
            </div>
          </div>
        ))}
      </div>

      {/* Database-level results */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#6c4ab6' }}>
        Database-Level Verification ({data.summary.database.passing}/{data.summary.database.total})
      </h2>
      {data.database_verification.note && (
        <div style={{
          padding: 12, borderRadius: 6, backgroundColor: '#fff3cd', border: '1px solid #ffc107',
          marginBottom: 12, fontSize: 13
        }}>
          {data.database_verification.note}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }} data-testid="db-results">
        {dbResults.map((result, i) => (
          <div key={i} style={{
            padding: 10, borderRadius: 6,
            border: `1px solid ${result.passed ? '#c3e6cb' : '#f5c6cb'}`,
            backgroundColor: result.passed ? '#f8fff8' : '#fff5f5',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{result.passed ? '\u2705' : '\u274C'}</span>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{result.name}</span>
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: '#666', paddingLeft: 28 }}>
              {result.detail}
            </div>
          </div>
        ))}
      </div>

      {/* Schema overview */}
      <div style={{ marginTop: 16, padding: 16, backgroundColor: '#f8f9fa', borderRadius: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Schema Overview</h3>
        <div style={{ fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
{`New Tables:
  households        - id, name, split_mode, custom_split_pct, primary_payer_id, created_by
  household_members - household_id, user_id, role, sort_order, joined_at (UNIQUE on household+user)
  household_invitations - household_id, invited_by, invited_email, token, status, expires_at

Extended Tables (new columns: ownership TEXT, household_id UUID):
  assets, debts, budgets, transactions, bank_accounts,
  net_worth_snapshots, valuations, recurring_transactions

Extended Tables (new column: household_id UUID):
  profiles

Functions:
  user_household_id()        - returns household_id for current user, NULL for solo
  household_partner_totals() - returns partner's aggregated assets/debts (privacy-safe)

RLS Policies (12 total):
  households            - view/update/insert/delete by owner/members
  household_members     - view by co-members, insert/update/delete by owner or self
  household_invitations - view by members/invitee, insert by owner, update by owner/invitee

Indexes (12 total):
  Partial indexes on household_id WHERE household_id IS NOT NULL
  Full indexes on household_members.user_id, invitations.email, invitations.token

All defaults: ownership='personal', household_id=NULL
Solo users: zero behavior change`}
        </div>
      </div>

      {/* Migration file info */}
      <div style={{ marginTop: 16, padding: 16, backgroundColor: '#f0f4ff', borderRadius: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Migration Files</h3>
        <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
          <div>supabase/migrations/20260218000001_add_household_support.sql</div>
          <div>app/api/apply-household-migration/route.ts (runtime endpoint)</div>
          <div>app/api/run-household-migration/route.ts (credential-based endpoint)</div>
          <div>docs/plan-household-support.md (specification)</div>
        </div>
      </div>
    </div>
  )
}
