// ── Codecontroles op een duiding: code dwingt af, niet de prompt ─────────────
//
// De grondslag is sinds 1F fase 2 het EIGEN bronfragment van de rij (bron_kop +
// bron_fragment), niet meer de hele opgehaalde paginatekst. Dat is de kern van
// de fase: op een overzichtspagina stonden tientallen items, dus een getal van
// een buur-item "grondde" een verzonnen bewering. Alle controles hieronder
// toetsen tegen dat eigen fragment.
//
// TWEE SOORTEN UITKOMST — de B26-tweedeling:
//
//  A. HARD AFGEWEZEN (rij → 'afgewezen', geen duiding bewaard). Alles wat de
//     duiding als PARAMETER onbruikbaar maakt, want een verkeerde parameter
//     stuurt het artikel naar de verkeerde lezer of legt een verzonnen termijn
//     op:
//       1. SCHEMA     — `duidingModelSchema` (strict).
//       2. DATUMS     — ingangsdatum/deadline geldig én gegrond in de grondslag.
//       3. DOELGROEP  — structuur: veld, operator en waarde bestaan.
//       4. G6-DOELGROEP — elke regel is lexicaal gedekt in de grondslag
//          (`doelgroep-lexicon.ts`). Fail-closed afwijzen en niet "de regel
//          weggooien": een lege doelgroep betekent IEDEREEN, dus het weggooien
//          van een ongegronde regel verbreedt het bereik in plaats van het te
//          beperken.
//
//  B. TEKSTPOORT (rij blijft 'geduid'; `samenvatting` → null, `meta.poort`
//     draagt de reden). De lezer krijgt dan de BRONKOP + de link zonder
//     samenvatting — een rij zonder tekst is nog steeds een bruikbaar bericht,
//     een rij met verzonnen tekst niet:
//       G1 `g1:ongegrond-getal` / `g1:verwijzing` — elk getal in de samenvatting
//          staat met dezelfde eenheid in de grondslag (kale claims STRENG, zie
//          `kaalStreng`), en de samenvatting verwijst nergens naar (URL, www., @).
//       G2 `g2:datum` — datums als geheel: een gewone datum staat als DAG in de
//          grondslag; een datum naast een publicatiewerkwoord moet gelijk zijn
//          aan de bron-publicatiedatum, en bestaat die niet (`eerste_gezien`),
//          dan mag er geen publicatiedatum in de samenvatting staan.
//       G3 `g3:meta` — meta-commentaar over de bron in plaats van over de regel.
//       G6 `g6:lexicon` — een domeinkwalificatie uit het gesloten lexicon die
//          niet in de grondslag staat.
//
//  C. MECHANISME — ONGEWIJZIGD en LOS van de tekstpoort: elke numerieke param
//     is plausibel én gegrond mét citaat; faalt dat, dan blijft de duiding
//     'geduid' met `mechanisme: null` en een foutcode in `duiding_fout` (keuze
//     7, 21 sep 2026) — dezelfde degradatie als `guardPersonalImpact` (ADR
//     0080). Een mechanisme degradeert dus NIET mee met de tekstpoort en
//     andersom.
//
// Levert het model zelf `samenvatting: null` (mag, B27), dan is de poort GROEN
// met reden null: dat is een keuze, geen degradatie.
//
// De foutcode is een korte, grep-bare string zónder modeltekst en landt in
// `news_articles.duiding_fout` of in `meta.poort.reden` — de meting telt erop.
// Daarom noemt een code wel het veld of de param, nooit de waarde die het model
// leverde.
//
// WAT DE GRONDSLAG MAG ZIJN: uitsluitend `bron_kop` + `bron_fragment` van DEZE
// rij. Nooit `summary` (door `categorizeArticles` herschreven), nooit
// `raw_content`/`title` van vóór ADR 0176, nooit de paginatekst van een
// overzichtspagina. De aanroeper (lib/krant/duiding.ts) bewaakt die herkomst en
// lib/krant/duiding.grondslag.test.ts legt het in de bron vast.
//
// PUUR: geen IO.

