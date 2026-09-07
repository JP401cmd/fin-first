'use client'

/**
 * CashflowLandingCards — de hefboom-stijl kaarten op /overzicht/budget.
 * Zelfde shell als de vier-hefbomen-rij op /overzicht (gedeelde LeverageCard):
 * status-dot + KPI + uitklapbare chevron met een 1-regel inzicht en een
 * deeplink naar de bijbehorende sub-pagina.
 *
 * De kaart-data (status/KPI/detail) wordt server-side berekend in
 * `buildCashflowCards` en hier alleen gerenderd. Het icoon + de tint per
 * onderdeel zitten client-side (kunnen niet geserialiseerd worden).
 *
 * ── EENVOUDIG — HERZIEN 28 aug 2026 (S4, release R5) ────────────────────────
 * Richtingsbesluit R5: **duiding boven reductie**. Eenvoudig moet niet mínder
 * tonen maar begrijpelijker tonen. De hub deed het omgekeerde: de H1 vroeg
 * *"Hoeveel vrijheid zet je elke maand opzij?"* en Eenvoudig antwoordde met
 * drie kale navigatieknoppen — geen cijfer, geen oordeel, geen status-dot.
 *
 * Wat er nu staat, per kaart: **oordeel primair, kerngetal secundair mét
 * venster** — de `verdict`-variant van de gedeelde `LeverageCard` (kaart S1).
 * Er is geen nieuwe som en geen nieuw veld: `buildCashflowCards` levert `kpi`,
 * `subText`, `status` en `kpiWindow` al mode-onafhankelijk server-side; deze
 * call-site hield alleen op ze weg te gooien.
 *
 * Drie eerdere audit-besluiten worden hiermee bewust herzien:
 *  · **CF-1** (compacte one-liner zonder cijfer) — teruggedraaid. De one-liner
 *    was reductie zonder duiding; precies waar R5 tegenin gaat.
 *  · **CF-3-herziening van 10 aug** (venster alleen in Volledig) — vervalt met
 *    zijn eigen redenering: die luidde *"in Eenvoudig draagt de kaart geen
 *    cijfer, dus valt met het cijfer ook de reden voor het venster weg"*. Het
 *    cijfer is terug, dus het venster is terug — en nu VERPLICHT op elke kaart
 *    (zie `SIMPLE_KPI_WINDOW`). Een KPI zonder venster is exact de
 *    dubbelzinnigheid die CF-3 destijds oploste.
 *  · **CF-2** (Forecast-kaart weg, 4 → 3) — teruggedraaid op kaart S5, één stap
 *    later. Het argument van CF-2 luidde *"Forecast is geen landingsbelofte"*,
 *    maar de werkelijke schade was een KAPOTTE VERWIJSKETEN: op mobiel is deze
 *    kaart de enige contextuele ingang naar /overzicht/budget/forecast (het
 *    `Cashflow`-item in `lib/nav-config.ts` had toen geen `children`, dus de
 *    NavMenuSheet toonde de sub-pagina's niet — sinds ADR 0135 heeft het
 *    Budget-item ze wél. Sinds FC-1 (9 aug 2026) heeft die
 *    pagina bovendien een eigen Eenvoudig-vorm — een samenvattend blok met
 *    sparkline — dus de reden om er niet naartoe te wijzen verviel. Alle vier de
 *    kaarten staan er nu in béide modi.
 *
 * ── PRIVACY-MASKING (nieuw, S4) ─────────────────────────────────────────────
 * Dit pad had er GEEN. De KPI's worden server-side in `buildCashflowCards` met
 * `formatCurrency` tot strings geformatteerd, dus `MaskedAmount`/
 * `formatMaskedCurrency` (die een `number` willen) konden er niet bij — terwijl
 * de hefbomen-rij op /overzicht wél maskeert. Zolang Eenvoudig geen cijfer
 * toonde viel dat nauwelijks op; met de cijfers terug zouden ze zich óók met de
 * privacy-toggle aan laten zien, in de modus die de standaard is voor nieuwe
 * accounts. `maskCurrencyInText` (lib/format.ts) maskeert daarom hier de
 * bedragen ín de al samengestelde strings — in BEIDE modi, inclusief de
 * drill-down. Percentages, aantallen en venster-labels blijven staan: die zijn
 * geen bedrag.
 *
 * Volledig blijft verder ongewijzigd: `simple` is daar false, dus de
 * `verdict`-variant, het afwijkende raster en de CF-2-filter doen er niets.
 *
 * ── W-003 — KLEINER, MÉT HET OORDEEL (7 sep 2026) ───────────────────────────
 * Een testgebruiker vroeg de kaartjes in Eenvoudig te "minimaliseren, zoals de
 * kaartjes op de toekomst pagina". Op /toekomst staat dáár de `compact`-variant
 * (icoon + label, verder niets). Overschakelen was de voor de hand liggende
 * lezing en is bewust NIET gedaan: `compact` gooit het oordeel weg, en dat is
 * precies de reductie die het R5-richtingsbesluit hierboven verbiedt. De
 * eigenaar heeft die afweging expliciet gemaakt — **kleiner mag, het oordeel
 * blijft.**
 *
 * De wens landt daarom als MAAT en niet als variant: `<LeverageCard dense>`
 * (zie de prop-docstring daar) zet de verdict-tegel op de maatvoering van
 * `compact` — p-2 sm:p-3, chip 28/32px, label en oordeel één typetrap lager,
 * bedrag op 10px — met alle vier de regels intact. De chevron was in Eenvoudig
 * al weg (`expandable={!simple}`).
 *
 * ── W-002 — DE VIERDE TEGEL: INSTELLINGEN (7 sep 2026) ──────────────────────
 * Naast de drie gestatuste kaarten staat nu een losse INSTELLINGEN-tegel
 * (`BudgetInstellingenTile`) die naar /overzicht/budget/instellingen wijst: de
 * grondslagschattingen (inkomen/uitgaven/spaarquote) plus de keuze welke cash-
 * en spaarrekeningen in budgetteren meelopen.
 *
 * Hij is met OPZET géén `CashflowCardKey` en géén `LeverageCard`. Die union
 * voedt `cashflowCardStatuses()` — het wire-contract van
 * `GET /api/overzicht/cashflow-status` én van de sidebar-stippen. Een
 * instellingen-ingang heeft geen status en geen KPI; hem daar inhangen zou een
 * lege stip door de hele app geven. Vandaar: eigen tegel, geen status-dot, geen
 * cijfer, neutrale (niet-stoplicht, niet-module) chip-tint.
 *
 * HET RASTER BLIJFT ONGEWIJZIGD `grid-cols-2 md:grid-cols-4`. Met de vierde
 * tegel is de md-rij nu exact vol (er stonden er drie sinds `budgetSubCards`)
 * en is mobiel een schone 2×2. `grid-cols-3` — de letterlijke /toekomst-vorm —
 * is overwogen en afgevallen: dat zet de vierde tegel als wees op een eigen
 * rij, en een verdict-regel ("Goed gespaard deze maand") is op een derde van
 * een telefoonscherm een muur van tekst. De verkleining zit dus in de tegel,
 * niet in het raster.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  PiggyBank,
  ArrowLeftRight,
  Repeat,
  LineChart,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { LeverageCard } from './leverage-card'
import {
  LEVERAGE_STATUS_LABEL,
  leverageStatusBgClass,
  leverageStatusTextClass,
} from '@/lib/leverage-status'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { maskCurrencyInText } from '@/lib/format'
import { BUDGET_SUBCARD_KEYS } from '@/lib/cashflow-cards'
import type { CashflowCard, CashflowCardKey } from '@/lib/cashflow-cards'

/** Waar de instellingen-tegel naartoe wijst. Eén plek, gedeeld met de tests. */
export const BUDGET_INSTELLINGEN_HREF = '/overzicht/budget/instellingen'

