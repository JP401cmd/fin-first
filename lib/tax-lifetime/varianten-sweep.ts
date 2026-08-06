/**
 * Variantensweep — vergelijkt drie ONTTREKKINGSVOLGORDES op hun levenslange
 * belastingdruk (Fase 3, fiscale optimizer). Consumeert `computeLifetimeTax`
 * (rapportagelaag) bovenop drie volwaardige kernel-runs; rekent zelf geen cent.
 *
 * Puur & isomorf: geen `'use client'`, geen fs/Supabase/Date.now/Math.random, geen
 * React. Daardoor draaibaar in de kernel-worker (ADR 0054) — wat ook de bedoeling
 * is: DRIE kernel-solves horen niet op de main thread en al helemáál niet op een
 * server-render (zie "Waar dit draait").
 *
 * ## Waarom drie prio-overlays en NIET `WITHDRAWAL_ORDER_PRESETS`
 * De voor de hand liggende sweep — "draai de vier volgorde-presets door" — zou
 * LIEGEN. `orderedGroupsToPrio` (`horizon-kernel/adapter/prio-overgang.ts`) klemt de
 * positie op `Math.min(i + 1, 4)`, dus positie 4 en 5 vallen samen op prio 4. De
 * presets `liquide-eerst` (…, pensioen, vastgoed) en `pensioen-sparen` (…, vastgoed,
 * pensioen) leveren ná die mapping een IDENTIEKE prio-vector op en dus een identieke
 * projectie. Een sweep daarover zou "pensioen als laatste bespaart € 0" tonen — een
 * mapping-artefact, geen fiscale waarheid. Vastgelegd in `varianten-sweep.test.ts`
 * ("de V1-val"). De klem zelf blijft ongemoeid: hij zit oracle-nabij en zou stil de
 * onttrekking van élke gebruiker met een niet-default volgorde herrangschikken.
 *
 * De sweep gebruikt daarom de V5-overlay `categorie_prios.onttrekking` (pot-rules,
 * `sanitizeCategoriePrios` → 1..5), die `buildTsParams` ÓVER de orde-afleiding legt
 * (`overlayBezitPrio`). Prio 5 = reserve = écht achtergesteld; prio 1 = als eerste
 * aanspreken. Dát is een echte fiscale knop.
 *
 * ## Waar dit draait (en waar niet)
 * NIET in `loadFiscaleKansen` — die loader voedt óók de belasting-hub én de
 * aandachtspunten, dus N kernel-runs zouden op élke hub-render landen. In plaats
 * daarvan het `RegelSimSnapshot`-patroon: de server bouwt een serialiseerbare
 * `VariantenSweepSnapshot` (zie `varianten-sweep-loader.ts`), de CLIENT draait de
 * drie runs achter een expliciete gebruikersactie, off-main-thread via de bestaande
 * worker (`kind: 'taxvarianten'`), lazy en gememoïseerd op
 * `variantenSweepInputHash(snapshot)`.
 *
 * ## Rangschikking — één as, twee vetorechten en één eerlijkheidsgetal
 *  - **Primair**: de laagste `levenslangeTotaleDrukNominaal`
 *    (`cumulatiefBox3 + cumulatiefBox1NietVerrekend`).
 *  - **Veto 1 (ADR 0040)**: een variant die FIRE later zet dan de referentie kan
 *    nooit #1 zijn. Wordt wél getoond, met `diskwalificatie`-markering. Belasting
 *    besparen door later vrij te zijn is geen winst.
 *  - **Veto 2**: een UITGEPUTTE laagste buffer (`computeLaagsteBuffer` — de gedeelde
 *    dekkings-grondslag, geen eigen bufferberekening). Een plan dat onderweg zijn
 *    belegbaar vermogen opmaakt is niet goedkoop maar onhaalbaar. Geldt óók voor de
 *    referentie. **De drempel is UITPUTTING (≤ 0), niet "negatief"** — zie
 *    `BUFFER_UITPUTTING_TOLERANTIE_EUR` voor waarom die eerste formulering het veto
 *    onbereikbaar maakte.
 *  - **Eindvermogen is verplicht meegeleverd.** Een NOMINALE levenslange-belasting-
 *    ranking beloont "eerder door je geld heen zijn": wie z'n vermogen sneller
 *    opmaakt betaalt minder Box 3 en wint de as. Zonder het eindvermogen ernaast is
 *    de winnaar misleidend. Daarom DRIE expliciet benoemde grondslagen (ADR 0073):
 *    `eindvermogenNettoNominaal` (volledig netto vermogen, incl. niet-liquide bezit),
 *    `eindvermogenBelegbaarNominaal` (dezelfde grondslag als de laagste buffer) en
 *    `eindvermogenPensioenNominaal` (de resterende pensioenpot — kern-categorie
 *    'Pensioen'). Die derde is geen luxe: de belegbare grondslag slaat de pensioenpot
 *    per constructie over, dus juist de variant die het pensioen uitstelt oogt er
 *    armer door. Meng ze nooit op één as en tel ze nooit bij elkaar op.
 *
 * ## Wat deze laag NIET is
 * Geen `TaxOpportunity`. `toTaxOpportunities()` voedt de hub én de aandachtspunten
 * en kent de toelatingsregel `netEffect > 0` (ADR 0086) op een JAARLIJKSE netto
 * besparing; een levenslang verschil is een andere grootheid. Deze sectie is
 * optimizer-only.
 */

