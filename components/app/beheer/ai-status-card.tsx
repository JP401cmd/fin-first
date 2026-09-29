import Link from 'next/link'
import { AlertTriangle, CheckCircle2, HelpCircle, Clock } from 'lucide-react'
import type { AiHealthSnapshot } from '@/lib/ai/ai-health-loader'

/**
 * UR3-09 / ADR 0132 — de AI-storing van 24 aug–5 sep was twaalf dagen
 * onzichtbaar op /beheer. `AiStatusCard` staat altijd bovenaan /beheer/ai; de
 * data komt van `lib/ai/ai-health-loader.ts`.
 *
 * Op de startpagina van beheer stond tot het beheerdashboard een losse strip
 * (`AiHealthStrip`). Die is vervallen: dezelfde stand staat daar nu in de
 * aandachtslijst en de statustabel (lib/beheer/dashboard/signalen.ts en
 * onderdelen.ts), naast de andere signalen en met dezelfde drempel.
 */

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
function fmt(iso: string | null): string {
  if (!iso) return 'nooit'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

function meervoud(n: number, enkel: string, meer: string): string {
  return `${n} ${n === 1 ? enkel : meer}`
}

function describeStatus(health: AiHealthSnapshot): string {
  switch (health.status) {
    case 'storing':
      return `Fin/AI werkt niet sinds ${fmt(health.sinceAt)} — ${meervoud(health.failureCount, 'mislukte aanroep', 'mislukte aanroepen')}, laatste geslaagde ${fmt(health.lastSuccessAt)} (provider weigert).`
    case 'hapering':
      return `Fin/AI hapert sinds ${fmt(health.sinceAt)} — ${meervoud(health.failureCount, 'mislukte aanroep', 'mislukte aanroepen')}, laatste geslaagde ${fmt(health.lastSuccessAt)}.`
    case 'attention':
      return `Eén mislukte aanroep sinds de laatste geslaagde (${fmt(health.lastSuccessAt)}) — nog geen patroon.`
    case 'idle':
      return 'Nog geen enkele cloud-AI-aanroep geregistreerd.'
    case 'unknown':
      return 'Status kon niet worden afgelezen (bron onbereikbaar).'
    case 'ok':
    default:
      return `Werkt — laatste geslaagde aanroep ${fmt(health.lastSuccessAt)}.`
  }
}

/** Volledige statuskaart bovenaan /beheer/ai — altijd zichtbaar, ook bij 'Werkt'. */
export function AiStatusCard({ health }: { health: AiHealthSnapshot }) {
  const negative = health.status === 'storing'
  const warn = health.status === 'hapering' || health.status === 'attention' || health.status === 'unknown'
  const Icon = negative ? AlertTriangle : warn ? Clock : health.status === 'idle' ? HelpCircle : CheckCircle2
  const toneClass = negative
    ? 'border-negative/30 bg-negative-bg'
    : warn
      ? 'border-warning/30 bg-warning-bg'
      : 'border-[var(--border-ed)] bg-[var(--paper)]'
  const iconClass = negative ? 'text-negative' : warn ? 'text-warning' : 'text-positive'

  return (
    <div className={`mb-6 flex items-start gap-3 rounded-[var(--r-lg)] border p-4 ${toneClass}`}>
      <Icon aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${iconClass}`} />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--ink)]">AI-status</h2>
        <p className="mt-1 text-sm text-[var(--ink-2)]">{describeStatus(health)}</p>
        {health.status !== 'ok' && health.status !== 'idle' && (
          <Link href="/beheer/errors" className="mt-1.5 inline-block text-xs text-[var(--ink-3)] underline hover:text-[var(--ink-2)]">
            Bekijk foutmeldingen (ai:*)
          </Link>
        )}
      </div>
    </div>
  )
}
