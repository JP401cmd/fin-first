import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { calculateWorkTime, formatWorkTimeString } from '@/lib/work-time'
import type { TaxOverviewResult } from '@/lib/tax-overview'
import { Kicker, HighlightMark } from '@/components/editorial'
import { SwapInSimple } from '@/components/app/swap-in-simple'
import { MaskedAmount } from '@/components/app/masked-amount'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/**
 * HubTotaleDruk (C1) — editorial hero-cijfer met de totale belastingdruk over
 * de boxen.
 *
 * Het jaartotaal (Box 1 + Box 3 [+ Box 2 indien bekend]) krijgt het
 * Playfair-hero-formaat met de vrijheidstijd-subregel eronder ("Geld is
 * opgeslagen tijd": elk €-bedrag > €100 krijgt zijn vrijheidstijd-equivalent).
 * Daaronder effectief- en marginaal-tarief als mono-data.
 *
 * Bewust presentationeel/server-compatible: de hub-pagina rekent het overzicht
 * server-side uit (`buildTaxOverview`) en levert een kant-en-klaar resultaat +
 * dag-uitgaven (voor de vrijheidstijd) aan.
 *
 * De perspectief-annotatie (Box 1 per persoon, Box 3 volgens weergave,
 * "indicatie, geen advies") staat één niveau hoger, op de hub-pagina zelf, als
 * gedeelde `ScenarioCallout` onder de druk-sectie. `box3PerspectiveAware`
 * draagt hier daarom geen eigen UI — die prop blijft in de signatuur voor
 * bron-compat.
 *
 * ── WAT ER NIET IN ZIT, STAAT BIJ HET GETAL (bevinding H22, 26-08-2026) ─────
 * `exclBox2` heeft wél weer eigen UI. Het totaal heet "totale druk" maar telt
 * Box 2 bewust niet mee (BEL-1: de hub rekent aanmerkelijk belang niet door;
 * de box2-subpagina doet dat). Die weglating stond alleen in de callout ónder
 * de verdeelstaaf — voor een DGA viel daarmee de duurste post buiten het
 * hoofdgetal zonder dat het hoofdgetal dat zei. Een totaal dat een bekend
 * bestanddeel weglaat, moet die weglating tónen: vandaar de "excl. Box 2"-tag
 * naast het bedrag én de regel eronder die naar de Box 2-pagina wijst. Dit
 * verandert het bedrag niet — alleen wat de kaart erover zegt.
 *
 * ── DRIE GETALLEN, TWEE GRONDSLAGEN (bevinding C9, 26-08-2026) ──────────────
 * Op deze kaart staan bewust twee verschillende grondslagen naast elkaar:
 *  · het hero-bedrag én de werktijd-/vrijheidsregel gaan over de HELE rekening
 *    (Box 1 + Box 3 [+ Box 2]) — dat is één bedrag dat de gebruiker betaalt;
 *  · de twee TARIEVEN gaan uitsluitend over INKOMEN (Box 1-heffing / bruto Box
 *    1-inkomen resp. de volgende euro), rechtstreeks uit `computeBox1Tax`.
 * Vóór C9 erfde "Effectief" de menging (Box 3-vermogensheffing in de teller,
 * Box 1-inkomen in de noemer) en kwam daardoor bóven het marginale tarief uit —
 * onmogelijk in een progressief stelsel. De tarieven dragen daarom nu een
 * expliciete grondslag-onderregel, zodat ze niet als "de hele rekening gedeeld
 * door mijn inkomen" gelezen worden. Reken hier niets na: beide percentages
 * komen kant-en-klaar binnen via `buildTaxOverview`.
 */
