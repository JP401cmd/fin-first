import Link from 'next/link'
import { AlertTriangle, CheckCircle2, HelpCircle, Clock } from 'lucide-react'
import type { AiHealthSnapshot } from '@/lib/ai/ai-health-loader'

/**
 * UR3-09 / ADR 0132 — de AI-storing van 24 aug–5 sep was twaalf dagen
 * onzichtbaar op /beheer. `AiHealthStrip` (hub, alleen bij `storing`/
 * `hapering`) en `AiStatusCard` (/beheer/ai, altijd) delen deze presentatie;
 * de data komt van `lib/ai/ai-health-loader.ts`.
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

/** Ook gebruikt door de hub-pagina om te bepalen of de strip moet renderen. */
export function aiHealthNeedsAttention(status: AiHealthSnapshot['status']): boolean {
  return status === 'storing' || status === 'hapering'
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

/** Compacte banner voor de /beheer-hub. Rendert NIETS bij `ok`/`idle`/`attention`. */
export function AiHealthStrip({ health }: { health: AiHealthSnapshot }) {
  if (!aiHealthNeedsAttention(health.status)) return null
  const Icon = health.status === 'storing' ? AlertTriangle : Clock
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-2.5 rounded-[var(--r-lg)] border border-negative/30 bg-negative-bg px-4 py-3"
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
      <div className="min-w-0 text-sm text-[var(--ink)]">
        <p className="font-medium">{describeStatus(health)}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
          <Link href="/beheer/ai" className="underline hover:text-[var(--ink-2)]">
            AI-instellingen
          </Link>
          <Link href="/beheer/errors" className="underline hover:text-[var(--ink-2)]">
            Foutmeldingen
          </Link>
        </p>
      </div>
    </div>
  )
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
