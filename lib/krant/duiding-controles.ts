// ── Codecontroles op een duiding: code dwingt af, niet de prompt ─────────────
//
// Vijf controles, in deze volgorde, allemaal puur (geen IO):
//
//   1. SCHEMA        — `duidingModelSchema` (strict). Onbekend veld, onbekende
//                      enum, onbekend mechanisme → afgewezen ('schema').
//   2. DATUMS        — geldig én gegrond: het jaar van een ingangsdatum en het
//                      jaar + de dag van een deadline staan in de brontekst.
//                      Een verzonnen "aanvraag vóór 1 oktober" is precies de
//                      druk op de lezer die het schema moet uitsluiten.
//   3. DOELGROEP     — elk veld en elke waarde bestaat in `profiel-velden.ts`;
//                      een jaartal-veld draagt een geldig jaar → anders afgewezen.
//   4. SAMENVATTING  — elk getal dat de samenvatting (B3) noemt staat, met
//                      dezelfde eenheid, in de brontekst; geen verwijzingen
//                      (URL, www., @) — daar heeft een geïnjecteerde zin niets
//                      anders om zich aan vast te grijpen → anders afgewezen.
//   5. MECHANISME    — elke numerieke param is (a) plausibel binnen de grenzen
//                      van de catalogus en (b) gegrond: het getal staat met de
//                      juiste eenheid in de brontekst én het model gaf er een
//                      citaat bij dat letterlijk in de bron staat en het getal
//                      bevat. Faalt dit, dan blijft de duiding 'geduid' MET
//                      `mechanisme: null` en een foutcode (keuze 7, 21 sep
//                      2026): het artikel blijft via zijn doelgroep relevant,
//                      zonder getal — dezelfde degradatie als
//                      `guardPersonalImpact` (ADR 0080). Een getal komt er in
//                      geen van beide gevallen door.
//
// Drempels bij naam (`mechanisme.drempel`) zijn een enum in het schema en
// slaan de gronding over: er is geen bedrag om te gronden.
//
// De foutcode is een korte, grep-bare string zónder modeltekst en landt in
// `news_articles.duiding_fout` — de meting telt erop. Daarom noemt een code
// wel het veld of de param, nooit de waarde die het model leverde.
//
// WAT DE BRONTEKST MAG ZIJN: uitsluitend échte brontekst — titel, de rauwe
// teaser en de opgehaalde paginatekst. Nooit `summary` (dat is de door
// `categorizeArticles` herschreven samenvatting) en nooit eerdere modeluitvoer:
// een getal dat een vorige modelstap verzon zou anders deze stap "gronden".
// De aanroeper (lib/krant/duiding.ts) bewaakt die herkomst.

import { isNumericGrounded, numericUnitPairs, numericValueSet, type NumericUnit } from '@/lib/nummer-grond'
import { isGeldigeDoelgroepWaarde, DOELGROEP_SLEUTELS, type DoelgroepSleutel } from './profiel-velden'
import { MECHANISMEN, JAAR_MIN, JAAR_MAX } from './mechanismen'
import {
  duidingModelSchema,
  DUIDING_VERSIE,
  type DoelgroepOp,
  type DuidingMeta,
  type DuidingModelUitvoer,
  type DuidingV1,
} from './duiding-schema'

export type ControleUitkomst =
  | {
      ok: true
      duiding: DuidingV1
      /** Gezet wanneer het mechanisme is afgevallen (keuze 7); anders null. */
      fout: string | null
    }
  | { ok: false; code: string }

type Grondslag = Map<NumericUnit, Set<string>>

/** Datums in de duiding: ingangsdata en deadlines liggen rond het aangekondigde jaar. */
const DATUM_JAAR_MIN = JAAR_MIN - 5
const DATUM_JAAR_MAX = JAAR_MAX + 5

/** Een samenvatting mag nergens naar verwijzen: geen URL, geen domein, geen adres. */
const VERWIJZING = /https?:\/\/|www\.|@/i