import type { Box1TaxYear } from '@/lib/box1-tax'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import {
  potRulesToRaw,
  resolvePotRules,
  type CategoriePrios,
  type PotRulesConfig,
} from '@/lib/pot-rules'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { computeLaagsteBuffer, type LaagsteBuffer } from '@/lib/horizon/laagste-buffer'
import { spendablePortfolio } from '@/lib/horizon/coverage-strip'
import { pensioenPortfolio } from '@/lib/horizon/pensioen-pot'
import { computeLifetimeTax } from './lifetime-tax'

// ── Drempels (vergelijk-toleranties, GEEN financiële aanname) ────────────────

/**
 * Float-ruisband op de FIRE-vergelijking (jaren). De kernel bisecteert op MAANDEN,
 * dus een échte verschuiving is minstens 1/12 ≈ 0,083 jaar. Alles daaronder is
 * drijvende-komma-ruis en mag geen variant diskwalificeren.
 */
export const FIRE_LATER_TOLERANTIE_JAAR = 1e-6

/**
 * Gelijkspel-band op de belasting-as (€). Nominale levenslange bedragen lopen in de
 * honderdduizenden; een verschil onder een halve euro is optel-ruis, geen keuze.
 * Bij gelijkspel wint de referentie (niet wisselen zonder aantoonbare winst).
 */
export const GELIJKSPEL_TOLERANTIE_EUR = 0.5

/**
 * Float-ruisband (€) op de uitputtings-drempel van de laagste buffer.
 *
 * **Waarom er überhaupt een drempel nodig was.** Het veto testte oorspronkelijk
 * `laagsteBuffer.bedrag < 0`. Dat kon per constructie nooit afgaan:
 * `computeLaagsteBuffer` neemt het minimum van `spendablePortfolio`, en dat is een
 * SOM van bucket-`endValue`s (`lib/horizon/coverage-strip.ts`) die nooit met
 * schulden wordt verrekend — een tekort landt in de kern als Tekort-lening (een
 * schuld), niet als negatief bezit. De canonieke test zegt het in zijn naam:
 * `lib/horizon/laagste-buffer.test.ts` — "negatief kan niet, maar €0-dieptepunt
 * (uitgeput) wordt gevonden". Het veto stond dus als werkende waarborg
 * gedocumenteerd terwijl precies het geval dat het moest vangen — een variant die
 * de portefeuille leegtrekt en daardoor de minste Box 3 betaalt — er ongehinderd
 * doorheen kwam en de badge "laagste druk" kon krijgen.
 *
 * **Waarom uitputting (≤ 0) en niet een relatieve drempel t.o.v. de jaarbehoefte.**
 * Nul is de bodem van deze grootheid, niet een willekeurig punt op een schaal: is
 * de som van de belegbare potten nul, dan is er niets meer om uit te onttrekken en
 * loopt de rest van het plan per definitie op geleend geld. Dat is een FEIT uit het
 * rij-contract. Een relatieve drempel ("minder dan een half jaar behoefte over")
 * zou daarentegen een NORM zijn — een nieuwe financiële aanname over hoeveel buffer
 * genoeg is, die deze laag niet mag verzinnen en die bovendien een behoefte-grootheid
 * vergt die de sweep niet draagt.
 *
 * Deze constante is uitsluitend de ruisband eromheen: één cent, zodat een restant
 * van €0,000000001 uit de kernel-optelling niet als "er is nog vermogen" leest. Net
 * als de twee toleranties hierboven is dit een VERGELIJK-tolerantie, geen financiële
 * aanname.
 */
