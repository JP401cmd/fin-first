/**
 * rondleiding/steps — het stap-model én ALLE copy van de rondleiding op
 * /overzicht (ADR 0130, fase 3b).
 *
 * ══ Waarom een pure module ═══════════════════════════════════════════════
 *
 * De teksten zijn het product hier, niet de bijvangst: Fin spreekt ze uit, ze
 * passeren de `compliance-check`-poort en ze moeten binnen een woordbudget
 * blijven. Als ze in de kaart-component stonden, zou elke toets een render
 * vragen en zou de Wft-lint alleen een DOM kunnen lezen. Nu staan ze in één
 * puur bestand met één ingang (`resolveRondleidingStappen`), en pint
 * `steps.test.ts` het budget, de vorm en de verboden woorden rechtstreeks.
 *
 * ══ De regels die deze module vastlegt ═══════════════════════════════════
 *
 *  1. **Fin spreekt, in de ik-vorm en jij/je.** Geen "de app toont", geen
 *     "u". Merkstem: `lib/ai/dna/base.ts` (== TOON == / == FRAMING ==).
 *  2. **Maximaal `RONDLEIDING_MAX_WOORDEN` woorden per body**, op VOLLE én op
 *     LEGE data. Drie regels, één payoff per stap: cijfer · oordeel · wat kun
 *     je hier. Wie tien alinea's schrijft, verliest de aandacht die de
 *     rondleiding juist moet vasthouden.
 *  3. **Elk significant bedrag draagt zijn vrijheidstijd** — via
 *     `formatWithFreedom` uit lib/format.ts, nooit een eigen dag/jaar-som.
 *     Onder `VRIJHEIDSTIJD_DREMPEL_EUR`, zonder dagtarief of in privacymodus:
 *     geen tijd (en in privacymodus ook geen bedrag).
 *  4. **Wft — inzicht, geen advies.** Elke zin is een CONSTATERING over de
 *     eigen cijfers plus een beschrijving van wat er op de pagina achter zit.
 *     Geen imperatief over geld, geen besparings- of rendementsbelofte; de
 *     belastingstap zegt met zoveel woorden "een indicatie, geen advies".
 *  5. **Consume, don't recompute.** Het oordeelwoord komt uit
 *     `hefboomVerdict` (zodat de kaart zegt wat de tegel zegt), de
 *     vrijheidsleeftijd-zin uit `buildVrijheidsleeftijdZin` (variant 'kaart')
 *     en de spreidingsdrempel uit `ASSET_CONCENTRATION_HIGH_PCT`. Deze module
 *     LEEST en FORMATTEERT; ze rekent niets uit.
 *  6. **Elk vrijheidsgetal draagt zijn GRONDSLAG** (UR3-04, eigenaarsbesluiten
 *     K3 en K4). Een rondleiding die binnen twee minuten drie verschillende
 *     "vrijheidsgetallen" toont, leert de gebruiker dat het cijfer niets
 *     betekent. Twee harde regels:
 *       • **K3** — een BRUTO bedrag (bezittingen, dus vóór schulden) krijgt
 *         GEEN tijdvertaling. Ook mét markering blijft "€ 368.270 = 14 jaar
 *         vrijheid" misleidend: een deel van die euro's is van de bank.
 *         `formatWithFreedom` staat daarom niet op `totals.bezittingen`.
 *       • **K4** — het netto vermogen op de welkom- en de grafiekkaart draagt
 *         zijn woon-grondslag als markering achter het bedrag
 *         (`HOUSING_BASIS_LABEL` uit lib/housing-choice.ts — één huis voor die
 *         woorden, ook de onboarding leest daaruit). Sluit de gebruiker zijn
 *         woning uit van FIRE, dan RÉKENT de kaart bovendien op
 *         `netWorthExclHome`, dezelfde grondslag die /toekomst dan aanhoudt
 *         (ADR 0034 + ADR 0114). De keuze én beide bedragen komen kant-en-klaar
 *         uit de loader via `data.woning`; deze module leidt niets af.
 */

import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { HOUSING_BASIS_LABEL } from '@/lib/housing-choice'
import { ASSET_CONCENTRATION_HIGH_PCT } from '@/lib/financial-health'
import { hefboomVerdict } from '@/lib/hefboom-status-copy'
import { buildVrijheidsleeftijdZin } from '@/lib/horizon/vrijheidsleeftijd-zin'
// Bewust `anker-copy` en niet het `@deprecated` `nu-stoppen-copy` (ADR 0129 F4
// verwijdert dat bestand; de aliassen daar wijzen al hierheen).
import { ANKER_KPI_LABEL, type AnkerReach, type AnkerStop } from '@/lib/horizon/anker-copy'
import type { Hefboom } from '@/lib/hefboom-config'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { FreedomFraming } from '@/lib/fire-strategy'