import {
  datumTokens,
  isNumericGrounded,
  numericUnitPairs,
  numericValueSet,
  zonderDatums,
  type NumericUnit,
} from '@/lib/nummer-grond'
import { isGeldigeDoelgroepWaarde, DOELGROEP_SLEUTELS, type DoelgroepSleutel } from './profiel-velden'
import {
  DOELGROEP_LEXICON,
  KWALIFICATIE_WOORDEN,
  dektEenWoord,
  heeftWaardeLexicon,
  normaliseerVoorLexicon,
} from './doelgroep-lexicon'
import { MECHANISMEN, JAAR_MIN, JAAR_MAX } from './mechanismen'
import {
  duidingModelSchema,
  DUIDING_VERSIE,
  type DoelgroepOp,
  type DuidingMeta,
  type DuidingMetaZonderPoort,
  type DuidingModelUitvoer,
  type DuidingV1,
  type Poort,
  type PublishedBron,
} from './duiding-schema'

export type ControleUitkomst =
  | {
      ok: true
      duiding: DuidingV1
      /** Gezet wanneer het mechanisme is afgevallen (keuze 7); anders null. */
      fout: string | null
    }
  | { ok: false; code: string }

/** De bron van één artikel, zoals de duidingsstap 'm aanlevert. */
export interface ControleBron {
  /** De grondslag: exact de tekst die in de prompt ging (bron_kop + bron_fragment). */
  tekst: string
  /** `news_articles.published_at` — alleen betekenisvol als `published_bron` 'feed' of 'meta' is. */
  published_at: string | null
  /** `news_articles.published_bron` (ADR 0176). */
  published_bron: PublishedBron | null
}

type Grondslag = Map<NumericUnit, Set<string>>

/** De codes van de tekstpoort. Kort en grep-baar; de meting telt erop. */
export const POORT_CODE = {
  ongegrondGetal: 'g1:ongegrond-getal',
  verwijzing: 'g1:verwijzing',
  datum: 'g2:datum',
  meta: 'g3:meta',
  lexicon: 'g6:lexicon',
} as const

/** Datums in de duiding: ingangsdata en deadlines liggen rond het aangekondigde jaar. */
const DATUM_JAAR_MIN = JAAR_MIN - 5
const DATUM_JAAR_MAX = JAAR_MAX + 5

/** Een samenvatting mag nergens naar verwijzen: geen URL, geen domein, geen adres. */
const VERWIJZING = /https?:\/\/|www\.|@/i

/**
 * G3 — meta-commentaar. Een samenvatting hoort over de REGEL te gaan, niet over
 * de bron waar het model naar keek ("de tekst bevat geen concrete bedragen",
 * "navigatie", "raadpleeg de wettekst"). Zulke zinnen zijn het teken dat het
 * model geen inhoud had; ze zijn nooit nieuws voor de lezer en verraden
 * bovendien dat er naar een overzichtspagina is gekeken.
 *
 * GESLOTEN LIJST, gemeten op 58 echte samenvattingen (1F-onderzoek, 22-09-2026):
 * ving 28 van de 58 met 0 vals-positieven. Breid 'm niet uit zonder opnieuw te
 * meten — elke toevoeging degradeert stil een terechte samenvatting.
 */
