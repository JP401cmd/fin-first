#!/usr/bin/env node
/**
 * check-productiecijfers — lint-gate tegen productiegegevens in een publiek
 * gecommitte migratie of ADR (ADR 0111).
 *
 * AANLEIDING. `supabase/migrations/**` en `docs/adr/**` zijn de twee plekken waar
 * we gewoontegetrouw ONS HUISWERK opschrijven: "gemeten op remote, N rijen /
 * X MB", "op het eigenaar-account: €N". Dat is goede engineering-hygiëne — en het
 * staat in een PUBLIEKE repo. Drie klassen liepen zo naar buiten:
 *
 *   A. gegevens op RECORDNIVEAU — vier individuele spaardoelbedragen van vier
 *      verschillende echte gebruikers in een migratiecommentaar;
 *   B. het GEBRUIKERS-/ACCOUNTAANTAL — commercieel verraderlijker dan een
 *      rijaantal: een rijaantal zegt een concurrent weinig, een gebruikersaantal
 *      zegt precies waar het product staat;
 *   C. een DIRECTE IDENTIFIER naast een vermogenscijfer — een ADR die een
 *      e-mailadres noemt en in dezelfde zin het vermogen van dat account.
 *
 * Klasse C is meteen de reden dat dit script bestaat en niet een afspraak. De
 * vorige schoonverklaring leunde op "we hebben een uuid- en e-mailregex gedraaid,
 * nul treffers". Er stond een e-mailadres in `docs/adr/0027`, pal naast een
 * vermogensbedrag. Een handmatige regex-ronde is geen gate: hij wordt één keer
 * gedraaid, door één persoon, en daarna geloofd. Dit script draait bij elke push.
 *
 * NORM (ADR 0111). Exacte productiemetingen horen in een rapport BUITEN git; in
 * code, migratiecommentaar en ADR's formuleer je RELATIEF ("een tabel in de orde
 * van tienduizenden rijen", "FIRE schuift enkele jaren later"). En nooit gegevens
 * op recordniveau, ook niet zonder identifier ernaast.
 *
 * ── Bewust NAUW gescoped ────────────────────────────────────────────────────
 * Alleen `supabase/migrations/**.sql` en `docs/adr/**.md`. Een te brede gate wordt
 * uitgezet, en dan is hij minder waard dan geen gate. ADR's staan vol LEGITIEME
 * getallen — fiscale constanten, forfaits, seed-calculators met voorbeeldbedragen,
 * jaartallen, percentages. Die mogen niet raken. Daarom:
 *
 *   * NUL telt nooit. "0 conflicterende groepen", "0 rijen met account_id IS NULL"
 *     zegt dat iets NIET bestaat — dat is afwezigheid, geen schaal, en het is
 *     meestal het hele argument van de migratie. Een nul scrubben is theater.
 *   * EURO-bedragen tellen alléén binnen een als productiemeting gemarkeerd blok
 *     (zie MEASUREMENT_MARKERS). Buiten zo'n blok is een euro-bedrag een fiscale
 *     constante of een voorbeeld, en daar blijft de gate vanaf.
 *   * Een ontsnappingsmarker maakt een bewuste uitzondering mogelijk zonder de
 *     hele gate uit te zetten (zie ESCAPE).
 *
 * ── Wat deze gate NIET ziet (gemeten, niet gegokt) ──────────────────────────
 *  a. ANDERE PADEN. `specs/**`, `lib/**.test.ts`, `scripts/**` en `docs/**` buiten
 *     `adr/` worden NIET gescand. Dat is een scope-keuze, geen dekkingsbewijs:
 *     er staan vandaag echte eigenaar-cijfers en e-mailadressen in o.a.
 *     `lib/horizon/networth-rows.test.ts`, `scripts/horizon-oracle/**` en
 *     `specs/bank-connect-doelrekening/live-testplan.md`. Verbreden kan, maar pas
 *     nadat die paden zijn opgeruimd — anders start de gate rood en wordt hij
 *     genegeerd.
 *  b. PARAFRASE. "een kleine honderd gebruikers" ontwijkt elke cijferregex. De
 *     gate vangt de vorm waarin dit feitelijk fout ging, niet elk denkbaar lek.
 *  c. CONTEXT. Hij kan niet zien of een bedrag van een echt account komt of uit
 *     een fixture. Vandaar de markerregel voor euro's: die benadert de intentie.
 *
 * Kortom: een vangrail voor de bewezen faalvormen, geen dekkingsbewijs.
 *
 * Run:  npm run check:productiecijfers  (of: node scripts/check-productiecijfers.mjs)
 * Flags: --list  print elke treffer inclusief de bekende rest (om te herijken).
 *
 * Exit 0 = geen nieuwe overtredingen. Exit 1 = nieuwe treffer, of een
 * residue-entry die geen overtreding meer is.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN = [
  { dir: 'supabase/migrations', ext: /\.sql$/ },
  { dir: 'docs/adr', ext: /\.md$/ },
]

/**
 * Ontsnappingsmarker. Zet 'm op de regel zelf of op de regel erboven:
 *   -- productiecijfer-ok: <reden>          (SQL)
 *   <!-- productiecijfer-ok: <reden> -->    (Markdown)
 * De reden is verplicht en moet iets zeggen — "ok" of "n.v.t." is geen reden.
 * Bedoeld voor het zeldzame geval dat een exact getal het argument DRAAGT en
 * niet herleidbaar is (bv. een extern gepubliceerd cijfer).
 */
