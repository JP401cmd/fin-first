'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Clock, AlertTriangle } from 'lucide-react'
import {
  formatCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import {
  computeJaarruimte,
  jaarruimteBesparing,
  estimateFactorAFromSalary,
  JAARRUIMTE_FACTOR_A_IMPUTATIE,
  JAARRUIMTE_MIDDELLOON_OPBOUW_PCT,
  type JaarruimteJaar,
} from '@/lib/jaarruimte'
import { TaxGauge } from '@/components/overview/belasting/tax-gauge'
import { Kicker, SectionLabel } from '@/components/editorial'
import { AandachtspuntActieButton } from '@/components/overview/belasting/aandachtspunt-actie-button'

const BOX1_COLOR = 'var(--color-box1-700)'
const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * JaarruimteCard — toont onbenutte pensioen-aftrekruimte (Box 1) plus een
 * SIMULATOR waarmee de gebruiker live ziet wat een lijfrente-inleg oplevert.
 *
 * Plan-context: Box 1-surface inzicht 1.5. Zuivere SIMULATOR op basis van de
 * al opgeslagen factor A (prop `pensioenAangroei`) — factor A zelf bewerk je
 * uitsluitend bij de pensioen-strategie:
 *  - pensioenAangroei (prop) → bepaalt de onbenutte jaarruimte
 *  - lijfrente-inleg-slider → 0 … jaarruimte, toont live de
 *    belastingbesparing (marginaal-correct via `jaarruimteBesparing` =
 *    computeBox1Tax(bruto) − computeBox1Tax(bruto − inleg); ADR 0040/0041) +
 *    vrijheidstijd
 *  - TaxGauge (nieuw) → benutting (benut vs onbenut)
 *
 * Berekening via `lib/jaarruimte.ts`:
 *   onbenut = 30% × min(grondslag, max-premiegrondslag) − 6,27 × factor A
 *
 * ONBEKENDE FACTOR A = BOVENGRENS (bevinding H23, 26-08-2026). `factorA = 0`
 * heeft twee heel verschillende betekenissen: "expliciet geen werkgevers-
 * pensioen" (zzp) en "niet ingevuld". De bundel onderscheidt ze al
 * (`pensioenFactorAKnown`, uit `resolvePensionFactorA().isKnown` — NULL ≠ 0),
 * maar deze kaart deed dat niet: hij zei onvoorwaardelijk "Berekend met je
 * opgeslagen factor A" onder een bedrag dat de pagina erboven een "bovengrens"
 * noemde. Met `factorAKnown={false}` toont de kaart nu een badge, een BEREIK
 * i.p.v. één getal, en een footer die de onzekerheid benoemt.
 *
 * Defaults 2026:
 *   OPBOUW = 30% · FRANCHISE = €19.172 · MAX = €35.589 · factor-A-imputatie 6,27
 *
 * Vormgeving: editorial — papier + ink-hiërarchie, scherpe hoeken, Playfair
 * voor het onbenut-bedrag + de live besparing, mono labels, amber slider-accent
 * en vrijheidstijd-subregel. Simulator-functionaliteit + prop-signaturen
 * blijven ongewijzigd; de kaart rekent met de opgeslagen factor A (geen lokale
 * factor-A-invoer meer).
 */
export function JaarruimteCard({
  grossYearlyIncome,
  pensioenAangroei = 0,
  year = 2026,
  /** Dagelijkse uitgaven voor de vrijheidstijd-vertaling; 0 → geen regel. */
  dailyExpenses = 0,
  factorAEditable = true,
  factorAKnown = true,
}: {
  /** Bruto-jaarinkomen voor Box 1 (loon + winst + eigen-woning-forfait). */
  grossYearlyIncome: number
  /** Factor A: jaarlijkse pensioenaangroei in € uit het UPO (toename jaarlijkse
   *  pensioenuitkering). De motor trekt dit × 6,27 af. Default 0 (geen
   *  werkgeverspensioen). Prop-naam blijft `pensioenAangroei` voor compat. */
  pensioenAangroei?: number
  /**
   * @deprecated Niet langer gebruikt voor de besparing — die is nu marginaal-
   * correct (`jaarruimteBesparing` via de Box 1-engine, ADR 0040/0041) en leidt
   * het effectieve tarief zelf uit het inkomen af. Prop blijft bestaan zodat de
   * box1-pagina-call-sites (`marginaalTarief={marg}`) niet breken.
   */
  marginaalTarief?: number
  /** Belastingjaar voor franchise + cap. Default 2026 (actief jaar). */
  year?: JaarruimteJaar
  dailyExpenses?: number
  /** Of factor A door de eigenaar van deze kaart beheerd kan worden. false →
   *  partnerkaart in de huishoud-view (bewust `pensioenAangroei={0}`, geen eigen
   *  factor-A-bron): de footer verwijst dan NIET naar de eigen pensioen-strategie
   *  (die beheert niets van de partner). Default true. */
  factorAEditable?: boolean
  /** Of `pensioenAangroei` een BEKENDE waarde is (bundelveld
   *  `pensioenFactorAKnown` = `resolvePensionFactorA().isKnown`). NULL ≠ 0:
   *  `false` betekent "niet ingevuld", dus de getoonde ruimte is een BOVENGRENS
   *  — niet "deze persoon bouwt geen pensioen op". Default true zodat callers
   *  die de herkomst niet kennen de bestaande, zekere formulering houden;
   *  bewust expliciet doorgegeven op elk oppervlak dat de bundel wél leest. */
  factorAKnown?: boolean
}) {
  // Factor A komt rechtstreeks uit de prop `pensioenAangroei` (de al opgeslagen
  // UPO-factor-A). Bewerken gebeurt uitsluitend bij de pensioen-strategie; de
  // kaart is hier een zuivere simulator. De motor trekt factor A × 6,27 af.
  const result = computeJaarruimte(grossYearlyIncome, pensioenAangroei, year)

  // ── Bovengrens-tak: factor A ONBEKEND (bevinding H23) ───────────────────
  // Alleen op de EIGEN kaart. De partnerkaart (factorAEditable=false) valt hier
  // bewust buiten: die zegt in haar eigen footer al expliciet "berekend zonder
  // factor A — geen eigen bron" (privacy-guardrail, ADR 0036), dus een "vul je
  // factor A in"-badge zou daar naar de verkeerde persoon wijzen.
  const isUpperBound = !factorAKnown && factorAEditable && result.jaarruimte > 0

  // Ondergrens van het bereik: DEZELFDE motor, met een GESCHATTE factor A uit
  // het inkomen (`estimateFactorAFromSalary` = opbouw% × pensioengrondslag, met
  // het fiscale middelloon-MAXIMUM van 1,875% — art. 18a Wet LB). Dat maximum
  // levert de hoogst plausibele factor A en dus de laagst plausibele ruimte:
  // precies een eerlijke ondergrens ("volledige werkgeversopbouw"). Geen nieuwe
  // formule en geen tweede rekenpad — twee aanroepen van `computeJaarruimte`,
  // net zoals de bovengrens er één is.
  const lowerBound = isUpperBound
    ? computeJaarruimte(
        grossYearlyIncome,
        estimateFactorAFromSalary(grossYearlyIncome, { year }),
        year,
      ).jaarruimte
    : null
  // Alleen een bereik tonen wanneer de twee grenzen daadwerkelijk uiteenlopen.
  const rangeLow = lowerBound != null && lowerBound < result.jaarruimte ? lowerBound : null

  // Lijfrente-inleg-simulator: hoeveel stort je dit jaar? Default = volledige
  // onbenutte ruimte (de optimale benutting). Slider clampt op [0, jaarruimte].
  // BIJ ONBEKENDE FACTOR A start de slider bewust op de ONDERGRENS: het scherpste
  // getal van de module voedt via `AandachtspuntActieButton` een concrete storting
  // met deadline, en te veel storten kost een niet-aftrekbare inleg. De bovengrens
  // blijft bereikbaar (slider-max), maar is niet langer de default-suggestie.
  const [inleg, setInleg] = useState<number>(rangeLow ?? result.jaarruimte)
  // Houd de inleg geclampt wanneer de jaarruimte verandert (aangroei-input).
  const clampedInleg = Math.min(Math.max(inleg, 0), result.jaarruimte)

  // Marginaal-correcte besparing: het echte Box 1-belastingverschil van de inleg
  // (schijfovergangen + heffingskorting-afbouw), niet de vlakke inleg × marginaal.
  // Eén bron: `jaarruimteBesparing` (ADR 0040/0041), gedeeld met hub + aandachts-
  // punten + AI-context. `null` alleen bij ontbrekend inkomen (dan toont de kaart
  // de empty-state en returnt hieronder al vroeg).
  const besparing =
    grossYearlyIncome > 0
      ? jaarruimteBesparing(grossYearlyIncome, clampedInleg, year)
      : null

  const freedom =
    dailyExpenses > 0 && besparing != null && besparing > 0
      ? formatFreedomTimeString(calculateFreedomTime(besparing, dailyExpenses))
      : null

  if (!result.hasData) {
    return (
      <article className="bg-[var(--paper)] border border-[var(--border-ed)] border-dashed p-5 sm:p-6">
        <Kicker>Jaarruimte {year}</Kicker>
        <p
          className="mt-2 text-sm text-[var(--ink-3)] italic leading-relaxed max-w-[52ch]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Vul je bruto-jaarinkomen aan in je profiel om je pensioen-
          aftrekruimte te berekenen.
        </p>
      </article>
    )
  }

  return (
    <article className="bg-[var(--paper)] border border-[var(--border-ed)] border-l-[3px] border-l-[var(--color-box1-700)] p-5 sm:p-6">
      <Kicker>Jaarruimte {year} · pensioen-aftrekruimte</Kicker>

      {result.jaarruimte > 0 ? (
        <>
          {/* Badge: het bedrag hieronder rust op factor A = 0 omdat er geen
              waarde is, niet omdat er geen werkgeverspensioen is (H23). */}
          {isUpperBound && (
            <p className="mt-3 inline-flex items-center gap-1.5 border border-warning/30 bg-warning-bg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-2)]">
              <AlertTriangle
                className="h-3 w-3 shrink-0"
                style={{ color: 'var(--warning)' }}
                aria-hidden="true"
              />
              Factor A niet ingevuld — bovengrens
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              className="text-[32px] sm:text-[40px] font-black leading-[0.9] tracking-[-0.03em] tabular-nums text-[var(--ink)]"
              style={{ fontFamily: PLAYFAIR }}
            >
              {rangeLow != null
                ? `${formatCurrency(rangeLow)} – ${formatCurrency(result.jaarruimte)}`
                : formatCurrency(result.jaarruimte)}
            </span>
            <span className="text-xs uppercase tracking-[0.12em] font-mono text-[var(--ink-3)] pb-1">
              onbenut
            </span>
          </div>
          <p
            className="mt-2 mb-5 text-sm italic text-[var(--ink-2)] leading-snug max-w-[52ch]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            {isUpperBound ? (
              rangeLow != null ? (
                <>
                  Je factor A is niet ingevuld, dus we weten niet hoeveel
                  pensioen je via een werkgever opbouwt. Bouw je niets op, dan is
                  je ruimte {formatCurrency(result.jaarruimte)}; bouw je volledig
                  op (
                  {(JAARRUIMTE_MIDDELLOON_OPBOUW_PCT * 100)
                    .toFixed(3)
                    .replace('.', ',')}
                  % middelloon, het fiscale maximum), dan blijft er ruwweg{' '}
                  {formatCurrency(rangeLow)} over. Vul je factor A in voor één
                  scherp bedrag.
                </>
              ) : (
                <>
                  Je factor A is niet ingevuld, dus dit is een bovengrens: er is
                  gerekend zonder aftrek voor werkgeverspensioen. Vul je factor A
                  in voor een scherper bedrag.
                </>
              )
            ) : (
              <>
                Door dit bedrag te storten in een lijfrente of bankspaar-product
                mag je het in {year} aftrekken van je Box 1-inkomen.
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              className="text-[32px] font-black leading-[0.9] tracking-[-0.03em] tabular-nums text-[var(--ink-3)]"
              style={{ fontFamily: PLAYFAIR }}
            >
              € 0
            </span>
            <span className="text-xs uppercase tracking-[0.12em] font-mono text-[var(--ink-3)] pb-1">
              onbenut
            </span>
          </div>
          <p
            className="mt-2 mb-5 text-sm italic text-[var(--ink-2)] leading-snug max-w-[52ch]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            {/* Ruimte 0 heeft twee oorzaken: de factor-A-aftrek eet de basis op,
                óf het inkomen ligt onder de franchise. Zonder factor A is de
                eerste zin aantoonbaar onwaar (H23-bijvangst, zelfde kaart). */}
            {pensioenAangroei > 0 ? (
              <>
                Je werkgever vult je pensioenaangroei volledig — er is geen extra
                ruimte voor lijfrente-aftrek dit jaar.
              </>
            ) : (
              <>
                Je inkomen ligt onder de franchise van{' '}
                {formatCurrency(result.franchise)} — daaronder bouw je in {year}{' '}
                geen jaarruimte op.
              </>
            )}
          </p>
        </>
      )}

      {/* SIMULATOR: lijfrente-inleg-slider + benutting-gauge + besparing.
          Alleen tonen wanneer er ruimte te benutten valt. Ontnest: sectie
          binnen het ene kader, gescheiden met SectionLabel + rule. */}
      {result.jaarruimte > 0 && (
        <div className="mt-5 border-t border-[var(--rule-soft)] pt-5">
          <SectionLabel>Lijfrente-simulator</SectionLabel>
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <label
              htmlFor="jaarruimte-inleg"
              className="block text-[10px] uppercase tracking-[0.12em] font-mono font-semibold text-[var(--ink-3)] mb-1.5"
            >
              Lijfrente-inleg dit jaar
            </label>
            <div className="flex items-baseline gap-2 mb-3">
              <span
                className="text-[24px] font-black tabular-nums tracking-[-0.02em] leading-none text-[var(--ink)]"
                style={{ fontFamily: PLAYFAIR }}
              >
                {formatCurrency(clampedInleg)}
              </span>
              <span className="text-[11px] text-[var(--ink-3)]">
                van {formatCurrency(result.jaarruimte)}
              </span>
            </div>
            <input
              id="jaarruimte-inleg"
              type="range"
              min={0}
              max={result.jaarruimte}
              step={Math.max(50, Math.round(result.jaarruimte / 100))}
              value={clampedInleg}
              onChange={(e) => setInleg(Number(e.target.value) || 0)}
              className="w-full accent-[var(--color-box1-500)]"
              aria-label="Lijfrente-inleg dit jaar"
            />
            {besparing != null && (
              <div className="mt-3 text-sm text-[var(--ink-2)] leading-snug">
                Belastingbesparing ≈{' '}
                <span
                  className="font-black tabular-nums text-[var(--positive)]"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  {formatCurrency(besparing)}
                </span>{' '}
                {clampedInleg > 0 && (
                  <span className="text-[var(--ink-3)] text-xs">
                    (≈ {Math.round((besparing / clampedInleg) * 100)}% effectief)
                  </span>
                )}
              </div>
            )}
            {freedom && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--ink-2)]">
                <Clock
                  className="h-4 w-4 shrink-0"
                  style={{ color: BOX1_COLOR }}
                  aria-hidden="true"
                />
                ≈ <span className="font-medium text-[var(--ink)]">{freedom}</span> aan vrijheid teruggekocht
              </div>
            )}

            {/* Zolang factor A onbekend is, is alles bóven de ondergrens
                onzeker: dat deel kan niet-aftrekbaar blijken. Expliciet
                benoemen — deze slider voedt een storting met een deadline. */}
            {rangeLow != null && clampedInleg > rangeLow && (
              <p className="mt-2 flex items-start gap-1.5 border border-warning/30 bg-warning-bg px-2.5 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0 mt-px"
                  style={{ color: 'var(--warning)' }}
                  aria-hidden="true"
                />
                <span>
                  Boven {formatCurrency(rangeLow)} weten we niet of je inleg nog
                  aftrekbaar is — dat hangt af van je factor A. Te veel storten
                  levert een niet-aftrekbare inleg op.
                </span>
              </p>
            )}

            {/* "Voeg toe als actie" — alleen wanneer er een concrete besparing is.
                Stuurt de marginaal-besparing + vrijheidsdagen door naar het
                acties-systeem (deterministisch, los van Fin). */}
            {besparing != null && besparing > 0 && (
              <div className="mt-3">
                <AandachtspuntActieButton
                  id="tax:box1-jaarruimte"
                  domain="tax"
                  // H24: de dode `description` ("Stort €X in een lijfrente…")
                  // is hier verwijderd — hij werd nooit uitgelezen. De titel
                  // blijft bewust staan: die is app-breed canoniek
                  // (lib/tax-optimizer/rank.ts#JAARRUIMTE_TITLE) en alléén hier
                  // herformuleren zou juist drift opleveren.
                  title="Benut je jaarruimte (lijfrente-inleg)"
                  savings={besparing}
                  euroImpactMonthly={Math.round((besparing / 12) * 100) / 100}
                  freedomDays={
                    dailyExpenses > 0
                      ? Math.round(besparing / dailyExpenses)
                      : 0
                  }
                  href="/overzicht/belasting/box1"
                />
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <TaxGauge
              value={clampedInleg}
              max={result.jaarruimte}
              label="benut"
              sublabel={formatCurrency(clampedInleg)}
              thresholdLabel="jaarruimte"
              colorVar={BOX1_COLOR}
            />
          </div>
          </div>
        </div>
      )}

      {/* Factor A wordt hier niet meer bewerkt — de kaart rekent met de al
          opgeslagen factor A (prop `pensioenAangroei`). Bewerken gebeurt
          uitsluitend bij de pensioen-strategie. Op de partnerkaart
          (factorAEditable=false) verwijzen we NIET naar de eigen pensioen-
          strategie: die beheert niets van de partner (privacy-guardrail). */}
      {factorAEditable ? (
        !factorAKnown ? (
          // H23: NIET "berekend met je opgeslagen factor A" — er ís geen
          // opgeslagen factor A. Deze zin sprak de "bovengrens"-uitleg boven de
          // kaart letterlijk tegen over hetzelfde bedrag.
          <p className="mt-5 border-t border-[var(--rule-soft)] pt-4 text-[11px] leading-snug text-[var(--ink-3)]">
            Berekend zónder factor A — je pensioenaangroei is nog niet ingevuld,
            dus dit is een bovengrens (elke euro factor A verlaagt de ruimte met{' '}
            {JAARRUIMTE_FACTOR_A_IMPUTATIE} euro). Vul &apos;m in bij je{' '}
            <Link
              href="/toekomst/gebeurtenissen?strategie=pensioen"
              className="font-medium text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
            >
              pensioen-strategie
            </Link>{' '}
            voor één scherp bedrag.
          </p>
        ) : (
          <p className="mt-5 border-t border-[var(--rule-soft)] pt-4 text-[11px] leading-snug text-[var(--ink-3)]">
            Berekend met je opgeslagen factor A
            {pensioenAangroei > 0 ? ` van ${formatCurrency(pensioenAangroei)}` : ''}
            {' '}(telt × {JAARRUIMTE_FACTOR_A_IMPUTATIE} mee in de aftrek). Je factor
            A beheer je bij je{' '}
            <Link
              href="/toekomst/gebeurtenissen?strategie=pensioen"
              className="font-medium text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
            >
              pensioen-strategie
            </Link>
            .
          </p>
        )
      ) : (
        <p className="mt-5 border-t border-[var(--rule-soft)] pt-4 text-[11px] leading-snug text-[var(--ink-3)]">
          Berekend zonder factor A (werkgeverspensioen) — er is voor deze persoon
          nog geen eigen pensioenaangroei-bron in TriFinity.
        </p>
      )}

      {/* S12 — de rekensom stond hier LETTERLIJK dubbel: het uitlegblok
          `JaarruimteUitleg` erboven (op /overzicht/belasting/box1, de enige
          plek waar deze kaart gebruikt wordt, in álle drie de call-sites)
          draagt dezelfde formule én dezelfde referentiewaarde-staart. Een
          beginner las de som twee keer en "Indicatie, geen advies" drie keer
          binnen één schermhoogte. Eén canonieke rekensom-plek: het uitlegblok
          (waar 'ie in Eenvoudig ook nog achter een uitklap gaat).

          De Wft-regel blijft hier WEL staan — die hoort bij het bedrag dat
          deze kaart toont en moet in beide weergavemodi zichtbaar zijn. */}
      <p
        className="mt-3 text-[12px] italic text-[var(--ink-3)] leading-snug max-w-[60ch]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Indicatie, geen advies — een schatting voor {year} op basis van je
        inkomen en je factor A. De rekensom staat in de uitleg boven deze kaart.
      </p>
    </article>
  )
}
