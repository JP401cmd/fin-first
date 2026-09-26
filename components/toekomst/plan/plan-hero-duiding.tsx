// Verplaatst uit components/app/horizon/horizon-client.tsx r6186–6305 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

import { AnkerDrieslag } from '@/components/app/horizon/anker-drieslag'
import type { SimResult } from '@/lib/fire-simulation'
import type { FreedomFraming, StopAnchor } from '@/lib/fire-strategy'
import { formatMaskedApproxCurrency } from '@/lib/format'
import type { AnkerReach, AnkerStop } from '@/lib/horizon/anker-copy'
import type { HeroFireAge } from '@/lib/horizon/hero-fire-age'
import { buildVrijheidsleeftijdZin } from '@/lib/horizon/vrijheidsleeftijd-zin'
import type { HouseholdHeroData } from './types'

/** Blok E + F — ankerdrieslag, duidingszin en voortgangsbalk (aaneengesloten in de bron). */
export interface PlanHeroDuidingProps {
  hasPerspectiveHero: boolean // horizon-client r5633
  heroFireAge: HeroFireAge // horizon-client r2852
  currentAge: number | null // horizon-client r2080
  solvedRun: { fireAge: number | null; endAge: number | null; } | null // horizon-client r760
  simResult: SimResult | null // horizon-client r1253
  isFixedAnchorMode: boolean // horizon-client r2144
  perspectiveHero: HouseholdHeroData | null // horizon-client r5632
  heroFreedomFraming: FreedomFraming // horizon-client r5704
  planAnchor: StopAnchor // horizon-client r2141
  ankerReach: AnkerReach | null // horizon-client r2723
  ankerStop: AnkerStop | null // horizon-client r2736
  showFireAgeNotice: boolean // horizon-client r5751
  effectiveFreedomPct: number // horizon-client r2697
  viewPerspectiveHeroFireTarget: number | null // horizon-client r5636
  masked: boolean // horizon-client r621
  isPartnerView: boolean // horizon-client r625
  viewBalkVrijheidDoel: number // horizon-client r5234
}