export function HubTotaleDruk({
  overview,
  dailyExpenses,
  dailyIncome = 0,
  incomeKnown,
  exclBox2 = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  box3PerspectiveAware: _box3PerspectiveAware,
}: {
  overview: TaxOverviewResult
  /** Dag-uitgaven voor de vrijheidstijd-omrekening (terugval-regel). */
  dailyExpenses: number
  /**
   * CANONIEK bruto dagelijks inkomen (€/dag) uit `lib/income-rate.ts` — de
   * noemer van de werktijd-claim. 0 = geen werkjaar-basis bekend.
   */
  dailyIncome?: number
  /**
   * Is er een bruto Box 1-inkomen bekend (`grossYearly > 0`)? BEWUST VERPLICHT
   * (bevinding M4): zonder inkomen toont deze kaart "Inkomen onbekend" i.p.v.
   * een percentage. Vóór C9/M4 stond hier een vuistregel-tarief (35,8%) náást
   * een Box 1-kaart die op hetzelfde scherm "Inkomen onbekend" meldde.
   */
  incomeKnown: boolean
  /**
   * Box 2 is relevant (aanmerkelijk belang) maar zit NIET in `overview.total`.
   * True → de kaart toont de weglating bij het bedrag zelf en verwijst door
   * naar de Box 2-pagina (bevinding H22).
   */
  exclBox2?: boolean
  /** Box 3 weerspiegelt het huishoud-/partner-perspectief → eerlijkheidsregel (nu op hub-niveau). */
  box3PerspectiveAware?: boolean
}) {
  const { total, effectiveRate, marginalRate } = overview

  // WERKTIJD (ADR 0105) — "opgeofferd aan belasting" is werkjaar-taal, dus deelt
  // deze regel op het BRUTO DAGELIJKS INKOMEN, niet op het uitgaven-dagtarief.
  // Met het oude uitgaven-dagtarief was dit getal een uitgaven-AANDEEL met
  // werktijd-taal eromheen: het telde niet op tot het werkjaar dat de zin belooft
  // en stond bovendien naast een inkomen-relatief effectief tarief op dezelfde
  // kaart.
  //
  // LET OP — grondslag: deze regel deelt de HELE rekening (`total`, incl. Box 3)
  // op het bruto inkomen; het "Effectief"-percentage hieronder deelt alleen de
  // Box 1-heffing. `monthsPerYear` is dus NIET meer effectiveRate × 12 (dat was
  // het toen effectiveRate zelf nog total/inkomen was — precies de mismatch die
  // C9 opheft). Beide zijn juist binnen hun eigen framing: "welk deel van je
  // werkjaar gaat op aan de belastingrekening" vs. "welk tarief betaal je over
  // je inkomen". Het label onder het percentage draagt die grondslag.
  const workTime = calculateWorkTime(total, dailyIncome)
  const workTimeStr = formatWorkTimeString(workTime)
  const showWorkTime = total > 100 && workTime.hasBasis && workTime.monthsPerYear > 0

  // TERUGVAL zonder werkjaar-basis (bruto inkomen onbekend): geen werktijd-claim
  // verzinnen, maar de app-brede VRIJHEIDSTIJD-formulering — dezelfde die
  // box1-hero en box3-heffingsvrij al voeren ("kost je ≈ X aan vrijheid").
  // Uitgaven-semantiek met uitgaven-taal; die twee horen bij elkaar.
  const freedom = calculateFreedomTime(total, dailyExpenses)
  const freedomStr = formatFreedomTimeString(freedom)
  const showFreedom =
    !showWorkTime && total > 100 && (freedom.totalDays > 0 || freedom.isInfinite)

  const effPct = effectiveRate != null ? Math.round(effectiveRate * 1000) / 10 : null
  const margPct = marginalRate != null ? Math.round(marginalRate * 1000) / 10 : null

  return (
    <article className="bg-[var(--paper)] p-5 sm:p-6 flex flex-col">
      <Kicker>Totale druk · {new Date().getFullYear()}</Kicker>

      {/* Hero-cijfer in Playfair — papier-zwaar, tabular-nums. Op de hub is dit
          de gouden "universele uitkomst": HighlightMark zet er de gouden marker
          onder (--module-active-200 is hier de hub-highlight, niet box-codering). */}
      <div className="mt-4 flex items-baseline gap-3 flex-wrap">
        <HighlightMark>
          {/* PRIVACY (ADR 0091). Katern I was het laatste hub-blok dat de
              privacymodus negeerde: het hero-bedrag stond onder het oog-icoon
              gewoon in beeld terwijl de kansen-kaart ernaast al maskeerde.
              Oorzaak was structureel — dit is een server-component en kan
              `useMaskedAmounts()` niet lezen. `MaskedAmount` is de client-child
              die dat oplost zónder deze kaart client te maken (zelfde route als
              `HubKansen`, alleen dan zonder de conversie).
              `monoWhenVisible={false}`: de Playfair-hero houdt zijn eigen font;
              de bullets schakelen zelf naar mono. */}
          <span style={{ fontFamily: PLAYFAIR }}>
            <MaskedAmount
              value={Math.round(total)}
              tone="ink"
              monoWhenVisible={false}
              className="font-black leading-[0.9] tracking-[-0.03em] text-[40px] sm:text-[52px] text-[var(--ink)]"
            />
          </span>
        </HighlightMark>
        <span
          className="italic text-sm text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          per jaar
        </span>
        {/* H22 — de weglating hoort bij het getal, niet alleen in een voetnoot
            onder de vouw. Neutrale ink-tag: dit is een grondslag-aantekening,
            geen status en geen box-codering. */}
        {exclBox2 && (
          <span className="rounded-full border border-[var(--rule-soft)] bg-[var(--subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
            excl. Box 2
          </span>
        )}
      </div>

      {/* Tijd-subregel — verplicht bij elk groot bedrag. Werktijd zodra het
          werkjaar bekend is, anders de vrijheidstijd-formulering. */}
      {showWorkTime && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
          <span>
            Je werkt ≈ {workTimeStr} van je jaar voor de belasting
            {workTime.exceedsWorkYear ? ' — meer dan een heel werkjaar' : ''}
          </span>
        </div>
      )}
      {showFreedom && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
          <span>
            Kost je ≈ {freedom.isInfinite ? '∞ vrijheid' : `${freedomStr} vrijheid`} per jaar
          </span>
        </div>
      )}

      {/* H22 — wat buiten het totaal valt, benoemen én aanwijzen. Direct onder
          het hoofdgetal, met de weg ernaartoe; de "indicatie, geen advies"-
          callout onder de sectie herhaalt het als voetnoot. */}
      {exclBox2 && (
        <p className="mt-2.5 text-xs leading-snug text-[var(--ink-2)]">
          Box 2 (aanmerkelijk belang) zit hier niet in — die rekening staat apart.{' '}
          <Link
            href="/overzicht/belasting/box2"
            className="group inline-flex items-center gap-1 font-medium text-[var(--ink)] underline decoration-[var(--rule-soft)] underline-offset-2 hover:decoration-[var(--ink)]"
          >
            Bekijk Box 2
            <ArrowRight
              className="h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </p>
      )}

      {/* De twee inkomens-tarieven — of, zonder bekend inkomen, de eerlijke
          mededeling dat ze er niet zijn. Nooit allebei tegelijk: `incomeKnown`
          is dezelfde poort (`grossYearly > 0`) waarmee de loader de tarieven
          berekent, dus een percentage zónder inkomen kan niet ontstaan.

          S14 — in Eenvoudig staat hier ÉÉN beslisbare zin i.p.v. twee
          expert-cellen naast elkaar. Volledig rendert exact de boom die er
          altijd stond: nul regressie voor wie beide tarieven wil zien. */}
      <SwapInSimple
        simple={<DrukZin incomeKnown={incomeKnown} marginalRate={marginalRate} />}
      >
      {incomeKnown && (effPct != null || margPct != null) && (
        <div className="mt-auto pt-5 flex items-start gap-8 text-xs">
          {effPct != null && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
                Effectief
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-[var(--ink)]">
                {effPct}%
              </div>
              <div className="mt-0.5 text-[11px] leading-tight text-[var(--ink-3)]">
                Box 1 · over je inkomen
              </div>
            </div>
          )}
          {margPct != null && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
                Marginaal
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-[var(--ink)]">
                {margPct}%
              </div>
              <div className="mt-0.5 text-[11px] leading-tight text-[var(--ink-3)]">
                op je laatste euro
              </div>
            </div>
          )}
        </div>
      )}
      {!incomeKnown && (
        <div className="mt-auto pt-5 text-xs">
          <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
            Tarieven
          </div>
          <div className="mt-1 text-sm font-medium text-[var(--ink-2)]">Inkomen onbekend</div>
          <div className="mt-0.5 text-[11px] leading-tight text-[var(--ink-3)] max-w-[42ch]">
            Vul je bruto jaarinkomen in — dan tonen we je effectieve en marginale tarief.
          </div>
        </div>
      )}
      </SwapInSimple>
    </article>
  )
}