const VISUAL: Record<CashflowCardKey, { Icon: LucideIcon; tint: string }> = {
  budget: { Icon: PiggyBank, tint: 'text-amber-700 bg-amber-50' },
  transacties: { Icon: ArrowLeftRight, tint: 'text-sky-700 bg-sky-50' },
  'vaste-lasten': { Icon: Repeat, tint: 'text-violet-700 bg-violet-50' },
  forecast: { Icon: LineChart, tint: 'text-emerald-700 bg-emerald-50' },
}

/**
 * ÉÉN raster voor beide weergaven. Gedeeld met de skeleton hieronder zodat
 * fallback en inhoud niet uit elkaar kunnen lopen.
 *
 * HERZIEN 28 aug 2026 (S4 + S5). Er waren twee rasters, omdat Eenvoudig één
 * kaart minder toonde (CF-2) en die kaarten one-liners waren (CF-1) die op
 * mobiel gestapeld werden. Beide redenen zijn vervallen: de kaarten dragen nu in
 * beide modi hun oordeel + cijfer, en het zijn er in beide modi vier.
 *
 * ONGEWIJZIGD BIJ W-003 + W-002 (7 sep 2026), en dat is een keuze. Sinds ADR
 * 0135 rendert deze pagina drie gestatuste kaarten (`budgetSubCards`), dus stond
 * de md-rij één tegel leeg; de instellingen-tegel vult die precies. Op mobiel is
 * het daarmee een schone 2×2 in plaats van 2 + 1. Zie de W-002-alinea in de
 * bestandskop voor waarom `grid-cols-3` (de letterlijke /toekomst-vorm) afviel.
 */