export const BUFFER_UITPUTTING_TOLERANTIE_EUR = 0.01

// ── Varianten ────────────────────────────────────────────────────────────────

export type VariantId = 'huidige-volgorde' | 'pensioen-laatst' | 'pensioen-eerst'

/** Statische definitie van één variant. */
export interface VariantSpec {
  readonly id: VariantId
  readonly label: string
  /**
   * Overlay op `categorie_prios.onttrekking` (kernel-categorie-labels → prio 1..5).
   * `null` = REFERENTIE: het profiel gaat ONGEWIJZIGD de kernel in, zodat deze run
   * per constructie het plan van de gebruiker zélf is.
   */
  readonly onttrekkingOverlay: Readonly<Record<string, number>> | null
}

/**
 * De drie varianten, in vaste weergave-volgorde. De referentie staat bewust
 * VOOROP: hij is het ijkpunt voor het FIRE-veto en de gelijkspel-regel.
 */
export const VARIANT_SPECS: readonly VariantSpec[] = [
  { id: 'huidige-volgorde', label: 'Jouw huidige volgorde', onttrekkingOverlay: null },
  // Prio 5 = reserve: pensioen wordt pas aangesproken als de rest op is.
  { id: 'pensioen-laatst', label: 'Pensioen zo laat mogelijk', onttrekkingOverlay: { Pensioen: 5 } },
  // Prio 1 = als eerste aanspreken.
  { id: 'pensioen-eerst', label: 'Pensioen vroeg', onttrekkingOverlay: { Pensioen: 1 } },
] as const

/** De referentievariant — het ijkpunt van beide vetoregels. */
export const REFERENTIE_VARIANT_ID: VariantId = 'huidige-volgorde'

// ── Invoer ───────────────────────────────────────────────────────────────────

/**
 * Serialiseerbare momentopname van alles wat de sweep nodig heeft. Spiegelt
 * `RegelSimSnapshot`: server-side gebouwd, structured-clone-veilig, en de CLIENT
 * draait ermee. Bevat geen rijen — alleen invoer.
 */
export interface VariantenSweepSnapshot {
  /** Rauwe kernel-context van de canonieke Horizon-run (ongewijzigd = referentie). */
  readonly rawContext: ConvergentieRawContext
  /**
   * Fractionele AOW-leeftijd (`HorizonFireSim.aowAgeFractional`) — de ENIGE bron
   * voor de per-rij AOW-vlag in `computeLifetimeTax`; nooit hier afgeleid.
   */
  readonly aowLeeftijd: number
  /** Box 1-tariefjaar; afwezig → `CURRENT_TAX_YEAR`. */
  readonly box1Jaar?: Box1TaxYear
}

// ── Uitvoer ──────────────────────────────────────────────────────────────────

/** Waarom een variant niet als winnaar in aanmerking komt. */
export type VariantDiskwalificatie =
  /** Laagste belegbare buffer raakt onderweg op — onhaalbaar plan, niet "goedkoop". */
  | 'buffer-uitgeput'
  /** FIRE valt later dan bij de referentie (ADR 0040). */
  | 'fire-later-dan-referentie'

/**
 * Uitkomst van één doorgerekende variant. Alle euro-bedragen zijn NOMINAAL —
 * dezelfde grondslag als de kernel-rijen en `LifetimeTaxSeries` (ADR 0073: de
 * grondslag staat in de veldnaam). Bij een kern-fout zijn alle getallen `null` en
 * draagt `kernelFout` de reden; de variant telt dan niet mee in de ranking.
 */
export interface VariantUitkomst {
  readonly id: VariantId
  readonly label: string
  /** De toegepaste overlay; `null` = referentie (ongewijzigde `pot_rules`). */
  readonly onttrekkingOverlay: Readonly<Record<string, number>> | null
  /** `id === REFERENTIE_VARIANT_ID` — expliciet, zodat de UI niet hoeft te vergelijken. */
  readonly isReferentie: boolean

  // ── De drie belastingtotalen (levenslang, nominaal) ─────────
  /** Eindstand `cumulatiefBox3` — geconsumeerd uit de rijen, nooit herberekend. */
  readonly levenslangeBox3Nominaal: number | null
  /** Eindstand `cumulatiefBox1NietVerrekend` — de heffing die de cashflow niet inhield. */
  readonly levenslangeBox1NietVerrekendNominaal: number | null
  /** `Box3 + Box1NietVerrekend` — de RANGSCHIK-as. */
  readonly levenslangeTotaleDrukNominaal: number | null

