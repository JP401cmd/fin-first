import { ScrollText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface AdminAction {
  id: string
  actor_email: string | null
  action: string
  target_label: string | null
  detail: unknown
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  'subscription.update': 'Abonnement gewijzigd',
  'user.role': 'Rol gewijzigd',
  'user.block': 'Account geblokkeerd',
  'user.unblock': 'Account gedeblokkeerd',
  'config.update': 'Configuratie gewijzigd',
  'support.view': 'Gegevens ingezien',
  'data.export': 'Gegevens geëxporteerd',
  'user.delete': 'Account verwijderd',
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

export default async function BeheerAuditPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('admin_actions_log')
    .select('id, actor_email, action, target_label, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

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

      {actions.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen beheeracties geregistreerd.</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            Abonnement-, rol- en blokkadewijzigingen verschijnen hier zodra ze plaatsvinden.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)] text-left">
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Datum</th>
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Beheerder</th>
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Actie</th>
              <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Doel</th>
              <th className="py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">Detail</th>
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
                <td className="py-2 pr-4 text-[var(--ink)]">{ACTION_LABELS[a.action] ?? a.action}</td>
                <td className="py-2 pr-4 text-[var(--ink-2)]">{a.target_label ?? '—'}</td>
                <td className="py-2 font-mono text-xs text-[var(--ink-3)]">{describeDetail(a.action, a.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
