'use client'

import Link from 'next/link'
import { Minus, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'
import { deflate } from '@/lib/euro-display'
import { hasSubscription } from '@/lib/feature-registry'
import { useModuleAccess } from '@/lib/feature-access/context'
import { formatMaskedCurrency, formatWithFreedom, type FreedomRateSource } from '@/lib/format'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { freedomDaysAtAge } from '@/lib/horizon/vrijheidsdagen'
import {
  buildEindsituatieCopy,
  EINDSITUATIE_INSTELLING_HREF,
  EINDSITUATIE_INSTELLING_LABEL,
} from '@/lib/horizon/eindsituatie-copy'
import type { EindsituatieDuiding, NominaalOpLeeftijd } from '@/lib/horizon/eindsituatie-duiding'
import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * EindsituatieNotice — "waarom blijft er aan het eind zoveel over?" boven de tijdas.
 *
 * Presentatie van een duiding uit DEZELFDE run als de grafiek (`detectEindsituatie`,
 * horizon-client). Alle bedragen komen NOMINAAL binnen met hun eigen rij-factor; dit
 * component deflateert ze exact één keer (`deflate`, ADR 0090/0093) volgens de
 * euro-weergave — kruis-regime "nominaal in, component leest `useEuroView()` zelf",
 * net als de fase-modals. Vrijheidstijd bij het overschot is real-verankerd
 * (`freedomDaysAtAge`) en alleen op de liquide grondslag.
 *
 * De aria-live-regio blijft ALTIJD gemount (meldingen-conventie), zodat minimaliseren
 * en heropenen worden aangekondigd. Neutrale horizon-stijl (informatief, geen status).
 *
 * Fin-knop: alleen wanneer er niet één regel aan te wijzen is (`!eenduidig`) én AI
 * actief is (abonnement `ai` ∧ uitvoermodus 'gesprek' kan cloud of lokaal). De vraag
 * bevat bewust geen bedragen, maar wél de oorzaken uit deze melding (`finContext`):
 * Fins AI-context kent tekort-lening en opeetplafond niet, dus zonder die regel geeft
 * Fin een generieke rendementsuitleg.
 */
export function EindsituatieNotice({
  duiding,
  endForm,
  display,
  canMinimize,
  onMinimize,
  canonicalDailyRate,
  dailyRateSource,
  overschotIsLiquide,
}: {
  duiding: EindsituatieDuiding | null
  endForm: 'deplete' | 'legacy' | 'perpetual'
  display: BannerDisplay | 'none'
  canMinimize: boolean
  onMinimize: () => void
  /** `HorizonPageData.dailyExpenseRate` — geconsumeerd, nooit hier gerekend. */
  canonicalDailyRate: number
  dailyRateSource?: FreedomRateSource
  /** Staat het overschot op de liquide grondslag (J)? Alleen dan tonen we vrijheidstijd. */
  overschotIsLiquide: boolean
}) {
  const { view: euroView } = useEuroView()
  const { masked } = useMaskedAmounts()
  const { subscriptions } = useModuleAccess()

  const expanded = duiding != null && display === 'expanded'
  const wilFin = expanded && duiding != null && !duiding.eenduidig
  const hasAi = hasSubscription(subscriptions, 'ai')
  // Alleen resolven wanneer de knop überhaupt kan verschijnen (geen fetch per render).
  const exec = useExecutionMode('gesprek', wilFin && hasAi)
  const toonFin = wilFin && hasAi && (exec.canUseCloud || exec.canUseLocal)

  const copy = useMemo(() => {
    if (!duiding) return null
    const bedragTekst = (b: NominaalOpLeeftijd) =>
      formatMaskedCurrency(deflate(b.bedrag, b.inflationFactor, euroView), masked)
    return buildEindsituatieCopy({ duiding, endForm, bedragTekst })
  }, [duiding, endForm, euroView, masked])

  const vrijheid = useMemo(() => {
    if (!duiding || !overschotIsLiquide || masked) return null
    const dagen = freedomDaysAtAge({
      rows: [{ age: duiding.overschot.age, inflationFactor: duiding.overschot.inflationFactor }],
      age: duiding.overschot.age,
      nominalAmount: duiding.overschot.bedrag,
      canonicalDailyRate,
      source: dailyRateSource,
    })
    return dagen != null ? formatWithFreedom(dagen, 1, { includeCurrency: false, includeDays: false }) : null
  }, [duiding, overschotIsLiquide, masked, canonicalDailyRate, dailyRateSource])

  return (
    <section role="status" aria-live="polite">
      {duiding && display === 'minimized' && (
        <span className="sr-only">
          Uitleg over wat er aan het eind overblijft geminimaliseerd. Activeer de gekleurde stip
          naast de informatie-knop om de uitleg opnieuw te tonen.
        </span>
      )}
      {expanded && copy && (
        <div
          data-testid="eindsituatie-melding"
          className="mb-4 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/50 px-3.5 py-3"
        >
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-horizon-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-sans text-[13px] font-semibold text-horizon-800">{copy.kop}</h3>
                {canMinimize && (
                  <button
                    type="button"
                    onClick={onMinimize}
                    aria-label="Minimaliseren"
                    title="Minimaliseren"
                    className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    Minimaliseren
                  </button>
                )}
              </div>
              <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--ink-2)]">
                {copy.samenvatting}
                {vrijheid ? <> Dat is ongeveer {vrijheid} vrijheid.</> : null}
              </p>
              {copy.oorzaken.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-1 pl-4 font-sans text-[12px] leading-relaxed text-[var(--ink-2)]">
                  {copy.oorzaken.map((zin) => (
                    <li key={zin}>{zin}</li>
                  ))}
                </ul>
              )}
              {copy.context && (
                <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-[var(--ink-2)]">{copy.context}</p>
              )}
              {toonFin && copy.onduidelijk && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <p className="font-sans text-[12px] leading-relaxed text-[var(--ink-2)]">{copy.onduidelijk}</p>
                  <BesprekMetWillButton onderwerp={copy.kop} detail={copy.finContext} vraag={copy.finVraag} />
                </div>
              )}
              <Link
                href={EINDSITUATIE_INSTELLING_HREF}
                className="mt-2 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-horizon-800 underline underline-offset-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                style={{ minHeight: 44 }}
              >
                {EINDSITUATIE_INSTELLING_LABEL}
              </Link>
              <p className="mt-1 font-sans text-[11px] text-[var(--ink-3)]">{copy.disclaimer}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
