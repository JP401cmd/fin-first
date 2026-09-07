'use client'

/**
 * BudgetCashSources — "welke rekeningen lopen mee in budgetteren?" (W-002).
 *
 * ── Waarom dit scherm bestaat ───────────────────────────────────────────────
 * De keuze zat tot nu toe op twee plekken: in de inrichtwizard
 * (`app-setup/configs/budgetteren.config.tsx`, alleen bij het opzetten) en per
 * rekening in het bezittingenscherm (`<AssetDetailSheet>` / `<CashAccountView>`).
 * Wie 'm achteraf wilde bijstellen moest dus per rekening naar Bezittingen. Deze
 * lijst is dezelfde keuze, op de plek waar je hem zoekt — en met dezelfde
 * visuele vorm als de wizard, zodat het herkenbaar hetzelfde vinkje is.
 *
 * ── De keuze is gelijk, per constructie ─────────────────────────────────────
 * We schrijven `assets.has_budget_tracking` NOOIT rechtstreeks. Er hangt een
 * drieluik aan — de asset-vlag, de `bank_accounts`-companion en de module-gate
 * `profiles.budgeting_active` — dat alleen samen gemuteerd mag worden
 * (`lib/budget-tracking.ts#setBudgetTracking`). Het canonieke HTTP-pad daarvoor
 * is `POST /api/assets/toggle-budget`, precies wat het rekeningscherm al
 * gebruikt. Daarmee is "de keuze is gelijk" geen afspraak maar een gevolg.
 *
 * `POST /api/budgetteren/setup` is met opzet NIET hergebruikt: die zet álle
 * cash-assets eerst op `false` en verwijdert bestaande budgetten. Dat is de
 * inricht-semantiek, niet de bijstel-semantiek.
 *
 * ── De laatste rekening ─────────────────────────────────────────────────────
 * Zonder budgetrekening valt de hele module om (`budgeting_active` gaat uit).
 * Het uitzetten van de láátste actieve rekening loopt daarom langs een
 * bevestiging — dezelfde waarschuwing die het bezittingenscherm al toont, hier
 * als `ShellOverlay kind="confirm"` (ADR 0039: geen hand-gerolde overlay).
 *
 * ── Geen bedragen ───────────────────────────────────────────────────────────
 * De wizard toont per rekening het saldo. Dit scherm toont het subtype in plaats
 * daarvan: dat identificeert de rekening even goed en is voor déze keuze
 * relevanter, en het houdt een kaal significant bedrag zonder zijn
 * vrijheidstijd-equivalent van het scherm.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import type { BudgetCashSource } from '@/lib/budget-cash-sources'

const SAVE_ERROR_TEXT =
  'Niet gelukt om dit op te slaan. Je keuze staat weer zoals hij was — probeer het zo nog eens.'

export function BudgetCashSources({ sources }: { sources: BudgetCashSource[] }) {
  const router = useRouter()
  // Lokale spiegel van de servertoestand — bestaat alleen om de vinkjes
  // OPTIMISTISCH te kunnen omzetten (en bij een mislukte schrijfactie terug te
  // draaien). De server blijft de waarheid: na elke geslaagde toggle draait
  // `router.refresh()` en komt er een nieuwe `sources`-prop binnen.
  const [tracked, setTracked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sources.map((s) => [s.id, s.tracked])),
  )
  // ...en dáárom moet de spiegel de prop volgen. De initializer van `useState`
  // draait alleen bij mount, dus zonder deze sync bleef `tracked` hangen op de
  // toestand van het eerste bezoek: een rekening die elders (Bezittingen, de
  // inrichtwizard) is aangezet las hier daarna als uitgevinkt terwijl hij
  // server-side gewoon meeliep. `sources` komt uit een server-component, dus de
  // identiteit wisselt alleen wanneer de server opnieuw rendert — een gewone
  // client-rerender overschrijft een lopende optimistische toggle dus niet.
  useEffect(() => {
    setTracked(Object.fromEntries(sources.map((s) => [s.id, s.tracked])))
  }, [sources])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  /** Rekening die wacht op de "dit is je laatste"-bevestiging. */
  const [confirmSource, setConfirmSource] = useState<BudgetCashSource | null>(null)

  const trackedCount = sources.filter((s) => tracked[s.id]).length

  async function persist(source: BudgetCashSource, next: boolean) {
    const previous = tracked[source.id] ?? false
    setPendingId(source.id)
    setSaveError(false)
    setTracked((prev) => ({ ...prev, [source.id]: next }))
    try {
      const res = await fetch('/api/assets/toggle-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: source.id, enabled: next }),
      })
      if (!res.ok) throw new Error('toggle-budget faalde')
      // De module-gate en de companion-rij zijn nu mogelijk gewijzigd; de
      // server-loaders eromheen moeten dat zien.
      router.refresh()
    } catch {
      setTracked((prev) => ({ ...prev, [source.id]: previous }))
      setSaveError(true)
    } finally {
      setPendingId(null)
    }
  }

  function onToggle(source: BudgetCashSource, next: boolean) {
    // Laatste actieve rekening uitzetten → eerst bevestigen (zie de kop).
    if (!next && tracked[source.id] && trackedCount === 1) {
      setConfirmSource(source)
      return
    }
    void persist(source, next)
  }

  if (sources.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-5">
        <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
          Je hebt nog geen cash- of spaarrekening. Voeg er één toe bij je{' '}
          <Link
            href="/overzicht/bezittingen/cash"
            className="underline decoration-[var(--ink-3)] underline-offset-2 hover:decoration-[var(--ink)]"
          >
            bezittingen
          </Link>
          , dan kun je 'm hier laten meelopen.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {sources.map((source) => {
          const checked = tracked[source.id] ?? false
          const busy = pendingId === source.id
          return (
            <li key={source.id}>
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 transition-colors ${
                  checked
                    ? 'border-[var(--ink)] bg-[var(--paper)]'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
                } ${busy ? 'opacity-60' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={(e) => onToggle(source, e.target.checked)}
                  className="h-4 w-4 accent-[var(--ink)]"
                />
                <Wallet className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--ink)]">{source.name}</span>
                  <span className="block text-[11px] leading-tight text-[var(--ink-3)]">
                    {source.typeLabel}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {/* Eén live-regio voor beide meldingen, altijd gemount — anders kondigt een
          screenreader de wijziging niet aan. */}
      <p aria-live="polite" className="text-xs leading-relaxed text-[var(--ink-3)]">
        {saveError ? (
          <span className="text-negative">{SAVE_ERROR_TEXT}</span>
        ) : trackedCount === 0 ? (
          'Er loopt nu geen enkele rekening mee. Budgetteren staat daarmee uit — zet er één aan om je budgetten en transacties terug te krijgen.'
        ) : (
          `${trackedCount} van ${sources.length} ${
            sources.length === 1 ? 'rekening loopt' : 'rekeningen lopen'
          } mee in je budgetten.`
        )}
      </p>

      <ShellOverlay
        open={confirmSource !== null}
        onClose={() => setConfirmSource(null)}
        kind="confirm"
        destructive
        title="Dit is je laatste rekening"
        footer={
          <ModalFooter
            layout="stacked"
            primary={{
              label: 'Ja, uitzetten',
              onClick: () => {
                const source = confirmSource
                setConfirmSource(null)
                if (source) void persist(source, false)
              },
            }}
            secondary={{ label: 'Laat aan staan', onClick: () => setConfirmSource(null) }}
          />
        }
      >
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          {confirmSource?.name} is de enige rekening die nog meeloopt. Zet je 'm uit, dan gaat
          budgetteren in de hele app uit: je budgetten, je transactie-indeling en je vooruitblik
          verdwijnen uit beeld.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
          Je budgetten zelf blijven bewaard. Zet je hier later weer een rekening aan, dan staat
          alles er weer.
        </p>
      </ShellOverlay>
    </div>
  )
}