function isGeldigeDatum(iso: string): boolean {
  const [j, m, d] = iso.split('-').map(Number)
  if (j < DATUM_JAAR_MIN || j > DATUM_JAAR_MAX) return false
  const date = new Date(Date.UTC(j, m - 1, d))
  return date.getUTCFullYear() === j && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/**
 * Het jaar (en bij een deadline ook de dag) moet als getal in de bron staan.
 * Een kaal jaar of dagnummer gront op elke eenheid — "1 oktober 2026" is
 * "1" en "2026" in de tekst.
 */
function datumFout(iso: string, veld: 'ingangsdatum' | 'deadline', grondslag: Grondslag): string | null {
  if (!isGeldigeDatum(iso)) return `datum:${veld}`
  const [j, , d] = iso.split('-').map(Number)
  if (!isNumericGrounded(grondslag, String(j), 'bare')) return `datum:ongegrond:${veld}`
  if (veld === 'deadline' && !isNumericGrounded(grondslag, String(d), 'bare')) return `datum:ongegrond:${veld}`
  return null
}

/**
 * Welke operator past bij welk soort veld. `is` = precies één waarde; `in` =
 * één van meerdere; `bevat` = alleen op een meerkeuzeveld; `minstens`/
 * `hoogstens` = alleen op een geordend veld (band of jaartal).
 */
const TOEGESTANE_OPS: Record<(typeof DOELGROEP_SLEUTELS)[DoelgroepSleutel]['soort'], readonly DoelgroepOp[]> = {
  jaartal: ['is', 'minstens', 'hoogstens'],
  keuze: ['is', 'in'],
  meerkeuze: ['bevat', 'in'],
  band: ['is', 'in', 'minstens', 'hoogstens'],
}

function doelgroepFout(uitvoer: DuidingModelUitvoer): string | null {
  for (const regel of uitvoer.doelgroep) {
    const sleutel = regel.veld as DoelgroepSleutel
    const def = DOELGROEP_SLEUTELS[sleutel]
    if (!def) return `onbekend-veld:${regel.veld}`
    if (!TOEGESTANE_OPS[def.soort].includes(regel.op)) return `onbekende-operator:${regel.veld}`
    if ((regel.op === 'is' || regel.op === 'minstens' || regel.op === 'hoogstens') && regel.waarden.length !== 1) {
      return `onbekende-operator:${regel.veld}`
    }
    for (const waarde of regel.waarden) {
      if (!isGeldigeDoelgroepWaarde(sleutel, waarde)) return `onbekende-waarde:${regel.veld}`
    }
  }
  return null
}

function samenvattingFout(samenvatting: string, grondslag: Grondslag): string | null {
  if (VERWIJZING.test(samenvatting)) return 'samenvatting:verwijzing'
  for (const { value, unit } of numericUnitPairs(samenvatting)) {
    if (!isNumericGrounded(grondslag, value, unit)) return 'ongegrond:samenvatting'
  }
  return null
}

/** Whitespace en typografische tekens gelijktrekken, zodat een letterlijk citaat ook na stripHtml matcht. */
function normaliseerTekst(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/[„“”"'’‘`]/g, '')
    .replace(/[ \s]+/g, ' ')
    .replace(/[–—]/g, '-')
    .trim()
}

/**
 * Plausibiliteit + gronding van het mechanisme. Geeft de foutcode van de
 * eerste param die faalt, of null als alles klopt.
 */
function mechanismeFout(uitvoer: DuidingModelUitvoer, brontekst: string, grondslag: Grondslag): string | null {
  const mech = uitvoer.mechanisme
  if (!mech) return null
  const def = MECHANISMEN[mech.soort]
  const params = mech.params as Record<string, unknown>
  const citaten = new Map(uitvoer.grond.map((g) => [g.param, g.citaat] as const))
  const bronGenormaliseerd = normaliseerTekst(brontekst)

  if (def.minstensEen) {
    const gevuld = def.minstensEen.some((naam) => params[naam] !== null && params[naam] !== undefined)
    if (!gevuld) return 'leeg-mechanisme'
  }

  for (const [naam, waarde] of Object.entries(params)) {
    if (typeof waarde !== 'number') continue
    const regel = def.numeriek[naam]
    // Het schema laat alleen bekende namen door; een getal zonder regel is een
    // catalogusfout, geen modelfout — fail-closed.
    if (!regel) return `onbekende-param:${naam}`
    if (!Number.isFinite(waarde) || waarde < regel.min || waarde > regel.max) {
      return `onplausibel:${naam}`
    }
    // Het teken zit niet in de tokenizer (−0,25 procentpunt); gronding op de absolute waarde.
    const token = String(Math.abs(waarde))
    if (!isNumericGrounded(grondslag, token, regel.eenheid)) return `ongegrond:${naam}`
    const citaat = citaten.get(naam)
    if (!citaat) return `geen-citaat:${naam}`
    if (!bronGenormaliseerd.includes(normaliseerTekst(citaat))) return `citaat-niet-in-bron:${naam}`
    const inCitaat = numericUnitPairs(citaat).some((p) => p.value === token)
    if (!inCitaat) return `citaat-zonder-getal:${naam}`
  }
  return null
}

/**
 * Toets de modeluitvoer tegen de brontekst en lever de opgeslagen vorm op.
 *
 * @param uitvoer   Ruwe uitvoer van generateObject (unknown: het schema beslist).
 * @param brontekst Alles waaruit een getal legitiem mag komen: titel + rauwe
 *                  teaser (+ de paginatekst). Nooit modeltekst — zie de kop.
 * @param meta      Door code gezet: welke brontekst, hoeveel tekens, welk model.
 */
export function controleerDuiding(
  uitvoer: unknown,
  brontekst: string,
  meta: DuidingMeta,
): ControleUitkomst {
  const parsed = duidingModelSchema.safeParse(uitvoer)
  if (!parsed.success) return { ok: false, code: 'schema' }
  const d = parsed.data

  const grondslag = numericValueSet(brontekst)

  if (d.ingangsdatum) {
    const fout = datumFout(d.ingangsdatum, 'ingangsdatum', grondslag)
    if (fout) return { ok: false, code: fout }
  }
  if (d.deadline) {
    const fout = datumFout(d.deadline.datum, 'deadline', grondslag)
    if (fout) return { ok: false, code: fout }
  }

  const dgFout = doelgroepFout(d)
  if (dgFout) return { ok: false, code: dgFout }

  const svFout = samenvattingFout(d.samenvatting, grondslag)
  if (svFout) return { ok: false, code: svFout }

  const mFout = mechanismeFout(d, brontekst, grondslag)
  const mechanisme = mFout ? null : d.mechanisme
  // Alleen citaten bij numerieke params van het gekozen mechanisme worden
  // bewaard: dat is het bewijs voor beheer (fase 2) en 1B, niets anders.
  const grond: Record<string, string> = {}
  if (mechanisme) {
    const numeriek = MECHANISMEN[mechanisme.soort].numeriek
    for (const g of d.grond) {
      if (g.param in numeriek) grond[g.param] = g.citaat
    }
  }

  return {
    ok: true,
    fout: mFout,
    duiding: {
      versie: DUIDING_VERSIE,
      soort: d.soort,
      ingangsdatum: d.ingangsdatum,
      deadline: d.deadline,
      doelgroep: d.doelgroep,
      mechanisme,
      samenvatting: d.samenvatting,
      grond,
      meta,
    },
  }
}
