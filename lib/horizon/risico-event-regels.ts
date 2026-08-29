/**
 * Rekenregels van de RISICO-levensgebeurtenissen — puur en testbaar.
 *
 * ## Waarom dit bestand bestaat
 * De rekenregels van `werkloosheid` en `overlijden_partner` stonden ongetest in
 * `components/app/horizon/horizon-client.tsx` (>8000 regels), en wel TWEE keer:
 * één keer in `saveEvent()` (de som die het event daadwerkelijk voedt) en één
 * keer in de tooltip-preview. Die twee kopieën waren uit elkaar gelopen — de
 * wettelijke 75%-trap van de WW zat alleen in de preview. Zie
 * `lib/sociale-zekerheid.ts` voor de bijbehorende constanten-deduplicatie.
 *
 * Dit is de zusterkant van `lib/horizon/event-prefill.ts`: die berekent de
 * VOORGESTELDE formulierwaarden, deze module berekent de KASSTROOM-impact van de
 * ingevulde waarden. Beide zijn puur en beide worden door dezelfde component
 * geconsumeerd — nooit herhaald.
 *
 * Consume-don't-recompute: WW- en Anw-parameters komen uitsluitend uit
 * `lib/sociale-zekerheid.ts`; hier staat géén wettelijk bedrag.
 */

import {
  berekenAnwNetto,
  berekenWwUitkering,
  anwNabestaandenBruto,
  type WwUitkering,
} from '@/lib/sociale-zekerheid'

/**
 * De kasstroomvelden die `life_events` van een risico-event verwacht. Exact de
 * vier grootheden die `saveEvent()` in het payload-object zet.
 */
export interface RisicoEventCashflow {
  /** Eenmalig bedrag; positief = uitgave, negatief = inkomst. */
  oneTimeCost: number
  /** Structurele wijziging van de maandLASTEN (positief = duurder). */
  monthlyCostChange: number
  /** Structurele wijziging van het maandINKOMEN (negatief = verlies). */
  monthlyIncomeChange: number
  /** Looptijd in maanden; 0 = doorlopend. */
  durMonths: number
}

/**
 * Lees een metadata-waarde als getal. Ontbrekend/leeg/niet-numeriek → fallback;
 * een expliciete 0 blijft 0.
 *
 * BEWUST `??`-semantiek, niet `||`: de twee oude kopieën verschilden hierin
 * (`saveEvent` gebruikte `|| default`, de preview `?? default`), waardoor een
 * veld dat de gebruiker op 0 zette in de ene weergave 0 was en in de andere de
 * default. Eén grondslag: 0 betekent 0.
 */