const CARD_GRID = 'grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3'

/**
 * VENSTER-LABEL PER KAART — verplicht in de `verdict`-variant (S4).
 *
 * Een KPI zonder venster is precies de dubbelzinnigheid die CF-3 oploste: "€
 * 1.240" zegt niets zolang niet vaststaat óf dat deze maand, de laatste dertig
 * dagen of per maand is. Waar `card.kpiWindow` al gevuld is (Transacties) wint
 * die: dat is de canonieke, datum-gedreven meetlat uit `lib/cashflow-cards.ts`
 * (`currentMonthWindowLabel`). Voor de overige kaarten is het venster CONSTANT
 * en datum-onafhankelijk, dus staat het hier als vaste copy — géén tweede
 * datumafleiding in de client (die zou op een maandgrens uit de pas lopen met
 * de server-render).
 *
 * `vaste-lasten` staat er bewust NIET in: die kaart krijgt `card.subText` (de
 * quote, "42% van inkomen") als meetlat onder het bedrag — zie de call-site.
 */
const SIMPLE_KPI_WINDOW: Partial<Record<CashflowCardKey, string>> = {
  budget: 'nog te besteden deze maand',
  transacties: 'deze maand',
  forecast: 'verwacht over zes maanden',
}

/**
 * Het OORDEEL en de MEETLAT per kaart in de `verdict`-variant.
 *
 * Drie van de vier kaarten dragen op `subText` al een oordeel in gewone taal
 * ("Op schema", "Tekort deze maand", "Saldo groeit") — die gaat één op één naar
 * de verdict-regel.
 *
 * `vaste-lasten` is de uitzondering: dáár is `subText` géén oordeel maar een
 * VERHOUDING ("42% van inkomen"). Dat als verdict-regel zetten zou de status
 * alleen nog via kleur dragen, en dat is precies wat de S1-regel verbiedt: *een
 * status draagt altijd een woord.* Daarom draait deze kaart om — het woord uit
 * `LEVERAGE_STATUS_LABEL` wordt het oordeel, de quote zakt naar de meetlat
 * onder het bedrag ("€ 1.056/mnd · 42% van inkomen"). Dat is dezelfde
 * woordenlijst die de vaste-lasten-detailpagina gebruikt (kaart S2), zodat
 * hub-oordeel en pagina-oordeel niet uiteen kunnen lopen.
 */
function verdictLine(card: CashflowCard): string {
  if (card.key === 'vaste-lasten' && card.subText && card.kpi) {
    return LEVERAGE_STATUS_LABEL[card.status]
  }
  return card.subText ?? LEVERAGE_STATUS_LABEL[card.status]
}

function meterLine(card: CashflowCard): string | null {
  // Geen cijfer (lege staat: nog geen budget/transacties) → ook geen meetlat.
  // De verdict-regel zegt dan zelf wat er ontbreekt ("Nog geen budget").
  if (!card.kpi) return null
  if (card.key === 'vaste-lasten') return card.subText
  // Budget: `card.kpiWindow` draagt sinds de budgetpagina-pariteit de
  // Volledig-grondslag ("van € X uitgavenbudget"). In Eenvoudig moet de vaste
  // venster-copy winnen — het cijfer is een restant, en zonder "nog te
  // besteden deze maand" is niet vast te stellen of € X het bestede of het
  // resterende deel is (CF-3/S4). Volledig toont de grondslag via `subAmount`.
  if (card.key === 'budget') return SIMPLE_KPI_WINDOW.budget ?? card.kpiWindow ?? null
  return card.kpiWindow ?? SIMPLE_KPI_WINDOW[card.key] ?? null
}

