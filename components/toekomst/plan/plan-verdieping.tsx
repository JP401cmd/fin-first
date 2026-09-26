// Verplaatst uit components/app/horizon/horizon-client.tsx r7833–7989 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown } from 'lucide-react'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { ScenarioKaarten } from '@/components/app/horizon/scenario-kaarten'
import { Kicker, SectionLabel } from '@/components/editorial'
import type { ScenarioPresetResult } from '@/lib/horizon/scenario-presets'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { useInViewOnce } from './use-in-view-once'

// Kopie van horizon-client r297–304 + r309–312 — V3: de dynamic() verhuist mee met zijn
// enige consument; de integrator schrapt de declaratie in horizon-client bij het inpluggen.
// Zwaar-maar-conditionele sub-componenten uit de first-load JS van /toekomst
// gehaald (bundle ronde 2). Mount-condities blijven ONGEWIJZIGD zodat gedrag +
// animaties identiek blijven — dynamic({ssr:false}) haalt de code enkel uit de
// synchrone first-load-bundle en laadt de chunk na hydratatie. Bewust géén
// mount-gate: HouseholdFireSection rendert vaak null (solo-gebruiker) + beheert z'n eigen
// laadstaat, dus een skeleton-fallback zou flitsen. `loading` = null (default).
const HouseholdFireSection = dynamic(() =>
  import('@/components/app/household-fire-section').then(m => ({ default: m.HouseholdFireSection })),
  { ssr: false }
)

/** Vanaf deze breedte staat "Wat het betekent" altijd open (Tailwind `sm:`). */
const OPEN_VANAF = '(min-width: 640px)'
const BODY_ID = 'plan-wat-het-betekent'

/**
 * Blok Q (katern III "Wat het betekent": de scenario's naast elkaar) en R
 * (HouseholdFireSection — moet op Plan gemount blijven, ADR 0168).
 *
 * Addendum 26 sep (ADR 0179): de levensinkomenstrook en de dekkingsradar zijn weg; het
 * verloop van gezondheid en vrijheidsleeftijd (HorizonTrendGrid) en de geplande acties
 * verhuisden naar /overzicht. Op mobiel staat "Wat het betekent" standaard ingeklapt,
 * vanaf `sm` open (spec §4.3, D6).
 *
 * Kaart V1: `useInViewOnce` draait híér, naast de sectie die hij observeert. Een hook in
 * een provider die eerder mount dan dit paneel haakt nooit aan (Doelen → Plan). De ouder
 * krijgt de uitkomst via `onDuidingInView` en latcht hem. De gate is "in beeld ÉN open":
 * zolang de sectie op mobiel dicht is, start de preset-batch onder `solved` niet.
 */
export interface PlanVerdiepingProps {
  /** Heeft de hoofdrun een uitkomst? Dan mount de sectie (en haakt de observer aan). */
  hasRun: boolean
  scenarioPresets: ScenarioPresetResult[] | null // horizon-client r790
  scenarioPresetsLoading: boolean // horizon-client r791
  viewScenarioPresets: ScenarioPresetResult[] | null // horizon-client r5561
  personalHeroProjection: { fireAge: number | null; fireAgeFractional: number | null; fireTarget: number; freedomPercentage: number; fireDate: string; freedomYears: number; freedomMonths: number; } | null // horizon-client r3508
  /** V1 — wordt aangeroepen zodra de duiding-sectie (bijna) in beeld is én open; de ouder latcht `duidingInView = true` (nooit terugzetten). */
  onDuidingInView: () => void
}

export function PlanVerdieping({
  hasRun,
  scenarioPresets,
  scenarioPresetsLoading,
  viewScenarioPresets,
  personalHeroProjection,
  onDuidingInView,
}: PlanVerdiepingProps) {
  const { mode: displayMode } = useDisplayMode()
  // Mobiel dicht, vanaf `sm` open. De inhoud staat altijd in de DOM en wordt op mobiel met
  // CSS verborgen (`hidden sm:block`): zo flitst hij op desktop niet bij de hydratie.
  const openVanafBreedte = useMediaQuery(OPEN_VANAF)
  const [mobielOpen, setMobielOpen] = useState(false)
  const open = openVanafBreedte || mobielOpen

  // Kopie van horizon-client r1022–1028 (V1): ref en zichtbaarheidshook bij de sectie zelf.
  // De sectie mount pas als de hoofdrun er is én de modus Volledig (HideInSimple). Een
  // ref-wissel triggert geen effect, dus de mount-conditie gaat mee als remountKey — anders
  // haakt de observer nooit aan en draaien de presets onder solved nooit (review fase 1, W5).
  const duidingSectionRef = useRef<HTMLElement | null>(null)
  const duidingInView = useInViewOnce(duidingSectionRef, '600px', `${hasRun}:${displayMode}`)
  useEffect(() => {
    if (duidingInView && open) onDuidingInView()
  }, [duidingInView, open, onDuidingInView])

  return (
    <>
      {/* === KATERN III — Wat het betekent ===
          Eén kaart met de scenario's naast elkaar. De sectie mount zodra de hoofdrun er is:
          onder `solved` rekent de preset-batch pas als deze sectie in beeld én open is, dus
          de kaarten zelf kunnen de mount-conditie niet zijn. */}
      {hasRun && (
        <HideInSimple>
          <section ref={duidingSectionRef} className="mt-8 sm:mt-10" data-testid="plan-wat-het-betekent">
            <div className="hidden sm:block">
              <SectionLabel num="III">Wat het betekent</SectionLabel>
            </div>
            <button
              type="button"
              onClick={() => setMobielOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={BODY_ID}
              data-testid="plan-wat-het-betekent-toggle"
              className="mb-5 flex min-h-[44px] w-full items-center justify-between border-b border-[var(--rule-soft)] pb-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:hidden"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--module-active-700)]">
                Wat het betekent
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 text-[var(--module-active-700)] transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
            <div id={BODY_ID} className={open ? '' : 'hidden sm:block'}>
              <div className="card-editorial no-hover-lift">
                {/* === Scenario's naast elkaar (preset-kaarten, tegen je basispad) === */}
                <div className="p-4 sm:p-5">
                  <div className="mb-1">
                    <Kicker className="mb-1">Scenario&apos;s naast elkaar</Kicker>
                    <h2 className="font-display text-[14px] font-semibold leading-snug text-[var(--ink)]">Wat als het anders loopt?</h2>
                  </div>
                  <p className="mb-3 font-sans text-[12px] text-[var(--ink-3)]">
                    Vijf paden — één basispad, verbeteringen en één waarschuwing; elk pad wordt afgezet tegen je basispad.
                  </p>
                  {(scenarioPresets !== null || scenarioPresetsLoading) && (
                    <ScenarioKaarten kaarten={viewScenarioPresets ?? []} isLoading={scenarioPresetsLoading} />
                  )}
                </div>
              </div>
            </div>
          </section>
        </HideInSimple>
      )}

      {/* === 5. Household FIRE Projections === */}
      <HideInSimple>
        <HouseholdFireSection personalProjection={personalHeroProjection} />
      </HideInSimple>
    </>
  )
}
