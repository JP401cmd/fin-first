import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_ACTIE_LABELS, adminActieLabel } from '@/lib/admin-audit-labels'
import { AUDIT_ACTIE_PARAM, auditHref } from '@/lib/beheer/dashboard/doorklik'

export const dynamic = 'force-dynamic'

interface AdminAction {
  id: string
  actor_email: string | null
  action: string
  target_label: string | null
  detail: unknown
  created_at: string
}

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

/** Compacte, leesbare samenvatting van het detail-veld per actie. */
function describeDetail(action: string, detail: unknown): string {
  if (!detail || typeof detail !== 'object') return '—'
  const d = detail as Record<string, unknown>
  if ('from' in d && 'to' in d) return `${String(d.from)} → ${String(d.to)}`
  const entries = Object.entries(d).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  )
  if (entries.length === 0) return '—'
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
}

/**
 * Alleen een bekende actie-code telt als filter. Een vrije waarde uit de URL
 * gaat dus nooit de query in; een onbekende code toont gewoon alles.
 */
function parseActie(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v && Object.prototype.hasOwnProperty.call(ADMIN_ACTIE_LABELS, v) ? v : null
}

export default async function BeheerAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const actie = parseActie((await searchParams)[AUDIT_ACTIE_PARAM])

  const supabase = await createClient()
  let query = supabase
    .from('admin_actions_log')
    .select('id, actor_email, action, target_label, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (actie) query = query.eq('action', actie)
  const { data } = await query

  const actions = (data ?? []) as AdminAction[]

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Audit-trail</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Wie wijzigde welke abonnementen, rollen, blokkades en configuratie — laatste 100 acties.
        </p>
      </div>

      {actie && (
        <p
          className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-[var(--border-ed)] py-2 text-sm text-[var(--ink-2)]"
          data-testid="audit-filter"
        >
          <span>
            Gefilterd op <span className="font-medium text-[var(--ink)]">{adminActieLabel(actie)}</span>
          </span>
          <Link
            href={auditHref()}
            className="text-xs text-[var(--ink-3)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)]"
          >
            Toon alle acties
          </Link>
        </p>
      )}

      {actions.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">
            {actie ? 'Geen acties van deze soort geregistreerd.' : 'Nog geen beheeracties geregistreerd.'}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Abonnement-, rol- en blokkadewijzigingen verschijnen hier zodra ze plaatsvinden.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-ed)] text-left">
                <th scope="col" className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-meta)]">Datum</th>
                <th scope="col" className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-meta)]">Beheerder</th>
                <th scope="col" className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-meta)]">Actie</th>
                <th scope="col" className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-meta)]">Doel</th>
                <th scope="col" className="py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-meta)]">Detail</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-dotted border-[var(--border-ed)] align-top hover:bg-[var(--subtle)]"
                >
                  <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {fmtDateTime(a.created_at)}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[var(--ink-3)]">{a.actor_email ?? '—'}</td>
                  <td className="py-2 pr-4 text-[var(--ink)]">{adminActieLabel(a.action)}</td>
                  <td className="py-2 pr-4 text-[var(--ink-2)]">{a.target_label ?? '—'}</td>
                  <td className="py-2 font-mono text-xs text-[var(--ink-3)]">{describeDetail(a.action, a.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