export function CashflowLandingCards({ cards }: { cards: CashflowCard[] }) {
  // Eén kaart open per keer — accordeon, identiek aan HefbomenNav.
  const [expandedKey, setExpandedKey] = useState<CashflowCardKey | null>(null)
  // In Eenvoudig: oordeel-kaarten (verdict), geen uitklap-chevron. Alle VIER de
  // kaarten staan er sinds S5 in beide modi — zie de CF-2-alinea in de kop.
  const simple = useDisplayMode().mode === 'simple'
  // Privacy-masking op de server-geformatteerde bedragstrings — zie de kop.
  const { masked } = useMaskedAmounts()

  return (
    <nav aria-label="Cashflow-onderdelen" className={CARD_GRID}>
      {cards.map((card) => {
        const { Icon, tint } = VISUAL[card.key]
        const expanded = expandedKey === card.key
        return (
          <LeverageCard
            key={card.key}
            Icon={Icon}
            tint={tint}
            label={card.label}
            kpi={maskCurrencyInText(card.kpi, masked)}
            status={card.status}
            /* Eenvoudig: het oordeel is de primaire regel (zie `verdictLine` —
               vaste lasten draait om zodat de status een WOORD houdt).
               Volledig: ongewijzigd `card.subText`. */
            subText={
              simple
                ? maskCurrencyInText(verdictLine(card), masked)
                : maskCurrencyInText(card.subText, masked)
            }
            /* Volledig houdt het CF-3-venster als `subAmount` onder de KPI;
               `verdict` rendert `subAmount` per definitie niet en krijgt zijn
               meetlat via `kpiWindow` hieronder. */
            subAmount={simple ? null : maskCurrencyInText(card.kpiWindow, masked)}
            /* VERPLICHT in Eenvoudig: elk cijfer draagt zijn venster. */
            kpiWindow={simple ? maskCurrencyInText(meterLine(card), masked) : null}
            href={card.href}
            tooltip={card.tooltip}
            variant={simple ? 'verdict' : 'full'}
            /* W-003: kleiner in Eenvoudig, mét behoud van het oordeel. */
            dense={simple}
            expandable={!simple}
            expanded={expanded}
            onToggleExpand={() => setExpandedKey(expanded ? null : card.key)}
          >
            <CashflowCardDetail card={card} masked={masked} />
          </LeverageCard>
        )
      })}
      <BudgetInstellingenTile dense={simple} />
    </nav>
  )
}

/**
 * De vierde tegel: INSTELLINGEN (W-002).
 *
 * Bewust GEEN `LeverageCard` en geen `CashflowCardKey` — zie de W-002-alinea in
 * de bestandskop. Deze tegel draagt geen status, geen status-dot en geen cijfer;
 * hij is een ingang, geen meting. De chip-tint is daarom neutraal (`--subtle` /
 * `--ink-2`) en niet een van de herkenningskleuren van de drie kaarten: die
 * dragen een onderdeel, deze draagt een handeling.
 *
 * De shell (rounded-2xl, paper-bg, ink-border, hover-lift) en de `dense`-maten
 * zijn 1-op-1 die van `LeverageCard`, zodat de tegel in dezelfde rij niet uit de
 * toon valt. Hij telt twee tekstregels waar de kaarten er drie hebben; het
 * raster rekt tegels in een rij toch al gelijk, dus dat geeft geen sprong.
 */