const ESCAPE = /productiecijfer-ok:\s*\S.{3,}/
/**
 * Een marker dekt zijn eigen regel én de ESCAPE_WINDOW regels erna. Een meetblok
 * beslaat in de praktijk een paar regels (een tabel, een opsomming); één marker
 * per blok is leesbaar, één marker per regel is ruis die niemand onderhoudt.
 */
const ESCAPE_WINDOW = 4

/**
 * Markers die een blok als PRODUCTIEMETING aanmerken.
 *
 * DIT IS DE KERN VAN DE GATE. Een getal op zichzelf zegt niets: `LIMIT 1000`,
 * "2 GB werkgeheugen", "een batch van 250 transacties" en "twee gebruikers die
 * dezelfde broker gebruiken" zijn ontwerpparameters en hypothetische scenario's,
 * geen metingen. Wat een getal tot productiegegeven maakt is de mededeling
 * eromheen: "gemeten op remote", "pre-flight", "op het eigenaar-account".
 *
 * Een eerdere opzet flagde élk getal bij een eenheidswoord en kwam op 54 treffers
 * waarvan de overgrote meerderheid ontwerpparameters — precies de te-brede gate
 * die volgens ADR 0111 §risico's binnen een week wordt uitgezet. De markereis
 * brengt dat terug tot de blokken waar we daadwerkelijk ons huiswerk opschrijven.
 *
 * Het venster is MEASUREMENT_WINDOW regels ná de marker: ruim genoeg voor een
 * meetblok, te klein om een halve ADR mee te trekken.
 */
const MEASUREMENT_MARKERS = new RegExp(
  [
    'gemeten op',
    'meting \\d',
    'productie-?meting',
    'pre-flight',
    'nagemeten',
    'op remote',
    'op productie',
    'volume op',
    'pg_stat',
    'via execute_sql',
    'geverifieerd \\d',
    'referentie-account',
    'op (het |een )?(eigen|eigenaar|echt)(-| )account',
    'eigenaar-account',
    'echt account',
    'firsthand',
  ].join('|'),
  'i',
)
const MEASUREMENT_WINDOW = 12

// ── Regel 1 — directe identifiers ───────────────────────────────────────────
// Een e-mailadres in een migratie of ADR wijst per definitie een persoon aan.
// Rolzadressen en voorbeelddomeinen zijn vrijgesteld.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const EMAIL_OK =
  /^(support|noreply|no-reply|info|privacy|security|beheer|contact)@|@(example\.(com|org|net)|test\.trifinity\.nl|sentry\.io|supabase\.(io|com))$/i