  // ── Nevenvoorwaarden & eerlijkheidsgetallen ────────────────
  /** FIRE-leeftijd van deze run (fractioneel); `null` = onbereikbaar/kern-fout. */
  readonly fireAgeFractional: number | null
  /** Netto vermogen op de laatste rij, INCL. niet-liquide bezit (bv. een huis). */
  readonly eindvermogenNettoNominaal: number | null
  /** Belegbaar vermogen op de laatste rij — zelfde grondslag als `laagsteBuffer`. */
  readonly eindvermogenBelegbaarNominaal: number | null
  /**
   * Resterende PENSIOENPOT op de laatste rij (`pensioenPortfolio`): de kern-categorie
   * 'Pensioen', dus `retirement` ÉN `levensverzekering` — exact de categorie waar de
   * onttrekkings-overlay van deze sweep op stuurt.
   *
   * **Waarom dit veld naast het belegbaar vermogen MOET staan.** Deze sweep vergelijkt
   * drie plekken voor de pensioenpot, terwijl `eindvermogenBelegbaarNominaal`
   * (`spendablePortfolio`) de pensioenpot per constructie overslaat
   * (`NON_SPENDABLE_ASSET_TYPES`). Een variant die het pensioen uitstelt eindigt
   * daardoor met een fors LAGER belegbaar vermogen — niet omdat ze armer is, maar
   * omdat haar vermogen in de pot staat die die grondslag niet telt. Zonder dit getal
   * kan katern IV zijn eigen vraag niet beantwoorden.
   *
   * GRONDSLAG-WAARSCHUWING: dit is een DERDE grondslag naast netto en belegbaar, geen
   * uitsplitsing daarvan. Nooit optellen bij `eindvermogenBelegbaarNominaal` — die
   * telt `levensverzekering` vandaag óók mee (zie `lib/horizon/pensioen-pot.ts`), dus
   * de som zou dat deel dubbel tellen. Apart tonen, apart labelen.
   */
  readonly eindvermogenPensioenNominaal: number | null
  /** Dieptepunt van het belegbaar vermogen (`computeLaagsteBuffer`). */
  readonly laagsteBuffer: LaagsteBuffer | null

  /** Reden waarom deze variant geen winnaar kan zijn; `null` = komt in aanmerking. */
  readonly diskwalificatie: VariantDiskwalificatie | null
  /** Nette kern-fout-reden; `null` = de run slaagde. */
  readonly kernelFout: string | null
}

/** Volledige sweep-uitkomst — de drie varianten plus de gekozen winnaar. */
export interface VariantenSweepResultaat {
  /** In `VARIANT_SPECS`-volgorde; de referentie staat vooraan. */
  readonly varianten: readonly VariantUitkomst[]
  /** Winnaar op de laagste levenslange totale druk; `null` = geen kandidaat. */
  readonly winnaarId: VariantId | null
  /** Het ijkpunt van beide vetoregels (altijd `'huidige-volgorde'`). */
  readonly referentieId: VariantId
  /** Box 1-tariefjaar dat de reeksen droeg (herleidbaarheid). */
  readonly box1Jaar: Box1TaxYear
}

// ── Profiel-overlay ──────────────────────────────────────────────────────────

/**
 * Profiel voor één variant. De REFERENTIE krijgt het profiel ONAANGERAAKT terug
 * (dezelfde objectreferentie) — geen resolve/serialize-round-trip, zodat de
 * referentie-run per constructie byte-identiek is aan de canonieke Horizon-run en
 * niet stil op gesaneerde `pot_rules` gaat drijven.
 *
 * Een variant merget de overlay ÍN de bestaande `categorie_prios.onttrekking`: de
 * overige categorie-voorkeuren van de gebruiker blijven staan, alleen de genoemde
 * categorieën verschuiven. Serialisatie loopt via de canonieke
 * `resolvePotRules`/`potRulesToRaw` — geen handmatige JSON-chirurgie.
 */
export function buildVariantProfile(
  profile: ConvergentieRawProfileRow,
  spec: VariantSpec,
): ConvergentieRawProfileRow {
  if (spec.onttrekkingOverlay === null) return profile

  const basis = resolvePotRules(profile)
  const categoriePrios: CategoriePrios = {
    ...basis.categoriePrios,
    onttrekking: { ...basis.categoriePrios?.onttrekking, ...spec.onttrekkingOverlay },
  }
  const merged: PotRulesConfig = { ...basis, categoriePrios }
  return { ...profile, pot_rules: potRulesToRaw(merged) }
}

