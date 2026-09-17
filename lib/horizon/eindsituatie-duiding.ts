/**
 * Duiding van de eindsituatie — "waarom blijft er aan het eind zoveel over?" (pure).
 *
 * Een plan zonder vast stopmoment laat de solver het VROEGSTE toereikende stopmoment
 * kiezen (`solver.ts#isToereikend`). Bij "vermogen opeten" verwacht je dan rond €0 op
 * de eindleeftijd. Staat er veel meer, dan bepaalde een ándere regel dan het eindbedrag
 * het stopmoment — of kwam er na dat moment geld bij. Deze module leest dat uit
 * DEZELFDE run af; hij rekent niets opnieuw door en kent geen copy (zie
 * `eindsituatie-copy.ts`) en geen React.
 *
 * GRONDSLAG: overschot en dieptepunt staan op `nettoLiquide` (Prognose!J) — dezelfde
 * grootheid waarop de solver toetst — behalve bij nalatenschap mét niet-liquide bezit
 * (P!B54 = Ja → Prognose!I = `netWorth`). Alle bedragen zijn NOMINAAL en komen met de
 * `inflationFactor` van hun rij mee, zodat de consument exact één keer deflateert
 * (`lib/euro-display.ts`, ADR 0090/0093).
 *
 * Oorzaken, in vaste volgorde:
 *  - bindend (bepalen het stopmoment; precies één ⇒ eenduidig):
 *    `nu-stoppen` (a3) → `geen-tekort-lening` (a1) → `opeet-plafond` (a2)
 *  - aanvullend (verklaren de aangroei ná het stopmoment/dieptepunt):
 *    `later-inkomen` (b) → `late-baten` (g) → `dalend-profiel` (d)
 *  - context (verklaren het vermogen náást het overschot, tellen niet voor eenduidig):
 *    `huis` (c) en `opeetschuld` (h).
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'

export type EindOorzaakId =
  | 'nu-stoppen'
  | 'geen-tekort-lening'
  | 'opeet-plafond'
  | 'later-inkomen'
  | 'late-baten'
  | 'dalend-profiel'

export const BINDENDE_OORZAKEN: readonly EindOorzaakId[] = ['nu-stoppen', 'geen-tekort-lening', 'opeet-plafond']

/** Een nominaal bedrag met de inflatiefactor van zijn rij (voor exact één deflatie). */
export interface NominaalOpLeeftijd {
  age: number
  bedrag: number
  inflationFactor: number
}

export interface EindOorzaak {
  id: EindOorzaakId
  /** Leeftijd waarop de oorzaak zich (voor het eerst) toont, als die er is. */
  age: number | null
  /** Bijbehorend bedrag (nominaal), als dat iets zegt. */
  bedrag: NominaalOpLeeftijd | null
}

export interface EindsituatieDuidingInput {
  /** Jaarrijen van de run (oplopend of niet; de detector sorteert zelf). */
  rows: readonly UnifiedProjectionRow[]
  endForm: 'deplete' | 'legacy' | 'perpetual'
  /** Eindleeftijd van het plan (deplete/legacy); perpetual rekent tot 100. */
  endAge: number | null
  /** Nalatenschap in euro's van vandaag (P!B53). */
  legacyAmount: number
  /** P!B54 — telt niet-liquide bezit mee in de nalatenschap? */
  legacyIncludeIlliquid: boolean
  /** Ligt het stopmoment vast (stop-anker)? Dan duiden we niet. */
  vastStopmoment: boolean
  /** Het gekozen stopmoment van de run (fractioneel), of null. */
  fireAgeFractional: number | null
  /** Leeftijd vandaag (fractioneel mag). */
  currentAge: number
  /** Staat "Geen tekort-lening in mijn plan" aan (standaard ja)? */
  geenTekortLeningAan: boolean
  /** Jaaruitgaven van vandaag (euro's van vandaag) — maat voor "veel" en "bijna op". */
  jaarUitgavenNu: number
}

export interface EindsituatieDuiding {
  /** Leeftijd van de rij waarop het eindbedrag is gelezen. */
  eindAge: number
  /** Wat er op die leeftijd meer staat dan de eind-vorm vraagt (nominaal, > drempel). */
  overschot: NominaalOpLeeftijd
  /** Het laagste punt van het liquide vermogen tussen stopmoment en eind, of null. */
  dieptepunt: NominaalOpLeeftijd | null
  oorzaken: EindOorzaak[]
  context: {
    /** Overwaarde van niet-liquide bezit (vooral de eigen woning, na hypotheek, vóór opeetschuld). */
    huis: NominaalOpLeeftijd | null
    /** Openstaande opeethypotheek-schuld aan het eind. */
    opeetschuld: NominaalOpLeeftijd | null
  }
  /** Precies één bindende oorzaak gevonden. */
  eenduidig: boolean
}