// ── Budget & drempels ───────────────────────────────────────────────────────

/**
 * Woordbudget per stap-body. Bewust ruim onder wat een alinea zou zijn: drie à
 * vier regels op een kaart van 22rem. `steps.test.ts` toetst 'm op volle én
 * lege data, want juist de lege staat groeit ongemerkt (uitleg vervangt cijfer).
 *
 * 35 → 42 (sep 2026): de grafiekkaart draagt sinds deze wijziging óók de twee
 * klikzones van de grafiek, en die pasten niet naast de grondslag-markering én
 * de canonieke vrijheidszin — de duurste variant (pensioen + "zonder je huis")
 * komt op 40. Bewust niet ruimer: 42 laat precies twee woorden speling, geen
 * ruimte voor een vijfde gedachte.
 */
export const RONDLEIDING_MAX_WOORDEN = 42

/**
 * Vanaf welk bedrag de vrijheidstijd erbij hoort. Spiegelt de
 * app-brede regel "elk bedrag van betekenis toont ook zijn vrijheidstijd";
 * onder deze grens is de tijd ruis (een paar dagen) en kost hij alleen woorden.
 */
const VRIJHEIDSTIJD_DREMPEL_EUR = 100

/**
 * Telt woorden zoals de toets ze telt: op witruimte splitsen en alles zonder
 * letter of cijfer weggooien. Zo tellen het losse euroteken (`Intl` zet er een
 * harde spatie achter) en een kale gedachtestreep niet mee — die dragen geen
 * leestijd. Geëxporteerd zodat de test exact deze definitie gebruikt en het
 * budget niet stilletjes ruimer of krapper wordt door een andere telling.
 */
