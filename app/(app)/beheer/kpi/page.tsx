import { BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hasSubscription } from '@/lib/feature-registry'

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
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [profilesRes, aiRes, errRes, mailRes] = await Promise.all([
    supabase.from('profiles').select('created_at, onboarding_completed, active_subscriptions, blocked_at, role'),
    supabase.from('ai_usage').select('credits').gte('created_at', monthStart),
    supabase.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('mail_log').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
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