// ── Eén variant doorrekenen ──────────────────────────────────────────────────

/**
 * Draai één variant: kernel-run → levenslange belastingreeks → buffer/eindvermogen.
 * De `diskwalificatie` wordt hier NIET bepaald (die vergt de referentie) en is
 * altijd `null`; `finaliseerVarianten` vult 'm in.
 */
function runVariant(snapshot: VariantenSweepSnapshot, spec: VariantSpec): VariantUitkomst {
  const leeg = (kernelFout: string | null): VariantUitkomst => ({
    id: spec.id,
    label: spec.label,
    onttrekkingOverlay: spec.onttrekkingOverlay,
    isReferentie: spec.id === REFERENTIE_VARIANT_ID,
    levenslangeBox3Nominaal: null,
    levenslangeBox1NietVerrekendNominaal: null,
    levenslangeTotaleDrukNominaal: null,
    fireAgeFractional: null,
    eindvermogenNettoNominaal: null,
    eindvermogenBelegbaarNominaal: null,
    eindvermogenPensioenNominaal: null,
    laagsteBuffer: null,
    diskwalificatie: null,
    kernelFout,
  })

  const profile = buildVariantProfile(snapshot.rawContext.profile, spec)
  const rawContext: ConvergentieRawContext =
    profile === snapshot.rawContext.profile
      ? snapshot.rawContext
      : { ...snapshot.rawContext, profile }

  const outcome = computeConvergentieProjection({ rawContext })
  if (!outcome.ok) return leeg(outcome.reason)

  const rows = outcome.result.rows
  if (rows.length === 0) return leeg('kernel leverde geen jaarrijen')

  const reeks = computeLifetimeTax(rows, {
    aowLeeftijd: snapshot.aowLeeftijd,
    ...(snapshot.box1Jaar ? { year: snapshot.box1Jaar } : {}),
  })
  const laatste = rows[rows.length - 1]

  return {
    ...leeg(null),
    levenslangeBox3Nominaal: reeks.cumulatiefBox3,
    levenslangeBox1NietVerrekendNominaal: reeks.cumulatiefBox1NietVerrekend,
    levenslangeTotaleDrukNominaal: reeks.cumulatiefTotaal,
    fireAgeFractional: outcome.result.fireAgeFractional,
    eindvermogenNettoNominaal: laatste.netWorth,
    eindvermogenBelegbaarNominaal: spendablePortfolio(laatste),
    eindvermogenPensioenNominaal: pensioenPortfolio(laatste),
    laagsteBuffer: computeLaagsteBuffer(rows),
  }
}

// ── Diskwalificatie & winnaar ────────────────────────────────────────────────

/**
 * Bepaal of een variant is uitgesloten als winnaar.
 *
 * Een variant die niet DRAAIDE krijgt geen enkele diskwalificatie: bij een
 * kern-fout staat élk getal op `null` (inclusief `fireAgeFractional`), en zonder
 * deze uitgang zou de FIRE-tak "null telt als +∞" toeslaan en de kop laten zeggen
 * dat je FIRE-moment later valt — een feitelijke uitspraak over een run die nooit
 * heeft plaatsgevonden. `kernelFout` is de reden; die toont de UI apart.
 *
 * Volgorde is BETEKENISVOL: de uitgeputte buffer wint van het FIRE-veto wanneer
 * beide gelden. "Je geld raakt onderweg op" is een hardere en eerlijkere boodschap
 * dan "je bent later vrij" — het tweede is een gevolg, niet de kwaal.
 *
 * Het FIRE-veto meet tégen de referentie; die kan er dus per definitie niet aan
 * vallen. `null` FIRE (onbereikbaar) telt als +∞: een variant die FIRE niet haalt
 * terwijl de referentie dat wél doet, zet FIRE later.
 */
