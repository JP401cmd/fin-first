'use client'

import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import { formatMaskedCurrency, formatFreedomRateFootnote, type FreedomRateSource } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { TaxOpportunity } from '@/lib/tax-optimizer'
import { Kicker, ScenarioCallout } from '@/components/editorial'
import { AandachtspuntActieButton } from './aandachtspunt-actie-button'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/**
 * HubKansen (C4) — "next best action": de grootste fiscale kansen, geordend op
 * NETTO effect (de hub levert ze al gesorteerd via `loadFiscaleKansen` →
 * `toTaxOpportunities`, ADR 0086).
 *
 * Elke regel: box-streep (functionele kleur) + box-label + titel + netto effect
 * (Playfair) + vrijheidsdagen + (optionele) deadline + doorklik-link. De
 * bredere balk = groter netto effect (relatief t.o.v. de grootste kans), zodat
 * het oog meteen naar de zwaarste hefboom wordt getrokken.
 *
 * GRONDSLAG: de kop-euro is `netEffect` (belastingbesparing MÍNUS verwacht
 * misgelopen rendement) — de grootheid waarop je kunt beslissen, en dezelfde
 * waarop de lijst gesorteerd is. De bruto belastingbesparing blijft als context
 * onder de regel staan zodra beide verschillen. De producent laat alleen kansen
 * met `netEffect > 0` door, dus er is hier geen "waarschuwing zonder
 * besparing"-variant meer.
 *
 * PRIVACY (ADR 0091 laag 4). Deze kaart rendert bedragen, en daarnaast de
 * vrijheidsdagen die er lineair uit volgen (netEffect = dagen × dagtarief). Het
 * blijft een dom presentatie-component — geen fetching, geen state — maar het
 * leest wél `useMaskedAmounts()` en is daarom een client-component. Zonder dat
 * zou het het enige onderdeel op de Belasting-hub zijn dat de privacymodus
 * negeert, en zou de voetnoot met het dagtarief bovendien de wisselkoers
 * leveren om de gemaskeerde bedragen elders terug te rekenen.
 */

// Per-box coderingskleur (badge-tekst + linker-streep + besparings-bar) via de
// --color-box{n}-700 tokens. De hub heeft een neutraal-ink context, dus de
// box-kleuren worden hier direct gezet (niet via --module-active).
const BOX_BADGE: Record<1 | 2 | 3, { label: string; color: string }> = {
  1: { label: 'Box 1', color: 'var(--color-box1-700)' }, // amber
  2: { label: 'Box 2', color: 'var(--color-box2-700)' }, // violet
  3: { label: 'Box 3', color: 'var(--color-box3-700)' }, // teal
}