/** Rijen met een stopmoment dat "nu" is: binnen een maand na vandaag. */
const NU_MARGE_JAAR = 1 / 12
/** Het liquide vermogen heet "bijna op" onder dit deel van een jaar uitgaven. */
const BIJNA_OP_FRACTIE = 0.5
/** Een reële daling van het uitgavenprofiel telt vanaf dit percentage. */
const PROFIEL_DALING = 0.1

function uitgavenOp(row: UnifiedProjectionRow, jaarUitgavenNu: number): number {
  return Math.max(0, jaarUitgavenNu) * (row.inflationFactor || 1)
}

/**
 * Jaarlijkse inflatiegroei zoals de rijen hem dragen (`inflationFactor` van twee opeenvolgende
 * jaren), of 1 als dat niet af te lezen is. Geen eigen machtsverheffing (ADR 0093).
 */
function jaarGroei(rows: readonly UnifiedProjectionRow[]): number {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    if (b.year - a.year === 1 && a.inflationFactor > 0 && b.inflationFactor > 0) {
      return b.inflationFactor / a.inflationFactor
    }
  }
  return 1
}

/**
 * Detecteer een onverwacht groot eindbedrag en de oorzaken ervan, of `null` wanneer er
 * niets te duiden valt (vast stopmoment, geen rijen, of overschot ≤ één jaar uitgaven).
 */