function num(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// ── Werkloosheid ─────────────────────────────────────────────────────────────

/** Metadata-velden van het `werkloosheid`-event die de rekenregel leest. */
export interface WerkloosheidRegelInput {
  huidigBruto?: unknown
  huidigNetto?: unknown
  transitievergoeding?: unknown
  wwDuur?: unknown
  zoektijd?: unknown
}

export interface WerkloosheidImpact extends RisicoEventCashflow {
  /** De onderliggende WW-berekening (canoniek, uit lib/sociale-zekerheid). */
  ww: WwUitkering
  /** Totale werkloosheidsduur = max(WW-duur, verwachte zoektijd). */
  totaleDuurMaanden: number
  /** Netto inkomensgat per maand, gemiddeld over de totale werkloosheidsduur. */
  inkomensgatPerMaand: number
  /** Inkomensgat × totale duur. */
  totaalInkomensverlies: number
  /** De transitievergoeding zoals ingevuld (eenmalige inkomst). */
  transitievergoeding: number
  /** Netto maandinkomen vóór werkloosheid. */
  huidigNetto: number
}

/**
 * Kasstroom-impact van een werkloosheid-event.
 *
 * GRONDSLAG (expliciet, want gewijzigd): het inkomensgat wordt toegepast over de
 * TOTALE werkloosheidsduur `max(wwDuur, zoektijd)`, dus wordt de gemiddelde
 * WW-uitkering óók over dat venster bepaald. Maanden ná afloop van het WW-recht
 * tellen als € 0 mee. De oude berekening rekende in plaats daarvan kaal 70% over
 * de hele periode: dat overschatte de uitkering in maand 1-2 (waar 75% geldt) en
 * onderschatte het gat in de staart (waar helemaal geen WW meer loopt).
 */
export function berekenWerkloosheidImpact(
  metadata: WerkloosheidRegelInput,
  jaar?: number,
): WerkloosheidImpact {
  const bruto = num(metadata.huidigBruto, 4000)
  const huidigNetto = num(metadata.huidigNetto, 3000)
  const transitievergoeding = num(metadata.transitievergoeding, 0)
  const wwDuur = num(metadata.wwDuur, 12)
  const zoektijd = num(metadata.zoektijd, 6)

  const totaleDuurMaanden = Math.max(wwDuur, zoektijd)

  const ww = berekenWwUitkering({
    brutoMaandsalaris: bruto,
    wwDuurMaanden: wwDuur,
    overDuurMaanden: totaleDuurMaanden,
    jaar,
  })

  const inkomensgatPerMaand = Math.max(0, huidigNetto - ww.gemiddeldPerMaand)
  const totaalInkomensverlies = Math.round(inkomensgatPerMaand * totaleDuurMaanden)

  return {
    // Transitievergoeding is een eenmalige INKOMST → negatieve kostenpost.
    // `|| 0` normaliseert -0 naar +0: een negatie van 0 levert in JS -0 op, wat
    // via Object.is/JSON een ander getal is dan 0 en zo in life_events zou landen.
    oneTimeCost: -transitievergoeding || 0,
    monthlyCostChange: 0,
    monthlyIncomeChange: -inkomensgatPerMaand || 0,
    durMonths: totaleDuurMaanden,
    ww,
    totaleDuurMaanden,
    inkomensgatPerMaand,
    totaalInkomensverlies,
    transitievergoeding,
    huidigNetto,
  }
}

// ── Overlijden partner ───────────────────────────────────────────────────────

/** Metadata-velden van het `overlijden_partner`-event die de rekenregel leest. */
export interface OverlijdenPartnerRegelInput {
  nettoInkomenPartner?: unknown
  nabestaandenpensioen?: unknown
  anwUitkering?: unknown
  anwBedrag?: unknown
  levensverzekering?: unknown
  kostendalingPct?: unknown
}

/** Context die de rekenregel buiten de metadata nodig heeft. */
export interface OverlijdenPartnerRegelContext {
  /** Huidige maanduitgaven van het huishouden (effectieve grondslag). */
  maandlastenHuishouden: number
}

export interface OverlijdenPartnerImpact extends RisicoEventCashflow {
  /** Wegvallend netto partnerinkomen. */
  partnerInkomen: number
  /** Nabestaandenpensioen per maand (uit het UPO, handmatig). */
  nabestaandenpensioen: number
  /** Anw bruto per maand zoals meegerekend (0 bij 'geen'). */
  anwBruto: number
  /** Anw netto per maand (benadering, zie ANW_NETTO_BENADERING_FACTOR). */
  anwNetto: number
  /** Eenmalige uitkering levensverzekering/ORV. */
  levensverzekering: number
  /** Gehanteerd dalingspercentage van de gedeelde kosten. */
  kostendalingPct: number
  /** Absolute kostendaling per maand. */
  kostendaling: number
  /** Netto maandelijkse impact (negatief = tekort). */
  nettoMaandImpact: number
}

/**
 * Kasstroom-impact van een overlijden-partner-event: het wegvallende
 * partnerinkomen, verminderd met nabestaandenpensioen, Anw en de daling van de
 * gedeelde kosten. De levensverzekering/ORV komt er als eenmalige uitkering bij.
 *
 * Doorlopend van aard (`durMonths = 0`): het inkomensverlies is permanent.
 */
export function berekenOverlijdenPartnerImpact(
  metadata: OverlijdenPartnerRegelInput,
  ctx: OverlijdenPartnerRegelContext,
  jaar?: number,
): OverlijdenPartnerImpact {
  const partnerInkomen = num(metadata.nettoInkomenPartner, 2500)
  const nabestaandenpensioen = num(metadata.nabestaandenpensioen, 0)
  const anwType = String(metadata.anwUitkering ?? 'kinderen')
  const anwBruto = anwType === 'geen' ? 0 : num(metadata.anwBedrag, anwNabestaandenBruto(jaar))
  const anwNetto = berekenAnwNetto(anwBruto)
  const levensverzekering = num(metadata.levensverzekering, 0)
  const kostendalingPct = num(metadata.kostendalingPct, 30)

  const maandlasten = Number.isFinite(ctx.maandlastenHuishouden) ? ctx.maandlastenHuishouden : 0
  const kostendaling = Math.round(maandlasten * (kostendalingPct / 100))

  const nettoMaandImpact = -partnerInkomen + nabestaandenpensioen + anwNetto + kostendaling

  return {
    // Levensverzekering is een eenmalige INKOMST → negatieve kostenpost.
    oneTimeCost: levensverzekering > 0 ? -levensverzekering : 0,
    monthlyCostChange: 0,
    monthlyIncomeChange: nettoMaandImpact || 0,
    durMonths: 0,
    partnerInkomen,
    nabestaandenpensioen,
    anwBruto,
    anwNetto,
    levensverzekering,
    kostendalingPct,
    kostendaling,
    nettoMaandImpact,
  }
}

// ── D3: na-FIRE-gedrag, per scenario EXPLICIET ───────────────────────────────

/** Het type risico-levensgebeurtenis dat deze module bedient. */
export type RisicoEventType = 'werkloosheid' | 'overlijden_partner'

/** Hoe een schok zich verhoudt tot het moment waarop het werkinkomen wegvalt. */
export type NaFireGedrag =
  /** De schok kán per definitie niet meer optreden zodra je gestopt bent met werken. */
  | 'niet_van_toepassing_na_fire'
  /** De schok is een permanent inkomens-/kostenfeit en loopt terecht door. */
  | 'loopt_door_na_fire'

export interface RisicoScenarioGedrag {
  readonly naFire: NaFireGedrag
  readonly reden: string
}

/**
 * EXPLICIETE keuze per risicoscenario, in plaats van het kernel-gedrag stilzwijgend
 * te erven.
 *
 * Achtergrond: `lib/horizon-kernel/adapter/guard.ts` routeert alléén de
 * SLIDER-werk-events (`SLIDER_WORK_ORIGINS`) via het FIRE-gegate salariskanaal.
 * Elk ander event landt als vrije `Geb`-rij, die de kern onvoorwaardelijk telt —
 * óók ná FIRE. Voor `overlijden_partner` is dat correct (permanent verlies). Voor
 * `werkloosheid` is het inhoudelijk fout: je kunt geen baan verliezen die je niet
 * meer hebt.
 *
 * Deze tabel is de vastgelegde grondslag; de UI waarschuwt erop
 * (`werkloosheidNaFireWaarschuwing`). Het daadwerkelijk FIRE-gaten van een
 * periodieke schok in de kern is een aparte, oracle-parity-gevoelige ingreep en
 * hoort bij het Risico-APK-oppervlak — niet bij deze defectronde.
 */
export const RISICO_EVENT_NA_FIRE: Record<RisicoEventType, RisicoScenarioGedrag> = {
  werkloosheid: {
    naFire: 'niet_van_toepassing_na_fire',
    reden:
      'Werkloosheid veronderstelt een baan. Na je vrijheidsleeftijd is er geen salaris meer dat kan wegvallen, dus een WW-schok daarna modelleert een verlies dat niet bestaat.',
  },
  overlijden_partner: {
    naFire: 'loopt_door_na_fire',
    reden:
      'Het wegvallen van partnerinkomen, Anw en de daling van gedeelde kosten zijn permanente feiten. Die lopen terecht door na de vrijheidsleeftijd.',
  },
}

/**
 * Waarschuwingstekst wanneer een werkloosheid-event op of ná de geprojecteerde
 * vrijheidsleeftijd wordt geplaatst. `null` = geen bezwaar (of onvoldoende
 * gegevens om te oordelen).
 *
 * Advies, geen blokkade: de gebruiker mag een scenario doorrekenen dat wij
 * onwaarschijnlijk vinden — maar hij hoort te weten dat het model hier een
 * inkomensverlies telt dat er in die fase niet meer is.
 */
export function werkloosheidNaFireWaarschuwing(
  eventLeeftijd: number | null | undefined,
  fireLeeftijd: number | null | undefined,
): string | null {
  if (typeof eventLeeftijd !== 'number' || !Number.isFinite(eventLeeftijd)) return null
  if (typeof fireLeeftijd !== 'number' || !Number.isFinite(fireLeeftijd)) return null
  if (eventLeeftijd < fireLeeftijd) return null
  return `Je vrijheidsleeftijd ligt op ${Math.round(fireLeeftijd)} jaar. Vanaf dat moment is er geen salaris meer dat kan wegvallen, terwijl het model het inkomensverlies wél doorrekent. Zet de gebeurtenis vóór je vrijheidsleeftijd voor een realistisch beeld.`
}