export function bepaalDiskwalificatie(
  variant: VariantUitkomst,
  referentie: VariantUitkomst | undefined,
): VariantDiskwalificatie | null {
  if (variant.kernelFout !== null) return null
  // Uitputting, niet "negatief": zie BUFFER_UITPUTTING_TOLERANTIE_EUR.
  if (
    variant.laagsteBuffer !== null &&
    variant.laagsteBuffer.bedrag <= BUFFER_UITPUTTING_TOLERANTIE_EUR
  ) {
    return 'buffer-uitgeput'
  }
  if (variant.isReferentie || referentie === undefined) return null

  const ref = referentie.fireAgeFractional
  const eigen = variant.fireAgeFractional
  // Referentie haalt FIRE niet → er is geen ijkpunt om "later" tegen te meten.
  if (ref === null) return null
  if (eigen === null) return 'fire-later-dan-referentie'
  if (eigen > ref + FIRE_LATER_TOLERANTIE_JAAR) return 'fire-later-dan-referentie'
  return null
}

/**
 * Kies de winnaar: de laagste `levenslangeTotaleDrukNominaal` onder de varianten
 * zónder diskwalificatie en zonder kern-fout. Gelijkspel binnen
 * `GELIJKSPEL_TOLERANTIE_EUR` gaat naar de referentie (en anders naar de eerste in
 * de gegeven volgorde) — niet wisselen zonder aantoonbare winst. Geen enkele
 * kandidaat → `null` (een eerlijke lege uitkomst, geen noodgreep).
 */
export function kiesWinnaar(varianten: readonly VariantUitkomst[]): VariantId | null {
  let winnaar: VariantUitkomst | null = null
  for (const v of varianten) {
    if (v.diskwalificatie !== null) continue
    if (v.levenslangeTotaleDrukNominaal === null) continue
    if (winnaar === null) {
      winnaar = v
      continue
    }
    const huidig = winnaar.levenslangeTotaleDrukNominaal as number
    const kandidaat = v.levenslangeTotaleDrukNominaal
    if (kandidaat < huidig - GELIJKSPEL_TOLERANTIE_EUR) {
      winnaar = v
    } else if (Math.abs(kandidaat - huidig) <= GELIJKSPEL_TOLERANTIE_EUR && v.isReferentie) {
      // Gelijkspel → de referentie wint (ook als hij later in de lijst staat).
      winnaar = v
    }
  }
  return winnaar?.id ?? null
}

/**
 * Vul de diskwalificaties in (tegen de referentie) en kies de winnaar. Puur en
 * los testbaar: neemt ruwe variant-uitkomsten, doet geen kernel-run.
 */
export function finaliseerVarianten(
  ruwe: readonly VariantUitkomst[],
  box1Jaar: Box1TaxYear,
): VariantenSweepResultaat {
  const referentie = ruwe.find((v) => v.isReferentie)
  const varianten = ruwe.map((v) => ({
    ...v,
    diskwalificatie: bepaalDiskwalificatie(v, referentie),
  }))
  return {
    varianten,
    winnaarId: kiesWinnaar(varianten),
    referentieId: REFERENTIE_VARIANT_ID,
    box1Jaar,
  }
}

// ── Publieke motor ───────────────────────────────────────────────────────────

/**
 * Draai de volledige variantensweep: DRIE kernel-solves (één per variant) plus de
 * levenslange-belastingreeks erbovenop. Synchroon en puur — de aanroeper bepaalt
 * wáár dit draait (in de praktijk: de kernel-worker, achter een gebruikersactie).
 */
export function runVariantenSweep(snapshot: VariantenSweepSnapshot): VariantenSweepResultaat {
  const ruwe = VARIANT_SPECS.map((spec) => runVariant(snapshot, spec))
  return finaliseerVarianten(ruwe, snapshot.box1Jaar ?? CURRENT_TAX_YEAR)
}

// ── Memo-sleutel ─────────────────────────────────────────────────────────────

/**
 * Stabiele sleutel over de sweep-INVOER, bedoeld als memo-sleutel voor de UI
 * ("dezelfde snapshot → niet opnieuw drie solves"). Bewust GÉÉN cryptografische
 * digest en bewust geen module-cache hier: de UI houdt de memo zelf vast (per
 * component-instantie), zodat er nooit een cross-account cache ontstaat.
 *
 * FNV-1a over de JSON-vorm van de snapshot. Sleutelvolgorde van Supabase-rijen is
 * binnen één sessie stabiel; een gemiste hit kost hooguit een herberekening, nooit
 * een verkeerd antwoord.
 */
export function variantenSweepInputHash(snapshot: VariantenSweepSnapshot): string {
  let json: string
  try {
    json = JSON.stringify(snapshot)
  } catch {
    return 'niet-serialiseerbaar'
  }
  let hash = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