export function detectEindsituatie(input: EindsituatieDuidingInput): EindsituatieDuiding | null {
  if (input.vastStopmoment) return null
  if (input.rows.length === 0 || !(input.jaarUitgavenNu > 0)) return null

  const rows = [...input.rows].sort((a, b) => a.age - b.age)
  const groei = jaarGroei(rows)
  /**
   * Een jaarrij beschrijft leeftijdsjaar `age`; zijn standen (`nettoLiquide`, `netWorth`,
   * schuldsaldi) gelden aan het EIND van dat jaar, dus op leeftijd `age + 1` — dezelfde
   * conventie als `clipRowsToPlanEnd` (rijen t/m eindleeftijd − 1). De bijbehorende
   * deflator is die van het eind van het jaar: de rij-factor maal één jaar groei.
   */
  const eindFactor = (row: UnifiedProjectionRow) => (row.inflationFactor || 1) * groei
  const nom = (row: UnifiedProjectionRow, bedrag: number): NominaalOpLeeftijd => ({
    age: row.age + 1,
    bedrag,
    inflationFactor: eindFactor(row),
  })
  const eindleeftijd = input.endForm === 'perpetual' ? 100 : (input.endAge ?? rows[rows.length - 1].age)
  const binnen = rows.filter((r) => r.age < eindleeftijd)
  if (binnen.length === 0) return null
  const eindRij = binnen[binnen.length - 1]

  const fireAge = input.fireAgeFractional
  const fireRij = fireAge != null ? (binnen.find((r) => r.age >= Math.floor(fireAge)) ?? null) : null

  // ── Overschot t.o.v. het doel van de eind-vorm ────────────────────────────────
  const useI = input.endForm === 'legacy' && input.legacyIncludeIlliquid
  const model = useI ? eindRij.netWorth : eindRij.nettoLiquide
  let doel = 0
  if (input.endForm === 'legacy') {
    // gap.ts: nalatenschap × (1+i)^(eind − start) — de factor op het eind van de eindrij.
    doel = Math.max(0, input.legacyAmount) * eindFactor(eindRij)
  } else if (input.endForm === 'perpetual') {
    if (!fireRij) return null
    // gap.ts: J op de FIRE-maand, geïndexeerd tot het eind. Benadering op jaarrijen: de
    // stand aan het BEGIN van het stopjaar met de factor van dat begin.
    const jBijFire = fireRij.startNettoLiquide ?? fireRij.nettoLiquide
    doel = jBijFire * (eindFactor(eindRij) / (fireRij.inflationFactor || 1))
  }
  const overschot = model - doel
  const drempel = uitgavenOp(eindRij, input.jaarUitgavenNu)
  if (!(overschot > drempel)) return null

  const oorzaken: EindOorzaak[] = []

  // ── a3 — je kunt nu al stoppen ────────────────────────────────────────────────
  const kanNuStoppen = fireAge != null && fireAge <= input.currentAge + NU_MARGE_JAAR
  if (kanNuStoppen) oorzaken.push({ id: 'nu-stoppen', age: null, bedrag: null })

  // ── Dieptepunt van J tussen stopmoment en het jaar vóór het eind ─────────────
  const venster = binnen.filter((r) => (fireAge == null || r.age >= Math.floor(fireAge)) && r.age < eindRij.age)
  let diepste: UnifiedProjectionRow | null = null
  for (const r of venster) {
    if (diepste == null || r.nettoLiquide < diepste.nettoLiquide) diepste = r
  }
  const dieptepunt = diepste ? nom(diepste, diepste.nettoLiquide) : null
  const bijnaOp = diepste != null && diepste.nettoLiquide <= BIJNA_OP_FRACTIE * uitgavenOp(diepste, input.jaarUitgavenNu)

  // ── a1 — de geen-tekort-lening-eis bindt halverwege ───────────────────────────
  if (!kanNuStoppen && input.geenTekortLeningAan && bijnaOp && diepste) {
    oorzaken.push({ id: 'geen-tekort-lening', age: diepste.age + 1, bedrag: dieptepunt })
  }

  // ── a2 — het opeet-plafond is vóór het eind bereikt ───────────────────────────
  const plafondRij = venster.find((r) => r.opeetPlafondBereikt === true)
  if (!kanNuStoppen && plafondRij) {
    oorzaken.push({ id: 'opeet-plafond', age: plafondRij.age + 1, bedrag: null })
  }

  // Ná dit punt verklaart aangroei het overschot: het dieptepunt, anders het stopmoment.
  const draaipunt = diepste && bijnaOp ? diepste.age : fireRij ? fireRij.age : binnen[0].age
  const daarna = binnen.filter((r) => r.age > draaipunt)

  // ── b — later inkomen (AOW/pensioen/partner) dekt de behoefte ─────────────────
  const inkomenRij = daarna.find((r) => {
    // `totaalNeed` (Ont!D) heeft de partnerbijdrage al afgetrokken, `grossIncome` bevat
    // haar ook: haal haar eruit, anders telt ze dubbel.
    const behoefte = r.withdrawalNeed?.totaalNeed ?? 0
    const inkomen = r.grossIncome - (r.withdrawalNeed?.partnerBijdrage ?? 0)
    return behoefte > 0 && inkomen >= behoefte
  })
  if (inkomenRij) oorzaken.push({ id: 'later-inkomen', age: inkomenRij.age, bedrag: null })

  // ── g — late eenmalige baten (erfenis, verkoop) ───────────────────────────────
  const batenRij = daarna.find((r) => r.oneTimeNet > uitgavenOp(r, input.jaarUitgavenNu))
  if (batenRij) oorzaken.push({ id: 'late-baten', age: batenRij.age, bedrag: nom(batenRij, batenRij.oneTimeNet) })

  // ── d — het uitgavenprofiel daalt (reëel) na het stopmoment ───────────────────
  const reeel = (r: UnifiedProjectionRow) => (r.withdrawalNeed?.uitgaveTerm ?? 0) / (r.inflationFactor || 1)
  const profielStart = venster.find((r) => reeel(r) > 0)
  if (profielStart) {
    const laatste = [...binnen].reverse().find((r) => reeel(r) > 0)
    if (laatste && laatste.age > profielStart.age && reeel(laatste) < reeel(profielStart) * (1 - PROFIEL_DALING)) {
      const daling = binnen.find((r) => r.age > profielStart.age && reeel(r) > 0 && reeel(r) < reeel(profielStart) * (1 - PROFIEL_DALING))
      oorzaken.push({ id: 'dalend-profiel', age: daling?.age ?? laatste.age, bedrag: null })
    }
  }

  // ── Context: huis buiten J (c) en opeetschuld (h) ─────────────────────────────
  const nietLiquide = eindRij.netWorth - eindRij.nettoLiquide
  const opeetSaldo = eindRij.debtBalances['opeethypotheek']?.endBalance ?? 0
  // netWorth − J = niet-liquide bezit − niet-liquide schuld (hypotheek én opeetschuld).
  // Opgeteld met de opeetschuld is dat de OVERWAARDE vóór opeetschuld — zo heet hij in de
  // copy ook; een nog lopende gewone hypotheek zit er dus al af.
  const huisBedrag = nietLiquide + (opeetSaldo > 0 && !useI ? opeetSaldo : 0)
  const huis = !useI && huisBedrag > drempel ? nom(eindRij, huisBedrag) : null
  const opeetschuld = opeetSaldo >= 0.5 ? nom(eindRij, opeetSaldo) : null

  const bindend = oorzaken.filter((o) => BINDENDE_OORZAKEN.includes(o.id))

  return {
    eindAge: eindRij.age + 1,
    overschot: nom(eindRij, overschot),
    dieptepunt: bijnaOp ? dieptepunt : null,
    oorzaken,
    context: { huis, opeetschuld },
    eenduidig: bindend.length === 1,
  }
}
