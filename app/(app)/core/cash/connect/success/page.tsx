'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type LinkedAccount = {
  id: string
  iban: string | null
  gc_account_id: string
  gocardless_requisitions: {
    institution_name: string
    institution_logo: string | null
  }
}

export default function ConnectSuccessPage() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResults, setSyncResults] = useState<Record<string, { new: number; duplicates: number }>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('gocardless_accounts')
        .select('id, iban, gc_account_id, gocardless_requisitions(institution_name, institution_logo)')
        .eq('is_active', true)
        .order('iban', { ascending: true })

      if (data) {
        setAccounts(data as unknown as LinkedAccount[])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSync(accountId: string) {
    setSyncing(accountId)
    try {
      const res = await fetch('/api/gocardless/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gc_account_id: accountId }),
      })
      const data = await res.json()
      if (res.ok) {
        setSyncResults((prev) => ({ ...prev, [accountId]: { new: data.new, duplicates: data.duplicates } }))
      }
    } catch {
      // Silently handle
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>

      <h1 className="mt-4 text-2xl font-bold text-[var(--ink)]">Bank gekoppeld!</h1>
      <p className="mt-2 text-sm text-[var(--ink-3)]">
        Je bankrekening is succesvol verbonden. Je kunt nu transacties synchroniseren.
      </p>

      {/* Linked accounts */}
      {!loading && accounts.length > 0 && (
        <div className="mt-8 space-y-3 text-left">
          {accounts.map((acc) => (
            <div key={acc.id} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {acc.gocardless_requisitions?.institution_name}
                  </p>
                  {acc.iban && (
                    <p className="text-xs text-[var(--ink-3)]">{acc.iban}</p>
                  )}
                </div>

                {syncResults[acc.id] ? (
                  <span className="text-xs text-green-600">
                    {syncResults[acc.id].new} nieuw, {syncResults[acc.id].duplicates} dup
                  </span>
                ) : (
                  <button
                    onClick={() => handleSync(acc.id)}
                    disabled={syncing === acc.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing === acc.id ? 'animate-spin' : ''}`} />
                    {syncing === acc.id ? 'Synchroniseren...' : 'Synchroniseer nu'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-8 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      )}

      <div className="mt-8">
        <Link
          href="/core/cash"
          className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-kern-700"
        >
          Naar Kas overzicht
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