export function telWoorden(tekst: string): number {
  return tekst
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Welk apparaat de rondleiding draait. Bepaalt welke stappen bestaan: op
 * mobiel bundelen zoeken, menu en Fin zich in één element (de nav-pill), dus
 * daar vervangt één stap de twee desktop-stappen.
 */
export type RondleidingPlatform = 'desktop' | 'mobiel'

/** De drie hoofdstukken die de voortgangsstippen dragen. */
export type RondleidingHoofdstuk = 'hefbomen' | 'stand' | 'gereedschap'

export type RondleidingStapId =
  | 'welkom'
  | 'hefboom-bezittingen'
  | 'hefboom-schulden'
  | 'hefboom-cashflow'
  | 'hefboom-belasting'
  | 'gezondheid'
  | 'grafiek'
  | 'briefing'
  | 'zijbalk'
  | 'fin'
  | 'pill'

/** Leesbare naam per hoofdstuk — de kicker boven de kaarttitel. */
export const RONDLEIDING_HOOFDSTUK_LABEL: Record<RondleidingHoofdstuk, string> = {
  hefbomen: 'Je vier hefbomen',
  stand: 'Je stand',
  gereedschap: 'Je gereedschap',
}

/** Kicker voor een stap zonder hoofdstuk (alleen het welkom). */
export const RONDLEIDING_KICKER_DEFAULT = 'Rondleiding'

/**
 * De gegevens die de rondleiding leest. Alles komt uit wat /overzicht toch al
 * laadt (`loadHorizonData` in blok 1, `resolveFreedomAgeView` in blok 2) —
 * geen extra query, geen herberekening.
 */
export interface RondleidingData {
  /** Voornaam uit het profiel; ontbreekt vaak, dan groet Fin zonder naam. */
  userName: string | null
  /** Totalen per hefboom — identiek aan wat de tegels tonen (`HefbomenTotals`). */
  totals: {
    bezittingen: number | null
    schulden: number | null
    /** Spaarquote als percentage (0–100), niet als bedrag. */
    cashflow: number | null
    /** Box 3-heffing per jaar. `null` = nog niet te bepalen. */
    belasting: number | null
  } | null
  /** Dubbele grondslag incl./excl. eigen woning; `null` = geen splitsing. */
  housingSplit: { eigenHuisValue: number; mortgageBalance: number } | null
  /** De stoplichtstatus per hefboom — dezelfde bron als de tegel (lever-scores). */
  leverStatus: Record<Hefboom, LeverageStatus>
  /** Aantal verschillende `asset_type`s; voedt het spreidingszinnetje. */
  assetTypeCount: number | null
  /** Grootste asset_type als FRACTIE (0–1) van het vermogen excl. eigen woning. */
  largestAssetTypeShare: number | null
  /**
   * Gezondheidsscore + label ("Sterk"), uit `horizonData.healthScore`.
   * `onbekendHint` (ADR 0131) = de zin uit `healthScore.onbekend.hint` zodra
   * inkomen/uitgaven ontbreken: dan noemt de stap géén cijfer en géén oordeel.
   */
  health: { total: number; label: string; onbekendHint?: string | null } | null
  /** Netto vermogen nu (bezittingen − schulden), perspectief-correct. INCL. woning. */
  currentNetWorth: number
  /**
   * De eigen woning als GRONDSLAG voor het netto vermogen (K4). `null` = geen
   * eigen woning, en dan valt er niets te markeren: "mét je huis" achter een
   * bedrag van iemand die huurt, is onzin.
   *
   * De velden komen kant-en-klaar uit `loadHorizonData`
   * (`freedomBasis.homeExcludedFromFire` en `netWorthExclHome`) — deze module
   * roept `isHomeExcludedFromFire` of `netWorthExcludingHome` NIET zelf aan en
   * trekt nooit zelf een overwaarde van een bedrag af.
   */
  woning: {
    /**
     * Woonstrategie `exclude_from_fire` ("hij telt niet mee"). Dan rekenen de
     * welkom- en grafiekkaart op `netWorthExclHome`, precies zoals /toekomst.
     */
    uitgesloten: boolean
    /**
     * Netto vermogen ZONDER de overwaarde — canoniek uit
     * `netWorthExcludingHome`. Een aparte WEERGAVE-grondslag: níét de
     * FIRE-pot (`fireEligibleNetWorth`) en níét te mengen met
     * `currentNetWorth` op één as of marker.
     */
    netWorthExclHome: number
  } | null
  /** Dagtarief uitgaven — de noemer van élke €→vrijheidstijd-vertaling. */
  dailyExpenseRate: number
  /** Toont de pagina een pensioen-/AOW-leeftijd i.p.v. een FIRE-leeftijd? */
  isPensioen: boolean
  /**
   * Vrijheidsleeftijd-seed uit blok 2 (`<RondleidingDataSeed>`). Ontbreekt
   * zolang het gestreamde blok nog niet binnen is — de grafiekstap laat de zin
   * dan weg in plaats van "vrijheid nog niet in zicht" te flitsen.
   */
  vrijheid: {
    fireAgeDisplay: number | null
    framing: FreedomFraming
    dataIssue: boolean
    /**
     * ADR 0129 — het BEREIK onder een vast stop-anker (aow/now/age). Niet
     * langer alleen het nu-anker: wie een vaste eindleeftijd kiest heeft geen
     * vrijheidsMOMENT om aan te kondigen, want dat moment ligt al vast. "Werken
     * wordt een keuze rond je 51e" is daar geen duiding maar een belofte die
     * het getal niet draagt — het vermogen kan vóór die leeftijd op zijn.
     * Consume-only: `ankerReachFromRunway` uit dezelfde kernel-run als
     * /toekomst, `null` onder een opbouwpad zonder vast anker.
     */
    ankerReach: AnkerReach | null
    /** Het stopmoment bij dat bereik (`ankerStopFromSim`) — "nu" of "op 62". */
    ankerStop: AnkerStop | null
  } | null
}

export interface RondleidingBodyContext {
  platform: RondleidingPlatform
  /** Privacymodus: geen bedragen, en dus ook geen vrijheidstijd. */
  masked: boolean
}

export interface RondleidingStapBody {
  /** De volledige body als één string. Max `RONDLEIDING_MAX_WOORDEN` woorden. */
  tekst: string
  /**
   * Optionele kicker BOVEN de hoofdstuk-naam — vandaag alleen "Reikt tot" onder
   * een vast stop-anker, waar de grafiek geen vrijheidsMOMENT toont maar een
   * bereik (ADR 0127/0129).
   */
  kicker?: string
}

export interface RondleidingStap {
  id: RondleidingStapId
  hoofdstuk?: RondleidingHoofdstuk
  /** De `<h3>` op de kaart. */
  titel: string
  /**
   * CSS-selector van het uit te lichten element, per platform. `null` = geen
   * spotlight (het welkom vult één vol scrim-paneel).
   */
  target: { desktop?: string; mobiel?: string } | null
  body: (data: RondleidingData, ctx: RondleidingBodyContext) => RondleidingStapBody
  /**
   * Mag ontbreken zonder dat er iets kapot is — een shell-element dat door een
   * open chat, een smal venster of een andere weergave weg kan zijn. De
   * spotlight slaat zo'n stap over als het element na de zoekdeadline niet
   * bestaat, in plaats van naar een leeg vlak te wijzen.
   */
  optioneel?: boolean
}

// ── Knop-copy (één huis, zodat de kaart geen tekst uitvindt) ────────────────

export const RONDLEIDING_KNOP = {
  start: 'Laat maar zien',
  vorige: 'Vorige',
  volgende: 'Volgende',
  overslaan: 'Sla over',
  /** Laatste stap, primair: opent de gidsweergave in Fin. */
  eersteStap: 'Begin met je eerste stap',
  /** Laatste stap, secundair: sluit de rondleiding zonder de gids te openen. */
  rondkijken: 'Zelf rondkijken',
} as const

// ── Formatteer-hulpjes (lezen en formatteren, nooit rekenen) ────────────────

/** Het bedrag, of `null` in privacymodus (dan noemt de zin geen euro's). */
function euro(bedrag: number | null | undefined, ctx: RondleidingBodyContext): string | null {
  if (ctx.masked) return null
  if (bedrag == null || !Number.isFinite(bedrag)) return null
  return formatCurrency(bedrag)
}

/**
 * De vrijheidstijd bij een bedrag — canoniek via `formatWithFreedom`, nooit een
 * eigen dag/jaar-conversie. `null` zodra de vertaling niets zou betekenen:
 * privacymodus, geen dagtarief, of een bedrag onder de drempel.
 */
function vrijheidstijd(
  bedrag: number | null | undefined,
  data: RondleidingData,
  ctx: RondleidingBodyContext,
): string | null {
  if (ctx.masked) return null
  if (bedrag == null || !Number.isFinite(bedrag)) return null
  if (Math.abs(bedrag) <= VRIJHEIDSTIJD_DREMPEL_EUR) return null
  if (!(data.dailyExpenseRate > 0)) return null
  return formatWithFreedom(bedrag, data.dailyExpenseRate, { includeCurrency: false })
}

/** Plakt niet-lege zinsdelen aan elkaar tot één body. */
function zinnen(...delen: (string | null | undefined)[]): string {
  return delen.filter((d): d is string => Boolean(d && d.trim())).join(' ')
}

/** Het oordeel van de tegel, met een kleine letter zodat het in een zin past. */
function oordeel(key: Hefboom, data: RondleidingData): string | null {
  const woord = hefboomVerdict(key, data.leverStatus[key])
  if (!woord) return null
  return woord.charAt(0).toLowerCase() + woord.slice(1)
}

/** Is er een bruikbaar, positief bedrag om over te spreken? */
function heeftBedrag(bedrag: number | null | undefined): bedrag is number {
  return bedrag != null && Number.isFinite(bedrag) && bedrag > 0
}

/**
 * De grondslag van het netto vermogen voor de welkom- en de grafiekkaart (K4):
 * wélk bedrag de kaart noemt, en met welke markering erachter.
 *
 * Kiest NIET zelf: `data.woning.uitgesloten` is de al door de loader gemaakte
 * keuze (`isHomeExcludedFromFire`), en beide bedragen komen daar vandaan. Zonder
 * eigen woning is er geen grondslag om te noemen — dan het kale netto vermogen.
 */
function nettoVermogenGrondslag(data: RondleidingData): {
  bedrag: number
  markering: string | null
} {
  if (!data.woning) return { bedrag: data.currentNetWorth, markering: null }
  return data.woning.uitgesloten
    ? { bedrag: data.woning.netWorthExclHome, markering: HOUSING_BASIS_LABEL.exclHome }
    : { bedrag: data.currentNetWorth, markering: HOUSING_BASIS_LABEL.inclHome }
}

/** Het bedrag mét zijn grondslag-markering, of kaal wanneer er geen is. */
function metGrondslag(bedrag: string, markering: string | null): string {
  return markering ? `${bedrag} ${markering}` : bedrag
}

/**
 * De zin voor het geval de grondslag GEEN positief bedrag oplevert terwijl er
 * wél gegevens zijn — het huis uitgesloten, en wat overblijft staat op of onder
 * nul (bv. een studieschuld die het spaargeld overtreft). "Je overzicht is nog
 * leeg" zou dan een leugen zijn, en een negatief bedrag naar vrijheidstijd
 * vertalen ("2 jaar achter") is precies het soort getal dat deze kaart moet
 * vermijden. Constatering, geen oordeel.
 */
const GEEN_POSITIEVE_GRONDSLAG = 'Zonder je huis staat je vermogen nog niet in de plus.'

/**
 * De staart van de grafiekkaart: de twee klikzones van `mini-networth-chart`.
 * Constaterend geformuleerd ("tik op X voor Y"), geen aansporing over geld —
 * hij beschrijft de bediening van het scherm, niet een keuze met je vermogen.
 */
const KLIKZONES =
  'Tik op het verleden om je vermogen bij te werken, op de toekomst voor meer detail.'

// ── De stappen ──────────────────────────────────────────────────────────────

const STAPPEN: readonly RondleidingStap[] = [
  // ── 1. Welkom — waarde vóór de vraag om tijd ─────────────────────────────
  //
  // De eerste kaart toont een EIGEN getal voordat hij om twee minuten vraagt.
  // Een rondleiding die begint met "ik ga je iets uitleggen" is een reclame;
  // eentje die begint met jouw vermogen in vrijheidstijd is al de eerste waarde.
  {
    id: 'welkom',
    titel: 'Even kennismaken',
    target: null,
    body: (data, ctx) => {
      const aanhef = data.userName ? `Hoi ${data.userName}, ik ben Fin.` : 'Hoi, ik ben Fin.'
      // K4 — grondslag eerst: welk vermogen noemt deze kaart, en hoe heet dat.
      const { bedrag: netto, markering } = nettoVermogenGrondslag(data)
      const bedrag = euro(netto, ctx)
      const tijd = vrijheidstijd(netto, data, ctx)

      if (bedrag && heeftBedrag(netto)) {
        const basis = metGrondslag(bedrag, markering)
        return {
          tekst: zinnen(
            aanhef,
            tijd
              ? `Je vermogen staat nu op ${basis} — ${tijd} vrijheid.`
              : `Je vermogen staat nu op ${basis}.`,
            'In twee minuten laat ik je zien waar dat vandaan komt.',
          ),
        }
      }
      // Wél een woning uitgesloten, maar wat overblijft is niet positief: dat is
      // een stand, geen lege administratie.
      if (!ctx.masked && data.woning?.uitgesloten) {
        return {
          tekst: zinnen(
            aanhef,
            GEEN_POSITIEVE_GRONDSLAG,
            'In twee minuten laat ik je zien waar dat vandaan komt.',
          ),
        }
      }
      if (ctx.masked) {
        return {
          tekst: zinnen(
            aanhef,
            'Je bedragen staan nu verborgen.',
            'In twee minuten laat ik je zien wat er op dit scherm staat en wat je ermee kunt.',
          ),
        }
      }
      return {
        tekst: zinnen(
          aanhef,
          'Je overzicht is nog leeg — in twee minuten laat ik je zien wat hier straks staat.',
        ),
      }
    },
  },

  // ── 2. Bezittingen ───────────────────────────────────────────────────────
  {
    id: 'hefboom-bezittingen',
    hoofdstuk: 'hefbomen',
    titel: 'Je bezittingen',
    target: { desktop: '[data-tour="hefboom-bezittingen"]', mobiel: '[data-tour="hefboom-bezittingen"]' },
    body: (data, ctx) => {
      const totaal = data.totals?.bezittingen ?? null
      if (!heeftBedrag(totaal)) {
        return {
          tekst: 'Hier staan nog geen bezittingen. Spaargeld, beleggingen, je huis of je pensioenpot komen op deze tegel te staan.',
        }
      }
      // K3 — BEWUST GEEN `vrijheidstijd(totaal, …)` hier. `totals.bezittingen`
      // is een BRUTO bedrag: de hypotheek staat op de schuldentegel ernaast, dus
      // een deel van deze euro's is van de bank. Dat toch delen door het
      // dagtarief gaf de hoogste van drie tegenstrijdige vrijheidsgetallen op
      // hetzelfde scherm (UR3-04) — en een label eronder repareert dat niet, het
      // legt alleen uit waaróm het getal misleidt. Alleen het bedrag dus.
      const bedrag = euro(totaal, ctx)
      // Spreiding: één zin, met dezelfde drempel als de gezondheidspijler —
      // geen tweede definitie van "geconcentreerd" naast die van de score.
      //
      // MAAR: het OORDEELWOORD achter de dubbele punt komt van de tegel
      // (`hefboomVerdict` ← lever-scores, en die telt SOORTEN, geen aandeel).
      // Vier soorten waarvan één 75 % geeft dus "Goed gespreid" op de tegel én
      // "vooral in één soort" hier — in één zin een tegenspraak. Dan wint de
      // tegel: de rondleiding zegt wat het scherm zegt, nooit iets ernaast.
      const share = data.largestAssetTypeShare
      const geconcentreerd =
        share != null &&
        share * 100 >= ASSET_CONCENTRATION_HIGH_PCT &&
        data.leverStatus.bezittingen !== 'good'
      const soorten = geconcentreerd
        ? 'vooral in één soort'
        : data.assetTypeCount != null && data.assetTypeCount > 1
          ? `verdeeld over ${data.assetTypeCount} soorten`
          : null

      return {
        tekst: zinnen(
          bedrag ? `Je bezittingen staan op ${bedrag}.` : 'Je bezittingen staan op deze tegel.',
          soorten ? `Ze zitten ${soorten}: ${oordeel('bezittingen', data) ?? 'nog zonder oordeel'}.` : null,
          'Hier werk je waardes bij of laat je ze meelopen met de koersen.',
        ),
      }
    },
  },

  // ── 3. Schulden ──────────────────────────────────────────────────────────
  {
    id: 'hefboom-schulden',
    hoofdstuk: 'hefbomen',
    titel: 'Je schulden',
    target: { desktop: '[data-tour="hefboom-schulden"]', mobiel: '[data-tour="hefboom-schulden"]' },
    body: (data, ctx) => {
      const totaal = data.totals?.schulden ?? null
      if (!heeftBedrag(totaal)) {
        return {
          tekst: 'Er staan geen schulden vastgelegd — of je bent schuldenvrij. Hier zie je straks per schuld wanneer hij op nul staat.',
        }
      }
      const bedrag = euro(totaal, ctx)
      const hypotheek = data.housingSplit?.mortgageBalance ?? 0
      const hypotheekBedrag = hypotheek > 0 ? euro(hypotheek, ctx) : null

      return {
        tekst: zinnen(
          bedrag
            ? hypotheekBedrag
              ? `Je schulden staan op ${bedrag}, waarvan ${hypotheekBedrag} hypotheek.`
              : `Je schulden staan op ${bedrag}.`
            : 'Je schulden staan op deze tegel.',
          'Elke aflossing koopt vrijheid terug; hier zie je per schuld wanneer hij op nul staat.',
        ),
      }
    },
  },

  // ── 4. Budget ────────────────────────────────────────────────────────────
  // De step-id en het `data-tour`-attribuut houden bewust de sleutel `cashflow`
  // (ADR 0135): die staat óók in de scoreberekening en de briefing-tags, en
  // hernoemen is een aparte verbouwing. Alleen wat de gebruiker leest volgt de
  // tegel, en die heet sinds die ADR "Budget".
  {
    id: 'hefboom-cashflow',
    hoofdstuk: 'hefbomen',
    titel: 'Je budget',
    target: { desktop: '[data-tour="hefboom-cashflow"]', mobiel: '[data-tour="hefboom-cashflow"]' },
    body: (data) => {
      const quote = data.totals?.cashflow ?? null
      // Een percentage is geen saldo en volgt de privacy-toggle dus niet —
      // exact zoals de tegel zelf (`hefbomen-nav.tsx`).
      //
      // `savingsRate6m` is een GETAL, geen null: zonder inkomen levert de bron
      // 0 (`savingsRateFromAggregates`). "Nog geen boekingen" lees je dus niet
      // aan het getal af maar aan de tegel: die staat zonder gegevens op
      // 'neutral'. Een quote ≤ 0 mét oordeel is een TEKORT — de tegel zegt dan
      // "Tekort op rekening", en de rondleiding hoort niet te doen alsof er nog
      // niets binnen is.
      const leeg = {
        tekst: 'Zodra je boekingen binnenkomen, zie ik hier wat je overhoudt. Dat deel van je inkomen bepaalt je tempo naar vrijheid.',
      }
      if (quote == null || !Number.isFinite(quote)) return leeg
      if (quote <= 0) {
        if (data.leverStatus.cashflow === 'neutral') return leeg
        return {
          tekst: zinnen(
            `Je houdt nu niets van je inkomen over: ${oordeel('cashflow', data) ?? 'nog zonder oordeel'}.`,
            'Dat deel bepaalt je tempo naar vrijheid.',
            'Hier zie je wat er in en uit gaat, en waar het heen gaat.',
          ),
        }
      }
      return {
        tekst: zinnen(
          `Je zet ${Math.round(quote)}% van je inkomen opzij: ${oordeel('cashflow', data) ?? 'nog zonder oordeel'}.`,
          'Dat bepaalt je tempo naar vrijheid.',
          'Hier zie je wat er in en uit gaat, en waar het heen gaat.',
        ),
      }
    },
  },

  // ── 5. Belasting ─────────────────────────────────────────────────────────
  //
  // Wft: dit is de gevoeligste kaart van de negen. Hij noemt een bedrag,
  // beschrijft waar dat vandaan komt en zegt met zoveel woorden dat het een
  // indicatie is en geen advies — geen "je kunt dit lager krijgen", geen
  // optimalisatie-belofte.
  {
    id: 'hefboom-belasting',
    hoofdstuk: 'hefbomen',
    titel: 'Je belasting',
    target: { desktop: '[data-tour="hefboom-belasting"]', mobiel: '[data-tour="hefboom-belasting"]' },
    body: (data, ctx) => {
      const heffing = data.totals?.belasting ?? null
      if (heffing == null || !Number.isFinite(heffing)) {
        return {
          tekst: 'Zodra je bezittingen vastlegt, staat hier je Box 3-schatting. Hier lees je nu al hoe die heffing ontstaat — een indicatie, geen advies.',
        }
      }
      if (heffing <= 0) {
        return {
          tekst: 'Je vermogen blijft onder de heffingsvrije voet, dus Box 3 kost je nu niets. Hier lees je hoe die grens werkt — een indicatie, geen advies.',
        }
      }
      const bedrag = euro(heffing, ctx)
      const tijd = vrijheidstijd(heffing, data, ctx)
      return {
        tekst: zinnen(
          bedrag
            ? tijd
              ? `Box 3 kost je naar schatting ${bedrag} per jaar — ${tijd} vrijheid.`
              : `Box 3 kost je naar schatting ${bedrag} per jaar.`
            : 'Op deze tegel staat je Box 3-heffing per jaar.',
          'Hier lees je hoe dat bedrag ontstaat — een indicatie, geen advies.',
        ),
      }
    },
  },

  // ── 6. Gezondheid ────────────────────────────────────────────────────────
  {
    id: 'gezondheid',
    hoofdstuk: 'stand',
    titel: 'Je gezondheid',
    target: { desktop: '[data-tour="gezondheid"]', mobiel: '[data-tour="gezondheid"]' },
    body: (data) => {
      if (!data.health) {
        return {
          tekst: 'Zodra er genoeg gegevens zijn, staat hier één getal van 0 tot 100: rondkomen, buffer, schuld en vrijheid in één oogopslag.',
        }
      }
      // Onbekend is geen nul (ADR 0131): zonder inkomen/uitgaven spreekt de
      // rondleiding geen oordeel uit — dezelfde zin als de kaart zelf.
      if (data.health.onbekendHint) {
        return {
          tekst: zinnen(
            data.health.onbekendHint,
            'Zodra dat bekend is, staat hier één getal van 0 tot 100: rondkomen, buffer, schuld en vrijheid in één oogopslag.',
          ),
        }
      }
      return {
        tekst: zinnen(
          `Je financiële gezondheid staat op ${Math.round(data.health.total)} van de 100: ${data.health.label.toLowerCase()}.`,
          'Eén getal voor rondkomen, buffer, schuld en vrijheid samen.',
          'Achter de kaart zit de onderverdeling.',
        ),
      }
    },
  },

  // ── 7. De grafiek ────────────────────────────────────────────────────────
  //
  // De vrijheidsleeftijd-zin komt CANONIEK uit `buildVrijheidsleeftijdZin`
  // (variant 'kaart'), dezelfde bron als /toekomst. Onder ELK VAST STOP-ANKER
  // (aow/now/age) gaat die zin over BEREIK en niet over een moment: wie een
  // vaste eindleeftijd kiest krijgt geen "werken wordt een keuze rond je 51e"
  // te zien, want dat moment ligt al vast en het vermogen kan er vóór op zijn.
  // Die zin is bovendien lang — dan valt de staart weg zodat het budget klopt
  // en de kaart één boodschap houdt.
  //
  // De STAART wijst de twee klikzones aan die de grafiek zelf niet verraadt
  // (`mini-networth-chart.tsx`): links van Vandaag opent het vermogensverloop
  // (waar je bedragen ook bijwerkt), rechts van Vandaag de volle projectie op
  // /toekomst. Die affordance stond nergens — de band-uitleg die hier stond
  // beschreef een element dat de legenda ("Bandbreedte") al benoemt.
  {
    id: 'grafiek',
    hoofdstuk: 'stand',
    titel: 'Je vermogen door de tijd',
    target: { desktop: '[data-tour="grafiek"]', mobiel: '[data-tour="grafiek"]' },
    body: (data, ctx) => {
      // K4 — dezelfde grondslag als de welkomkaart, per constructie. Zonder deze
      // gedeelde helper toonden beide kaarten hetzelfde label boven een ander
      // getal; dát was het defect.
      const { bedrag: netto, markering } = nettoVermogenGrondslag(data)
      const bedrag = euro(netto, ctx)
      const tijd = vrijheidstijd(netto, data, ctx)
      const heeftVermogen = heeftBedrag(netto)

      const kop =
        bedrag && heeftVermogen
          ? tijd
            ? `Je netto vermogen is ${metGrondslag(bedrag, markering)} — ${tijd} vrijheid.`
            : `Je netto vermogen is ${metGrondslag(bedrag, markering)}.`
          : !ctx.masked && data.woning?.uitgesloten
            ? GEEN_POSITIEVE_GRONDSLAG
            : 'Deze lijn loopt van je verleden naar je vrijheidsmoment.'

      const reach = data.vrijheid?.ankerReach ?? null
      // `dataIssue` of een ontbrekende seed ⇒ geen zin. Een gegevensprobleem
      // of een nog niet ingestroomd blok 2 mag hier geen leeftijd beloven.
      const zin =
        data.vrijheid && !data.vrijheid.dataIssue
          ? buildVrijheidsleeftijdZin({
              freedomAge: data.vrijheid.fireAgeDisplay,
              framing: data.vrijheid.framing,
              isPensioen: data.isPensioen,
              ankerReach: reach,
              ankerStop: data.vrijheid.ankerStop,
              pending: false,
              variant: 'kaart',
            }).text
          : null

      const staart = reach ? null : KLIKZONES

      return {
        tekst: zinnen(kop, zin, staart),
        kicker: reach ? ANKER_KPI_LABEL : undefined,
      }
    },
  },

  // ── 8. De briefing ───────────────────────────────────────────────────────
  //
  // De rondleiding wees wél de vier hefbomen, de gezondheid en de grafiek aan,
  // maar liep langs het blok dat er wekelijks IETS BIJ zet zonder dat de
  // gebruiker erom vraagt. Wie niet weet dat daar meldingen verschijnen, leest
  // ze niet: op /overzicht staat de briefing ónder de vouw.
  //
  // De kaart noemt de zes categorieën in gewone taal — dezelfde zes als
  // `CATEGORY_CONFIG` in `briefing-panel.tsx` (observation, tip, upcoming,
  // heads_up, milestone, market). Bewust GEEN belofte over de frequentie van
  // het verversen: dat hangt aan AI-toegang en aan een dagteller die deze
  // module niet kent, en een toezegging die het scherm niet nakomt is erger
  // dan geen toezegging.
  {
    id: 'briefing',
    hoofdstuk: 'gereedschap',
    titel: 'De briefing',
    target: { desktop: '[data-tour="briefing"]', mobiel: '[data-tour="briefing"]' },
    body: () => ({
      tekst: zinnen(
        'Elke week zet ik hier wat me opvalt, een tip, wat eraan komt, een heads-up, een mijlpaal of nieuws uit de markt.',
        'Doorklikken brengt je naar het onderdeel zelf.',
      ),
    }),
  },

  // ── 9. De zijbalk (alleen desktop) ───────────────────────────────────────
  {
    id: 'zijbalk',
    hoofdstuk: 'gereedschap',
    titel: 'Je navigatie',
    target: { desktop: '#app-sidebar' },
    optioneel: true,
    body: () => ({
      tekst: zinnen(
        'Links vind je Overzicht voor vandaag, Toekomst voor later, en Berichten, Nieuws en Mijn.',
        'Met ⌘K of Ctrl+K zoek ik overal voor je: pagina’s, boekingen, acties.',
      ),
    }),
  },

  // ── 10. Fin zelf (alleen desktop) ────────────────────────────────────────
  //
  // De rondleiding eindigt waar Fin woont. Kan ontbreken (een chat die al open
  // stond verbergt de zwevende companion) — vandaar `optioneel`.
  {
    id: 'fin',
    hoofdstuk: 'gereedschap',
    titel: 'Hier vind je mij',
    target: { desktop: '[data-tour="fin"]' },
    optioneel: true,
    body: () => ({
      tekst: zinnen(
        'En hier vind je mij.',
        'Ik leg je cijfers uit en houd je vervolgstappen bij — je bank koppelen, bezittingen aanvullen, je toekomst scherper maken.',
      ),
    }),
  },

  // ── 9′. De nav-pill (alleen mobiel; vervangt 9 + 10) ─────────────────
  {
    id: 'pill',
    hoofdstuk: 'gereedschap',
    titel: 'Hier vind je mij',
    target: { mobiel: '[data-mobile-floating-nav]' },
    optioneel: true,
    body: () => ({
      tekst: zinnen(
        'En hier vind je mij: links zoeken, in het midden het menu, rechts ik.',
        'Een seconde op het menu drukken brengt je terug naar je startscherm.',
        'Je vervolgstappen houd ik bij.',
      ),
    }),
  },
]

/**
 * De stappen voor één platform, in volgorde: 10 op desktop, 9 op mobiel. Een
 * stap hoort erbij als hij geen spotlight nodig heeft (het welkom) of een
 * target voor DIT platform kent — zo bundelt mobiel zoeken, menu en Fin in de
 * ene stap die de nav-pill uitlicht, terwijl desktop zijbalk en Fin apart
 * neemt.
 */
export function resolveRondleidingStappen(
  platform: RondleidingPlatform,
): readonly RondleidingStap[] {
  return STAPPEN.filter((stap) => stap.target == null || stap.target[platform] != null)
}

/** De selector van één stap voor dit platform, of `null` bij een welkomstkaart. */
export function stapTarget(
  stap: RondleidingStap,
  platform: RondleidingPlatform,
): string | null {
  return stap.target?.[platform] ?? null
}

/** Alle stappen, ongefilterd — voor de bron-toets op de target-selectors. */
export const RONDLEIDING_STAPPEN = STAPPEN