function BudgetInstellingenTile({ dense }: { dense: boolean }) {
  return (
    <Link
      href={BUDGET_INSTELLINGEN_HREF}
      title="Je schattingen en welke rekeningen meelopen in budgetteren."
      className={`group relative flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] transition-all hover:border-[var(--ink-3)] hover:shadow-sm ${
        dense ? 'p-2 sm:p-3' : 'p-3 sm:p-4'
      }`}
    >
      <span
        className={`${
          dense ? 'w-7 h-7 sm:w-8 sm:h-8' : 'w-8 h-8 sm:w-9 sm:h-9'
        } rounded-lg flex items-center justify-center bg-[var(--subtle)] text-[var(--ink-2)]`}
      >
        <SlidersHorizontal
          className={dense ? 'w-3.5 h-3.5 sm:w-4 sm:h-4' : 'w-4 h-4 sm:w-5 sm:h-5'}
          aria-hidden="true"
        />
      </span>
      <span
        className={`${
          dense ? 'mt-1.5 text-xs sm:text-sm' : 'mt-2 text-sm sm:text-base'
        } font-semibold text-[var(--ink)]`}
      >
        Instellingen
      </span>
      <span
        className={`mt-0.5 ${
          dense ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
        } font-medium leading-snug text-[var(--ink-2)]`}
      >
        Schattingen en rekeningen
      </span>
    </Link>
  )
}

/**
 * Suspense-skeleton voor het kaartenraster — CLIENT, omdat de vorm van de
 * fallback van de weergavemodus afhangt. Zou de fallback altijd vier hoge
 * kaarten reserveren, dan krijgt iedereen in Eenvoudig sinds CF-1/CF-2 een
 * layout-shift van vier hoge tegels naar drie one-liners; precies de CLS die de
 * gereserveerde hoogtes moesten voorkomen. De provider zit in de app-layout en
 * wordt server-side geseed, dus ook de SSR-pass van deze fallback kent de modus
 * al — geen flash.
 *
 * De hoogtes zijn NAGETELD uit `components/overview/leverage-card.tsx`, niet
 * geschat — elk blok komt overeen met de line-height van de regel die het
 * vervangt (Tailwind-defaults):
 *
 *   icon-chip    w-8 h-8 / sm:w-9 sm:h-9              → h-8 w-8 / sm:h-9 sm:w-9
 *   label        text-sm (20px) / sm:text-base (24px) → h-5 / sm:h-6
 *   kpi          text-base (24px) / sm:text-lg (28px) → h-6 / sm:h-7
 *   subAmount    text-[11px] leading-tight            → h-3
 *   substext-rij min-h-[16px]                         → h-4
 *
 * plus de kaart-padding (`p-3 sm:p-4` vol, `p-2 sm:p-3` in de `dense`-tak van
 * Eenvoudig) en dezelfde `rounded-2xl border`-shell.
 *
 * HET AANTAL KOMT UIT `BUDGET_SUBCARD_KEYS`, niet uit een hard `[0,1,2,3]`
 * (W-003, 7 sep 2026). Die literal bleef op vier staan toen ADR 0135 de
 * kaartenset op deze pagina naar drie bracht, dus reserveerde de fallback in
 * béide modi één tegel te veel — dezelfde CLS als hierboven beschreven, alleen
 * de andere kant op. Naast de drie status-tegels staat één instellingen-tegel
 * (W-002) met een eigen, kortere vorm: chip + twee tekstregels, geen cijfer.
 *
 * De KPI- én venster-regel worden bewust WÉL gereserveerd, terwijl
 * `LeverageCard` ze bij `kpi === null` / `kpiWindow === null` weglaat: dat is de
 * lege-account-staat (nog geen budget, geen transacties). Reserveren kiest de
 * veelvoorkomende kant; de lege staat krijgt één keer een krimp i.p.v.
 * iedereen-met-data een groei. Het raster rekt tegels in dezelfde rij toch al
 * gelijk, dus één venster-regel per tegel reserveren klopt ook al draagt alleen
 * de Transacties-kaart er een.
 */