export function HubKansen({
  opportunities,
  dailyExpenses = 0,
  dailyExpensesSource,
}: {
  opportunities: TaxOpportunity[]
  /**
   * Het CANONIEKE dagtarief (€/dag) waarmee `netFreedomDays` hierboven is
   * omgerekend — `FiscaleKansen.dailyExpenses`. Draagt de voetnoot, zodat een
   * lezer kan zien wélke wisselkoers achter "N vrijheidsdagen" zit (M22).
   * 0 → geen voetnoot (en dan staan er ook geen dagen).
   */
  dailyExpenses?: number
  /**
   * Herkomst van dat tarief (`FiscaleKansen.dailyExpensesSource`). Een
   * profielschatting benoemt zichzelf in de voetnoot als schatting; zonder
   * bron valt de voetnoot terug op "gemeten" bij een tarief > 0 (1b).
   */
  dailyExpensesSource?: FreedomRateSource
}) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const rateFootnote = formatFreedomRateFootnote(
    dailyExpenses,
    dailyExpensesSource ?? (dailyExpenses > 0 ? 'transactions' : 'none'),
    masked,
  )

  if (opportunities.length === 0) return null

  // Schaal op het grootste NETTO effect — dezelfde grootheid waarop de lijst
  // gesorteerd is, zodat een lagere regel nooit een langere balk krijgt.
  // (>=1 voorkomt deling door nul.)
  const maxNetEffect = Math.max(...opportunities.map((o) => o.netEffect), 1)

  return (
    <article className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Grootste besparingskansen</Kicker>

      <ul className="mt-4 border-t border-[var(--rule-soft)]">
        {opportunities.map((opp) => {
          const badge = BOX_BADGE[opp.box]
          const pct = Math.min(Math.max((opp.netEffect / maxNetEffect) * 100, 0), 100)
          // Verschillen bruto en netto, dan kost dit scenario verwacht
          // rendement — dan tonen we de belastingbesparing als context.
          const showGrossContext = opp.savings !== opp.netEffect

          return (
            <li key={opp.id} className="border-b border-[var(--rule-soft)] last:border-b-0">
              <Link
                href={opp.href}
                className="group block relative py-4 pl-4 transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                {/* Box-kleur-streep links — functionele onderscheiding. */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-4 bottom-4 w-[3px]"
                  style={{ backgroundColor: badge.color }}
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: badge.color }}
                      >
                        {badge.label}
                      </span>
                      <span className="text-sm font-semibold text-[var(--ink)] leading-snug">
                        {opp.title}
                      </span>
                    </div>

                    {/* Netto effect (Playfair) + vrijheidstijd */}
                    <div className="mt-2 flex items-baseline gap-3 flex-wrap text-xs text-[var(--ink-2)]">
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="text-[var(--ink-3)]">tot</span>
                        <span
                          className="font-black tabular-nums text-lg leading-none text-[var(--positive)]"
                          style={{ fontFamily: PLAYFAIR }}
                        >
                          {fc(opp.netEffect)}
                        </span>
                        <span className="text-[var(--ink-3)]">netto per jaar</span>
                      </span>
                      {/* Vrijheidsdagen zijn netEffect ÷ dagtarief; met een
                          zichtbaar tarief in de voetnoot is het gemaskeerde
                          bedrag eruit terug te rekenen (ADR 0091 laag 4). */}
                      {!masked && opp.netFreedomDays > 0 && (
                        <span className="inline-flex items-center gap-1 text-[var(--ink-3)]">
                          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {opp.netFreedomDays} vrijheidsdagen
                        </span>
                      )}
                    </div>

                    {/* --ink-3, niet --ink-4: deze regel draagt betekenisvolle
                        financiële inhoud, geen decoratie — ink-4 haalt op
                        --paper geen AA-contrast. */}
                    {showGrossContext && (
                      <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                        waarvan {fc(opp.savings)} belastingbesparing — de rest
                        gaat op aan verwacht misgelopen rendement.
                      </p>
                    )}

                    {opp.deadline && (
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
                        Deadline · {opp.deadline}
                      </p>
                    )}

                    {/* Netto-effect-balk (relatief op de grootste kans) — scherp. */}
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden bg-[var(--subtle)]">
                      <div
                        className="h-full"
                        style={{ width: `${pct}%`, backgroundColor: badge.color }}
                      />
                    </div>
                  </div>

                  <ArrowRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
                    aria-hidden="true"
                  />
                </div>
              </Link>

              {/* "Voeg toe als actie" — deterministisch via het acties-systeem.
                  Buiten de Link gehouden (geen genest interactief element) en
                  uitgelijnd onder de regel-content (pl-4 matcht de Link-padding).
                  savings/freedomDays = de NETTO velden, identiek aan wat
                  `taxOpportunitiesToAandachtspunten` op de aandachtspunten-lijst
                  zet — dezelfde kans levert zo langs beide routes dezelfde actie. */}
              <div className="pb-4 pl-4 -mt-1">
                <AandachtspuntActieButton
                  id={`tax:${opp.id}`}
                  domain="tax"
                  title={opp.title}
                  savings={opp.netEffect}
                  freedomDays={opp.netFreedomDays}
                  deadline={opp.deadline}
                  href={opp.href}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {rateFootnote && (
        <p className="mt-4 font-mono text-[10px] leading-relaxed text-[var(--ink-3)]">
          {rateFootnote}
        </p>
      )}

      <div className="mt-5">
        <ScenarioCallout title="Indicatie, geen advies.">
          {' '}Geschatte besparing per hefboom — geen aangifte of fiscaal advies.
        </ScenarioCallout>
      </div>
    </article>
  )
}