/**
 * DrukZin (S14) — de Eenvoudig-variant van de twee tariefcellen.
 *
 * "Effectief 46,0% · Marginaal 56,0%" naast elkaar is expert-informatie: het
 * vraagt van de lezer dat hij wéét welk van de twee getallen zijn volgende
 * keuze stuurt. De zin zegt hetzelfde in beslisbare taal — hoeveel houd je over
 * van een euro extra — en is daarmee duiding in plaats van reductie.
 *
 * CONSUME, DON'T RECOMPUTE. `marginalRate` komt kant-en-klaar uit
 * `buildTaxOverview` (bron: `computeBox1Tax().marginalRate`, bevinding C9).
 * `Math.round((1 − marginalRate) * 100)` is een pure WEERGAVE-complement van
 * dat ene canonieke getal — dezelfde klasse als het bestaande
 * `Math.round(effectiveRate * 1000) / 10` hierboven. Wat hier verboden is:
 * `deriveMarginaalTarief()` aanroepen (dat is een netto→bruto-vuistregel die
 * altijd één van twee vaste schijftarieven teruggeeft, géén user-facing
 * tarief), een eigen schijf-/afbouwpercentage neerzetten, of een eigen
 * marginale som maken. De bron-test in `hub-totale-druk.test.tsx` bewaakt dat.
 *
 * NULL-PAD (verplicht). `incomeKnown` is dezelfde poort waarmee de loader de
 * tarieven berekent. Zonder inkomen — of zonder marginaal tarief — komt er
 * géén zin en géén "0 cent", maar de invulprompt. Vóór C9/M4 rendeerde de
 * marginaal-cel zelfs náást een Box 1-kaart die "Inkomen onbekend" meldde;
 * die val mag met een gewone-taalzin zeker niet terugkomen.
 *
 * WFT: beschrijvend ("houd je over"), nooit imperatief ("stort dus in…"), en
 * "ongeveer" blijft staan — de bruto-grondslag onder dit percentage is een
 * schijfinversie-schatting. De "indicatie, geen advies"-callout onder de
 * sectie blijft de voetnoot.
 */
function DrukZin({
  incomeKnown,
  marginalRate,
}: {
  incomeKnown: boolean
  marginalRate: number | null
}) {
  const centenOver =
    marginalRate != null ? Math.min(100, Math.max(0, Math.round((1 - marginalRate) * 100))) : null

  return (
    <div className="mt-auto pt-5 text-xs">
      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
        Je volgende euro
      </div>
      {incomeKnown && centenOver != null ? (
        <>
          <p className="mt-1 text-sm leading-snug text-[var(--ink)] max-w-[46ch]">
            Van elke euro die je extra verdient, houd je ongeveer{' '}
            <span className="font-semibold tabular-nums">{centenOver} cent</span> over.
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-[var(--ink-3)]">
            De rest gaat naar belasting en de afbouw van je kortingen.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm font-medium leading-snug text-[var(--ink-2)]">
            Inkomen onbekend
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-[var(--ink-3)] max-w-[46ch]">
            Vul je bruto jaarinkomen in — dan zie je wat een euro extra je oplevert.
          </p>
        </>
      )}
    </div>
  )
}
