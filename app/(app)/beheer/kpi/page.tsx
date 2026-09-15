import { BarChart3 } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { hasSubscription } from '@/lib/feature-registry'
import { localMonthBounds } from '@/lib/month-range'

export const dynamic = 'force-dynamic'

interface ProfileRow {
  created_at: string | null
  onboarding_completed: boolean | null
  active_subscriptions: string[] | null
  blocked_at: string | null
  role: string | null
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--ink-3)]">{sub}</div>}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-4">
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">{children}</span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

export default async function BeheerKpiPage() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    redirect('/overzicht')
  }
  const now = new Date()
  // Maandstart als tijdzone-veilige grens voor "deze maand tot nu" (created_at).
  const monthStart = localMonthBounds(now).start

  // Profielen van álle gebruikers: via de service-role-client (de brede
  // superadmin-RLS op profiles is verwijderd — zie lib/supabase/service.ts).
  const service = getServiceClient()
  const [profilesRes, aiRes, errRes, mailRes, activeRes] = await Promise.all([
    service.from('profiles').select('created_at, onboarding_completed, active_subscriptions, blocked_at, role'),
    supabase.from('ai_usage').select('credits').gte('created_at', monthStart),
    supabase.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('mail_log').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    // Actieve gebruikers uit user_activity_days (ADR 0146) — alleen tellingen,
    // service-role-only RPC. Faalt stil (null) zolang de migratie niet draait.
    service.rpc('admin_activity_counts'),
  ])

  const profiles = (profilesRes.data ?? []) as ProfileRow[]
  const total = profiles.length
  const onboarded = profiles.filter((p) => p.onboarding_completed).length
  const blocked = profiles.filter((p) => p.blocked_at).length
  const superadmins = profiles.filter((p) => p.role === 'superadmin').length
  const aiUsers = profiles.filter((p) => hasSubscription(p.active_subscriptions ?? [], 'ai')).length
  const connectedUsers = profiles.filter((p) => hasSubscription(p.active_subscriptions ?? [], 'connected')).length
  const gratis = total - profiles.filter((p) =>
    hasSubscription(p.active_subscriptions ?? [], 'ai') || hasSubscription(p.active_subscriptions ?? [], 'connected'),
  ).length
  const newThisMonth = profiles.filter((p) => p.created_at && p.created_at >= monthStart).length

  const aiCreditsMonth = ((aiRes.data ?? []) as { credits: number }[]).reduce((s, r) => s + r.credits, 0)
  const errorsMonth = errRes.count ?? 0
  const mailMonth = mailRes.count ?? 0
  const active = activeRes.error
    ? null
    : ((Array.isArray(activeRes.data) ? activeRes.data[0] : activeRes.data) as
        | { dau: number; wau: number; mau: number }
        | undefined) ?? null
  // Functie bestaat nog niet (42883 in Postgres, PGRST202 in PostgREST) ⇒ de
  // migratie is nog niet uitgerold. Elke andere fout is een echte storing.
  const activeNietUitgerold = ['42883', 'PGRST202'].includes(activeRes.error?.code ?? '')
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}% van totaal` : undefined)

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Kerngetallen</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">Platform in één oogopslag.</p>
      </div>

      <section className="mb-8">
        <SectionLabel>Gebruikers</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Totaal" value={total} />
          <Kpi label="Onboarding klaar" value={onboarded} sub={total > 0 ? `${Math.round((onboarded / total) * 100)}%` : undefined} />
          <Kpi label="Geblokkeerd" value={blocked} />
          <Kpi label="Superadmins" value={superadmins} />
          <Kpi label="AI-abonnees" value={aiUsers} />
          <Kpi label="Connected" value={connectedUsers} />
          <Kpi label="Gratis" value={gratis} />
        </div>
      </section>

      <section className="mb-8">
        <SectionLabel>Actief gebruik</SectionLabel>
        {active ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label="Vandaag" value={active.dau} sub={pct(active.dau)} />
            <Kpi label="Laatste 7 dagen" value={active.wau} sub={pct(active.wau)} />
            <Kpi label="Laatste 30 dagen" value={active.mau} sub={pct(active.mau)} />
          </div>
        ) : (
          <p className="text-sm italic text-[var(--ink-4)]">
            {activeNietUitgerold
              ? 'Nog niet gemeten — de activiteitsregistratie is nog niet uitgerold.'
              : 'Actief gebruik kon niet worden geladen.'}
          </p>
        )}
      </section>

      <section>
        <SectionLabel>Deze maand</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Nieuwe gebruikers" value={newThisMonth} />
          <Kpi label="AI-credits verbruikt" value={aiCreditsMonth} />
          <Kpi label="Foutmeldingen" value={errorsMonth} />
          <Kpi label="E-mailpogingen" value={mailMonth} />
        </div>
      </section>
    </div>
  )
}