const META_PATRONEN: readonly RegExp[] = [
  /\b(de|deze)\s+(tekst|pagina|webpagina|bron)\b/i,
  /\bnavigatie\b/i,
  /\bbevat geen\b/i,
  /\bgeen concrete\b/i,
  /\ber zijn geen\b/i,
  /\bniet (vermeld|genoemd)\b/i,
  /\bverwijzingen naar\b/i,
  /\b(geraadpleegd|raadpleeg)\b/i,
  // Kaal `aankondiging` zat in regex B van het onderzoek (24/58), NIET in de
  // 0-vals-positieve brede lijst hierboven — en de prompt definieert `voorstel`
  // juist als "aangekondigd maar nog niet vastgesteld", dus een terechte
  // samenvatting van zo'n bericht mag het woord gebruiken. Alleen de META-vorm
  // telt: melden DÁT iets een aankondiging is in plaats van WÁT er verandert.
  // Twee vormen, omdat de prompt (duiding.ts, SAMENVATTING) beide verbiedt:
  // de koppelvorm ("betreft een aankondiging") en de actieve vorm ("het kabinet
  // kondigt aan dat…"). De NOMINALE vorm ("de aankondiging betreft acht
  // wetsvoorstellen") blijft bewust open: daar is de aankondiging het
  // onderwerp van een echte mededeling. Deze twee patronen zijn ONGEMETEN
  // t.o.v. de 58 samenvattingen van het 1F-onderzoek — vandaar hun eigen
  // tests, en vandaar dat de meting `g3:meta` bij `soort: voorstel` apart
  // waard is om te volgen (eindreview 1F fase 2, M4).
  /\b(bevat|is|betreft|vormt|gaat om)\s+(slechts\s+|alleen\s+|enkel\s+|uitsluitend\s+)?(een|de)\s+aankondiging\b/i,
  // De ACTIEVE stam, zonder op de afstand tot `aan` te rekenen: Nederlands
  // scheidt dat voorzetsel willekeurig ver ("kondigde vorige week een wijziging
  // in box 3 aan"), dus elke {0,n}-variant is een gok. De stam discrimineert
  // zelf al precies goed: `kondigt`/`kondigde`/`kondigen`/`kondigden` is het
  // model dat mededeelt DÁT er iets is aangekondigd, terwijl het voltooid
  // deelwoord `aangekondigd` — de vorm die de prompt bij `soort: voorstel`
  // juist toestaat — géén woordgrens vóór de stam heeft en dus doorgaat.
  /\bkondig(t|de|en|den)\b/i,
]

