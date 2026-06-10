import { AlertOctagon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface ErrorRow {
  id: string
  user_id: string | null
  context: string | null
  message: string
  stack: string | null
  url: string | null
  level: string
  created_at: string
}

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
function fmt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

export default async function BeheerErrorsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('error_logs')
    .select('id, user_id, context, message, stack, url, level, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = (data ?? []) as ErrorRow[]

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Foutmeldingen</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Ongevangen client-fouten die gebruikers raakten — laatste 100.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Geen foutmeldingen geregistreerd.</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            Client-fouten worden vanaf nu automatisch hier verzameld.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <article key={r.id} className="border border-[var(--border-ed)] bg-[var(--paper)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-[var(--ink)]">{r.message}</span>
                <span className="font-mono text-xs tabular-nums text-[var(--ink-4)]">{fmt(r.created_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-[var(--ink-4)]">
                {r.url && <span>{r.url}</span>}
                {r.context && <span>· {r.context}</span>}
                {r.level !== 'error' && <span>· {r.level}</span>}
              </div>
              {r.stack && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)] hover:text-[var(--ink-3)]">
                    Stacktrace
                  </summary>
                  <pre className="mt-2 overflow-x-auto bg-[var(--subtle)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
                    {r.stack}
                  </pre>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