export function CashflowLandingCardsSkeleton() {
  const simple = useDisplayMode().mode === 'simple'

  if (simple) {
    /* W-003 + W-002 (7 sep 2026). Twee correcties tegelijk:
       (1) HET AANTAL. Hier stond hard `[0, 1, 2, 3]` — vier gestatuste tegels —
           terwijl de budgetpagina er sinds ADR 0135 nog maar DRIE rendert
           (`budgetSubCards`). De fallback reserveerde dus één tegel te veel, in
           béide modi: precies de layout-sprong die hij hoort te voorkomen, alleen
           de andere kant op. Het aantal komt nu uit `BUDGET_SUBCARD_KEYS` zelf,
           zodat het niet opnieuw kan wegdrijven van de kaartenset.
       (2) DE MATEN. De echte tegels draaien in Eenvoudig sinds W-003 op
           `dense` (p-2 sm:p-3, chip 28/32px, label + oordeel één typetrap
           lager, bedrag op 10px). Hoogtes hieronder zijn dáárop nageteld —
           text-xs (16px) → h-4, sm:text-sm (20px) → h-5, text-[10px]
           leading-tight → h-3.
       De instellingen-tegel krijgt zijn eigen, kortere vorm (chip + twee
       tekstregels, géén cijferregel): hij heeft geen status en geen KPI. */
    /* HERZIEN 28 aug 2026 (S4 + S5), nog steeds geldend: de tegel is geen
       one-liner meer maar een verdict-kaart — icon-chip, label, oordeel-regel én
       de bedrag+venster-regel. De bedrag-regel wordt bewust gereserveerd hoewel
       `LeverageCard` 'm bij `kpi === null` weglaat: dat is de lege-account-staat,
       en reserveren kiest de veelvoorkomende kant. */
    return (
      <div className={`${CARD_GRID} animate-pulse`}>
        {BUDGET_SUBCARD_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-2 sm:p-3"
          >
            <div className="h-7 w-7 rounded-lg bg-[var(--subtle)] sm:h-8 sm:w-8" />
            <div className="mt-1.5 h-4 w-16 bg-[var(--subtle)] sm:h-5" />
            <div className="mt-0.5 h-4 w-24 bg-[var(--subtle)] sm:h-5" />
            <div className="mt-0.5 h-3 w-28 bg-[var(--subtle)]" />
          </div>
        ))}
        <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-2 sm:p-3">
          <div className="h-7 w-7 rounded-lg bg-[var(--subtle)] sm:h-8 sm:w-8" />
          <div className="mt-1.5 h-4 w-20 bg-[var(--subtle)] sm:h-5" />
          <div className="mt-0.5 h-4 w-28 bg-[var(--subtle)] sm:h-5" />
        </div>
      </div>
    )
  }

  return (
    <div className={`${CARD_GRID} animate-pulse`}>
      {BUDGET_SUBCARD_KEYS.map((key) => (
        <div
          key={key}
          className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4"
        >
          <div className="h-8 w-8 rounded-lg bg-[var(--subtle)] sm:h-9 sm:w-9" />
          <div className="mt-2 h-5 w-20 bg-[var(--subtle)] sm:h-6" />
          <div className="mt-0.5 h-6 w-24 bg-[var(--subtle)] sm:h-7" />
          <div className="mt-0.5 h-3 w-28 bg-[var(--subtle)]" />
          <div className="mt-1 h-4 w-16 bg-[var(--subtle)]" />
        </div>
      ))}
      {/* Instellingen — chip + twee tekstregels, géén cijfer- of oordeelregel. */}
      <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4">
        <div className="h-8 w-8 rounded-lg bg-[var(--subtle)] sm:h-9 sm:w-9" />
        <div className="mt-2 h-5 w-20 bg-[var(--subtle)] sm:h-6" />
        <div className="mt-0.5 h-5 w-28 bg-[var(--subtle)] sm:h-6" />
      </div>
    </div>
  )
}

/**
 * Uitklap-detail per kaart — zelfde opmaak als HefboomDetailCard: status-
 * getinte achtergrond, secundaire waarde rechtsboven, 1-regel inzicht en een
 * deeplink naar de sub-pagina.
 */
function CashflowCardDetail({ card, masked }: { card: CashflowCard; masked: boolean }) {
  return (
    <div
      className={`mt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 border-t border-[var(--border-ed)] ${leverageStatusBgClass(card.status)}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
          {card.detail.label}
        </span>
        <span className={`text-[11px] font-mono tabular-nums font-semibold ${leverageStatusTextClass(card.status)}`}>
          {maskCurrencyInText(card.detail.value, masked)}
        </span>
      </div>
      <p className={`text-xs leading-snug ${leverageStatusTextClass(card.status)}`}>
        {maskCurrencyInText(card.detail.tip, masked)}
      </p>
      <Link
        href={card.href}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
      >
        {card.detail.actionLabel}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  )
}