function isGeldigeDatum(iso: string): boolean {
  const [j, m, d] = iso.split('-').map(Number)
  if (j < DATUM_JAAR_MIN || j > DATUM_JAAR_MAX) return false
  const date = new Date(Date.UTC(j, m - 1, d))
  return date.getUTCFullYear() === j && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/**
 * Het jaar (en bij een deadline ook de dag) moet als getal in de grondslag
 * staan. Een kaal jaar of dagnummer gront op elke eenheid — "1 oktober 2026" is
 * "1" en "2026" in de tekst. Bewust NIET `kaalStreng`: dit is een harde
 * afwijzing, en die blijft op de tolerante toets staan die hij altijd had.
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

/**
 * G6 op de DOELGROEP: noemt de grondslag dit domein, en bij een keuze- of
 * meerkeuzeveld ook deze kwalificatie? Eén gedekte waarde volstaat bij `in`
 * (dat is een OF); bij `bevat` (een EN) moet elke waarde gedekt zijn.
 */
function doelgroepLexiconFout(uitvoer: DuidingModelUitvoer, grondslag: string): string | null {
  for (const regel of uitvoer.doelgroep) {
    const sleutel = regel.veld as DoelgroepSleutel
    const ingang = DOELGROEP_LEXICON[sleutel]
    if (!ingang) return `doelgroep:ongegrond:${regel.veld}`
    if (!dektEenWoord(grondslag, ingang.sleutel)) return `doelgroep:ongegrond:${regel.veld}`
    if (!heeftWaardeLexicon(sleutel)) continue
    const gedekt = regel.waarden.map((w) => dektEenWoord(grondslag, ingang.waarden[w] ?? []))
    const genoeg = regel.op === 'bevat' ? gedekt.every(Boolean) : gedekt.some(Boolean)
    if (!genoeg) return `doelgroep:ongegrond:${regel.veld}`
  }
  return null
}

// ── De tekstpoort (B26) ──────────────────────────────────────────────────────

/** G1 — elk getal in de samenvatting, kale claims streng; plus de verwijzingscontrole. */
function g1Fout(samenvatting: string, grondslag: Grondslag): string | null {
  if (VERWIJZING.test(samenvatting)) return POORT_CODE.verwijzing
  // Datums horen bij G2: die worden als GEHEEL getoetst, niet als losse cijfers.
  for (const { value, unit } of numericUnitPairs(zonderDatums(samenvatting))) {
    if (!isNumericGrounded(grondslag, value, unit, { kaalStreng: true })) return POORT_CODE.ongegrondGetal
  }
  return null
}

/**
 * G2 — datums als geheel.
 *
 * Een datum NAAST een publicatiewerkwoord is een uitspraak over de bron, niet
 * over de regel: die wordt tegen de bronmetadata getoetst en niet tegen de
 * tekst. Staat `published_bron` op 'eerste_gezien' (of ontbreekt hij), dan is
 * er geen publicatiedatum die we kennen — élke publicatiedatum in de
 * samenvatting is dan verzonnen. Dat is precies de bf458a7b-fout: de oude
 * ingest zette `published_at` op middernacht van het ophaalmoment, de prompt
 * droeg dat als "Datum:", en het model schreef het terug als "gepubliceerd op
 * 1 januari 2026".
 *
 * Elke andere datum moet als DAG in de grondslag staan — niet als losse
 * cijfers, want die staan er bijna altijd wel érgens.
 */
function g2Fout(samenvatting: string, bron: ControleBron, grondslagDatums: ReadonlySet<string>): string | null {
  const uitBronmetadata = bron.published_bron === 'feed' || bron.published_bron === 'meta'
  const bronDatum = uitBronmetadata ? (bron.published_at ?? '').slice(0, 10) : null
  for (const datum of datumTokens(samenvatting)) {
    if (datum.bijPublicatie) {
      if (!bronDatum || bronDatum !== datum.iso) return POORT_CODE.datum
      continue
    }
    if (!grondslagDatums.has(datum.iso)) return POORT_CODE.datum
  }
  return null
}

/** G3 — meta-commentaar over de bron in plaats van over de regel. */
function g3Fout(samenvatting: string): string | null {
  return META_PATRONEN.some((p) => p.test(samenvatting)) ? POORT_CODE.meta : null
}

/** G6 op de SAMENVATTING: een kwalificatie uit het gesloten lexicon die de grondslag niet maakt. */
function g6Fout(samenvatting: string, grondslag: string): string | null {
  const tekst = normaliseerVoorLexicon(samenvatting)
  for (const woord of KWALIFICATIE_WOORDEN) {
    const genormaliseerd = normaliseerVoorLexicon(woord)
    if (tekst.includes(genormaliseerd) && !grondslag.includes(genormaliseerd)) return POORT_CODE.lexicon
  }
  return null
}

/**
 * De volledige tekstpoort. Volgorde is betekenisvol: G1 (het getal) vóór G2
 * (de datum) vóór G3 (het meta-commentaar) vóór G6 (de kwalificatie) — van de
 * meest concrete tot de meest talige fout, zodat de reden die in de meting
 * landt de scherpste is.
 */
function poortReden(
  samenvatting: string,
  bron: ControleBron,
  grondslag: Grondslag,
  grondslagDatums: ReadonlySet<string>,
  grondslagWoorden: string,
): string | null {
  return (
    g1Fout(samenvatting, grondslag) ??
    g2Fout(samenvatting, bron, grondslagDatums) ??
    g3Fout(samenvatting) ??
    g6Fout(samenvatting, grondslagWoorden)
  )
}

// ── Mechanisme (ongewijzigd) ─────────────────────────────────────────────────

/** Whitespace en typografische tekens gelijktrekken, zodat een letterlijk citaat ook na stripHtml matcht. */
function normaliseerTekst(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/[„“”"'’‘`]/g, '')
    .replace(/[ \s]+/g, ' ')
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
    // `kaalStreng`, net als G1 op de samenvatting (eindreview 1F fase 2, M2).
    // Zonder dit gront een KALE param (`jaar`, `vanaf_jaar`,
    // `verschuiving_maanden`) op een € of % elders in het fragment: bij
    // "AOW-leeftijd gaat in 2033 omhoog; de levensverwachting steeg met 3
    // procent" zou `verschuiving_maanden: 3` gronden op die 3 procent, mét een
    // citaat dat letterlijk in de bron staat en het getal bevat — de citaateis
    // sluit dat gat dus niet. Deze route is juist de SYSTEMISCHE: een param
    // komt via impact.ts als bedrag bij iedere lezer in de doelgroep op het
    // scherm, terwijl de tekstpoort alleen de samenvatting degradeert. De
    // strengere toets hoort dus hier minstens zo hard te staan.
    if (!isNumericGrounded(grondslag, token, regel.eenheid, { kaalStreng: true })) return `ongegrond:${naam}`
    const citaat = citaten.get(naam)
    if (!citaat) return `geen-citaat:${naam}`
    if (!bronGenormaliseerd.includes(normaliseerTekst(citaat))) return `citaat-niet-in-bron:${naam}`
    const inCitaat = numericUnitPairs(citaat).some((p) => p.value === token)
    if (!inCitaat) return `citaat-zonder-getal:${naam}`
  }
  return null
}

/**
 * Toets de modeluitvoer tegen de grondslag en lever de opgeslagen vorm op.
 *
 * @param uitvoer Ruwe uitvoer van generateObject (unknown: het schema beslist).
 * @param bron    De grondslag (bron_kop + bron_fragment van DEZE rij) plus de
 *                bronmetadata die G2 nodig heeft. Nooit modeltekst — zie de kop.
 * @param meta    Door code gezet: welke grondslag, haar hash, hoeveel tekens,
 *                welk model. De poort wordt hier toegevoegd.
 */
export function controleerDuiding(
  uitvoer: unknown,
  bron: ControleBron,
  meta: DuidingMetaZonderPoort,
): ControleUitkomst {
  const parsed = duidingModelSchema.safeParse(uitvoer)
  if (!parsed.success) return { ok: false, code: 'schema' }
  const d = parsed.data

  const grondslag = numericValueSet(bron.tekst)
  const grondslagDatums = new Set(datumTokens(bron.tekst).map((t) => t.iso))
  const grondslagWoorden = normaliseerVoorLexicon(bron.tekst)

  // ── A. Hard afgewezen ──────────────────────────────────────────────
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

  const dgLexicon = doelgroepLexiconFout(d, grondslagWoorden)
  if (dgLexicon) return { ok: false, code: dgLexicon }

  // ── B. Tekstpoort ──────────────────────────────────────────────────
  // Een model dat zelf null levert (B27) is groen: dat is een keuze, geen
  // degradatie, en er valt niets te toetsen.
  const reden = d.samenvatting === null ? null : poortReden(d.samenvatting, bron, grondslag, grondslagDatums, grondslagWoorden)
  const poort: Poort = reden ? { status: 'gedegradeerd', reden } : { status: 'groen', reden: null }
  const samenvatting = reden ? null : d.samenvatting

  // ── C. Mechanisme (los van de poort) ───────────────────────────────
  const mFout = mechanismeFout(d, bron.tekst, grondslag)
  const mechanisme = mFout ? null : d.mechanisme
  // Alleen citaten bij GEVULDE numerieke params van het gekozen mechanisme
  // worden bewaard: dat is het bewijs voor beheer (fase 2) en 1B, niets anders.
  //
  // De `typeof === 'number'`-eis is niet cosmetisch. `mechanismeFout` toetst een
  // citaat (staat het letterlijk in de bron, bevat het het getal) uitsluitend
  // voor params die het model daadwerkelijk met een getal vulde. Bewaarden we
  // hier ook het citaat van een param die op null staat, dan glipte tot 300
  // tekens ONGETOETSTE modeltekst de jsonb in en werd die in beheer als
  // letterlijk broncitaat getoond — naast een lege waarde (security-review 1F
  // fase 2, bevinding 2). Juist nu de grondslag kort is, zijn lege params de
  // norm geworden en is dat pad goed bereikbaar.
  const grond: Record<string, string> = {}
  if (mechanisme) {
    const numeriek = MECHANISMEN[mechanisme.soort].numeriek
    const params = mechanisme.params as Record<string, unknown>
    for (const g of d.grond) {
      if (g.param in numeriek && typeof params[g.param] === 'number') grond[g.param] = g.citaat
    }
  }

  const volledigeMeta: DuidingMeta = { ...meta, poort }
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
      samenvatting,
      grond,
      meta: volledigeMeta,
    },
  }
}