// ── Regel 2 — platte credentials ────────────────────────────────────────────
// Een wachtwoord of sleutel letterlijk in een migratie. Dit is de zwaarste regel:
// een gecommit wachtwoord in een publieke repo is een directe inlogroute zolang
// het account bestaat en het wachtwoord niet is geroteerd.
const CREDENTIAL_RES = [
  { re: /(?:^|\s)(?:password|wachtwoord|passwd|pwd)\s*[:=]\s*\S{4,}/gi, what: 'wachtwoord in platte tekst' },
  { re: /\bcrypt\(\s*'[^']{4,}'/gi, what: "letterlijk wachtwoord in crypt('…')" },
  { re: /\b(eyJ[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{10,}|service_role_key\s*[:=]\s*\S+)/g, what: 'sleutel/JWT' },
]

// ── Regel 3 — productieomvang ───────────────────────────────────────────────
// Nederlandse duizendscheiding is een punt: 37.002, 495.432. Ook 900k / 1,2M.
const NUM = String.raw`\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?\s*[kKmM]\b|\d+`
const UNITS_ROWS = String.raw`rijen|records|regels|transacties|doelen|snapshots|posities`
const UNITS_PEOPLE = String.raw`gebruikers|accounts|productieaccounts|huishoudens|leden|klanten|abonnees`
const UNITS_SIZE = String.raw`[KMGT]B`

/**
 * SCALE_RES vuren UITSLUITEND binnen een meetblok (zie MEASUREMENT_MARKERS).
 * Buiten zo'n blok is een getal bij een eenheidswoord een ontwerpparameter.
 */
const SCALE_RES = [
  { re: new RegExp(String.raw`\b(${NUM})\s+(${UNITS_ROWS})\b`, 'gi'), what: 'exacte tabelomvang' },
  { re: new RegExp(String.raw`\b(${NUM})\s+(${UNITS_PEOPLE})\b`, 'gi'), what: 'exact gebruikers-/accountaantal' },
  { re: new RegExp(String.raw`\b(${NUM})\s*(${UNITS_SIZE})\b`, 'g'), what: 'opslaggrootte' },
  { re: new RegExp(String.raw`€\s?(${NUM})`, 'g'), what: 'euro-bedrag binnen een productiemeting' },
]

/**
 * POPULATIE-woorden gaan ALTIJD af, ook zonder meetmarker: ze gaan per definitie
 * over ONZE productiepopulatie en komen niet voor in een hypothetisch scenario.
 * Dit is het accountaantal uit ADR 0099 ("Vier van de vijf productieaccounts") —
 * uitgeschreven, dus onvindbaar voor elke cijferregex. Het woord zelf is de vondst.
 *
 * Bewust GEEN generieke getalwoord-regel ("twee gebruikers"): dat is bijna altijd
 * een scenario ("twee gebruikers die dezelfde broker gebruiken"), en die regel
 * leverde in de proefrun alleen maar valse positieven op.
 */
const POPULATION_RE = new RegExp(
  [
    // een AANTAL (cijfer of uitgeschreven) vóór een populatiewoord —
    // "Vier van de vijf productieaccounts". Zonder aantal is het juist de
    // RELATIEVE formulering die de norm voorschrijft ("vrijwel alle
    // productieaccounts"), en die mag de gate niet afkeuren.
    String.raw`\b(?:\d+|een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)` +
      String.raw`(?:\s+van\s+de\s+(?:\d+|een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien))?` +
      String.raw`\s+(?:productieaccounts?|productiegebruikers?)\b`,
    // deze woorden ZIJN een telling, ook zonder cijfer ernaast
    String.raw`\b(?:gebruikersaantal|accountaantal)\b`,
  ].join('|'),
  'gi',
)

/**
 * Bekende rest — deze lijst MOET krimpen en mag nooit groeien.
 *
 * Sleutel: `<pad>::<regel-id>`. Elke run print 'm luid. Een entry die géén
 * overtreding meer is, is een HARDE fout: zo kan de lijst niet stil blijven
 * hangen nadat het probleem is opgelost (spiegel COLUMN_RULE_RESIDUE in
 * scripts/check-client-data-reads.mjs).
 *
 * Voeg hier NIETS aan toe om een nieuwe overtreding stil te krijgen. Dat is
 * precies wat deze gate hoort te vangen.
 */
const RESIDUE = new Map([
  [
    'supabase/migrations/20260325000002_create_landing_test_users.sql::credential',
    'ACUUT — openstaand credential-punt. Details en de herstelroute staan bewust NIET ' +
      'hier: deze repo is publiek en dit bestand wordt bij elke run luid geprint, dus een ' +
      'beschrijving van wat er precies bloot ligt en of dat nog leeft, is zelf een ' +
      'wegwijzer. Zie de kaart "Productieomvang staat in een publiek gecommitte migratie" ' +
      '(R6) voor de aard, de status en de vereiste productie-actie.',
  ],
])

function walk(dir, ext) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    let s
    try {
      s = statSync(p)
    } catch {
      continue
    }
    if (s.isDirectory()) out.push(...walk(p, ext))
    else if (ext.test(name)) out.push(p)
  }
  return out
}

/** Is dit getal een "nul"? Dan zegt het afwezigheid, geen schaal. */
function isZero(raw) {
  return /^0+([.,]0+)?$/.test(String(raw).trim())
}