export function PlanHeroDuiding({
  hasPerspectiveHero,
  heroFireAge,
  currentAge,
  solvedRun,
  simResult,
  isFixedAnchorMode,
  perspectiveHero,
  heroFreedomFraming,
  planAnchor,
  ankerReach,
  ankerStop,
  showFireAgeNotice,
  effectiveFreedomPct,
  viewPerspectiveHeroFireTarget,
  masked,
  isPartnerView,
  viewBalkVrijheidDoel,
}: PlanHeroDuidingProps) {
  return (
    <>
          {/* ── Duiding onder het kerngetal (S15) ────────────────────────────
              Wat de KPI's laten zien is een getal; wat de gebruiker wil weten
              is wat dat getal betekent. Die zin bestond al in de tips-overlay en
              op de welkomstkaart — allebei tijdelijk zichtbaar — maar niet op de
              pagina zelf, en juist in Eenvoudig (waar de Opnamerate-KPI wegvalt)
              stonden er drie kale cijfers zonder vertaling.

              Deze plek in de DOM dekt beide layouts met één instantie: op
              desktop valt hij onder de figures-strip hierboven, op mobiel onder
              het grote primaire getal (de desktop-strip is daar `hidden` en de
              2×2-strip volgt pas ná de balk).

              Beide weergavemodi (eigenaarsbesluit D1): Volledig zou anders
              mínder tekst tonen dan Eenvoudig, en dat keert het contract van
              `HideInSimple` om. De duiding staat náást de expert-KPI, niet in
              plaats daarvan.

              Woorden én afronding komen uit `lib/horizon/vrijheidsleeftijd-zin.ts`
              — dezelfde bron als de overlay en de welkomstkaart, en dezelfde
              afrondingsregel als het kopgetal hierboven. Consume-only: geen
              eigen leeftijdsafleiding, geen bedrag (dus buiten de deflator- en
              maskeringsregels). */}
          {/* ADR 0129 D7/B9 — de DRIESLAG onder een vast anker: VRIJ MOGELIJK VANAF
              (tweede run) · JOUW STOPMOMENT (instelling) · REIKT TOT (bereik). Alleen
              in de eigen weergave; consume-only uit `heroFireAge.anker`. */}
          {!hasPerspectiveHero && heroFireAge.anker && (
            <AnkerDrieslag
              anker={heroFireAge.anker}
              currentAge={currentAge}
              solvedFireEndAge={solvedRun?.endAge ?? null}
              planEndAge={simResult?.displayEndAge ?? null}
              solvedPending={isFixedAnchorMode && solvedRun === null}
            />
          )}

          {(() => {
            const zin = buildVrijheidsleeftijdZin({
              freedomAge: hasPerspectiveHero ? perspectiveHero!.fireAge : heroFireAge.age,
              framing: heroFreedomFraming,
              anchor: planAnchor,
              // ADR 0129 — onder een VAST anker gaat deze zin over BEREIK, niet over
              // een moment: `heroFireAge.age` is daar de bereik-leeftijd, en
              // "werken wordt een keuze rond je 78e" zou daar een belofte van maken.
              ankerReach: hasPerspectiveHero ? null : ankerReach,
              ankerStop: hasPerspectiveHero ? null : ankerStop,
              // Nog geen antwoord (kernel rekent) of een gegevensprobleem (M6 /
              // UR2-05): dan draagt de KPI zelf al een melding. Een duidingszin
              // eronder zou daar tegenin praten — `showFireAgeNotice` dekt óók
              // het geval waarin het doelbedrag de melding veroorzaakt.
              pending:
                !hasPerspectiveHero &&
                (heroFireAge.status === 'berekenen' || showFireAgeNotice),
              subjectName: hasPerspectiveHero ? perspectiveHero!.householdName : null,
            })
            if (zin.kind === 'berekenen') return null
            return (
              <p
                data-testid="hero-duiding"
                className="mb-3 sm:mb-4 max-w-[60ch] text-[13px] italic leading-snug text-[var(--ink-2)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {zin.lead}
                {zin.ageLabel && (
                  <span className="not-italic font-semibold text-[var(--module-active-700)]">
                    {zin.ageLabel}
                  </span>
                )}
                {zin.tail}
              </p>
            )
          })()}

          {/* Voortgangsbalk */}
          <div className="mb-3 sm:mb-6">
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-horizon-600 via-horizon-400 to-horizon-300 transition-all duration-1000"
                style={{ width: `${hasPerspectiveHero ? Math.max(Math.min(perspectiveHero!.freedomPercentage, 100), 0) : effectiveFreedomPct}%` }}
              />
            </div>
            {/* Balk-label = HETZELFDE bedrag als de Doelbedrag-KPI hierboven, in
                de actieve euro-weergave. Eigenaar-besluit 27-08-2026 (addendum
                ADR 0034, conventie ADR 0093): het label leest voor een gebruiker
                als een doelbedrag, niet als de wiskundige noemer van de
                balk-vulling — twee bedragen voor hetzelfde doel op één scherm
                ("ca. €180.000" in de KPI naast €200.032 onder de balk) leest als
                een fout, ook al was de eerdere nominale keuze intern
                verdedigbaar. Daarmee vervalt de euro-view-uitzondering die hier
                stond (D12/D13).
                Wat NIET meebeweegt: de vulling blijft `effectiveFreedomPct` —
                onder `solved` de kapitaalratio (computeFreedomProgressWithBasis),
                onder een vast anker de DEKKING (ADR 0129 B3/D5), zodat de vulling
                dezelfde grootheid meet als het tijd-label hieronder. Beide zijn een
                ratio (klasse R, ADR 0093) en deflateren nooit. Gevolg dat de eigenaar accepteert:
                in 'real' is de breuk onder de balk niet meer letterlijk
                teller/label. Ook de grondslag-keuze (excl. woning bij
                `isHomeExcludedFromFire`) is ongewijzigd — ADR 0034.
                Deflatie loopt via de canonieke route en exact één keer:
                `viewBalkVrijheidDoel`/`viewVermogenOpAnker` zijn binnen de
                render-grens gedeeld door `factorAtAge` op het FIRE- resp.
                ANKER-jaar (`SimResult.vastStopLeeftijd` — het bedrag staat op de
                ankermaand, niet op de AOW-leeftijd).
                Gepind in horizon-client.euro-view.test.ts. */}
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>0%</span>
              <span className="font-mono">
                {hasPerspectiveHero
                  ? `${formatMaskedApproxCurrency(viewPerspectiveHeroFireTarget ?? perspectiveHero!.fireTarget, masked)} — ${isPartnerView ? `${perspectiveHero!.householdName}'s vrijheid` : 'gezamenlijke vrijheid'}`
                  // ADR 0129 D5/D8 — onder ÉLK vast anker meet de balk DEKKING (tijd),
                  // geen kapitaal: een doelbedrag noemen zou een noemer suggereren die
                  // niet bestaat (D4). Het label noemt daarom het einde van het plan.
                  : isFixedAnchorMode
                    ? (simResult != null
                        ? `tot je ${Math.round(simResult.displayEndAge)}e — einde van je plan`
                        : 'einde van je plan')
                    : `${formatMaskedApproxCurrency(viewBalkVrijheidDoel, masked)} — volledige vrijheid`}
              </span>
              <span>100%</span>
            </div>
          </div>
    </>
  )
}