function scanFile(rel, src) {
  const lines = src.split(/\r?\n/)
  const hits = []
  let measureUntil = -1

  const push = (i, rule, what, sample) => {
    // Ontsnappingsmarker op deze regel of binnen ESCAPE_WINDOW regels erboven?
    for (let k = i; k >= 0 && k >= i - ESCAPE_WINDOW; k--) {
      if (ESCAPE.test(lines[k])) return
    }
    hits.push({ rel, line: i + 1, rule, what, sample })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (MEASUREMENT_MARKERS.test(line)) measureUntil = i + MEASUREMENT_WINDOW

    // Regel 1 — e-mailadres
    EMAIL_RE.lastIndex = 0
    let m
    while ((m = EMAIL_RE.exec(line))) {
      if (EMAIL_OK.test(m[0])) continue
      push(i, 'identifier', 'e-mailadres (directe identifier)', m[0])
    }

    // Regel 2 — credentials
    for (const { re, what } of CREDENTIAL_RES) {
      re.lastIndex = 0
      while ((m = re.exec(line))) push(i, 'credential', what, m[0].trim().slice(0, 60))
    }

    // Regel 3 — omvang, UITSLUITEND binnen een meetblok
    if (i <= measureUntil) {
      for (const { re, what } of SCALE_RES) {
        re.lastIndex = 0
        while ((m = re.exec(line))) {
          if (isZero(m[1])) continue // nul = afwezigheid, geen schaal
          push(i, 'omvang', what, m[0].trim())
        }
      }
    }

    // Regel 4 — populatiewoorden, altijd
    POPULATION_RE.lastIndex = 0
    while ((m = POPULATION_RE.exec(line))) {
      push(i, 'populatie', 'uitspraak over de productiepopulatie', m[0].trim())
    }
  }
  return hits
}

const all = []
for (const { dir, ext } of SCAN) {
  for (const file of walk(join(ROOT, dir), ext)) {
    const rel = relative(ROOT, file).split('\\').join('/')
    all.push(...scanFile(rel, readFileSync(file, 'utf8')))
  }
}
all.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line)

const keyOf = (h) => `${h.rel}::${h.rule}`
const seenKeys = new Set(all.map(keyOf))

if (process.argv.includes('--list')) {
  console.log(`${all.length} treffer(s) in ${SCAN.map((s) => s.dir).join(' + ')}:`)
  for (const h of all) {
    const known = RESIDUE.has(keyOf(h)) ? '  [bekende rest]' : ''
    console.log(`  ${h.rel}:${h.line}  [${h.rule}] ${h.what} — ${h.sample}${known}`)
  }
  process.exit(0)
}

const violations = all.filter((h) => !RESIDUE.has(keyOf(h)))
const openResidue = [...new Set(all.filter((h) => RESIDUE.has(keyOf(h))).map(keyOf))].sort()
const staleResidue = [...RESIDUE.keys()].filter((k) => !seenKeys.has(k)).sort()

if (openResidue.length > 0) {
  console.log('⚠  Openstaande rest op de productiecijfer-regel — deze lijst MOET krimpen:')
  for (const k of openResidue) {
    console.log(`   - ${k}`)
    console.log(`     ${RESIDUE.get(k)}`)
  }
  console.log('')
}

if (staleResidue.length > 0) {
  console.error('✗ RESIDUE bevat entries die geen overtreding meer zijn — haal ze weg, anders dekt')
  console.error('  de rest-lijst stilzwijgend een toekomstige regressie af:')
  for (const k of staleResidue) console.error(`   ${k}`)
  process.exit(1)
}

if (violations.length > 0) {
  console.error('✗ Productiegegevens in een publiek gecommit bestand (ADR 0111).')
  console.error('')
  for (const h of violations) {
    console.error(`   ${h.rel}:${h.line}`)
    console.error(`      [${h.rule}] ${h.what} — ${h.sample}`)
  }
  console.error('')
  console.error('WAAROM dit hard faalt: deze repo is PUBLIEK. Een exacte tabelomvang is nog te billijken,')
  console.error('maar een gebruikers-/accountaantal zegt een concurrent precies waar het product staat, een')
  console.error('bedrag op recordniveau is een gegeven van een echte gebruiker, en een e-mailadres naast een')
  console.error('vermogenscijfer maakt dat vermogen herleidbaar tot een persoon. Git vergeet niets: eenmaal')
  console.error('gepusht blijft de blob via zijn SHA opvraagbaar, ook in forks en archieven. Vooruit opruimen')
  console.error('kan wel, terugdraaien niet.')
  console.error('')
  console.error('OPLOSSING: formuleer relatief ("een tabel in de orde van tienduizenden rijen", "FIRE schuift')
  console.error('enkele jaren later") en zet de exacte meting in een rapport buiten git. Draagt het exacte')
  console.error('getal echt het argument, gebruik dan de ontsnappingsmarker MET reden:')
  console.error('   -- productiecijfer-ok: <waarom dit getal hier moet staan>')
  console.error('Zie docs/adr/0111-productiecijfers-niet-in-git.md.')
  process.exit(1)
}

console.log(
  `✓ Productiecijfers: 0 nieuwe treffers in supabase/migrations + docs/adr` +
    (openResidue.length > 0 ? ` (${openResidue.length} bekende rest, zie hierboven).` : '.'),
)
process.exit(0)
