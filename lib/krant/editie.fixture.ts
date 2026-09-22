// ── Testfixture voor de matcher: AOW-rijen, vijf persona-profielen, artikelen ─
//
// Gedeeld door impact.test.ts, matcher.test.ts en matcher.golden.test.ts.
// Eigen bestand (geen export uit een *.test.ts), zoals duiding.fixture.ts.
//
// De persona-profielen zijn HANDMATIG afgeleid uit lib/test-personas.ts
// volgens de B8-tabel (blok ONDERZOEK op kaart 1B): geboortejaar uit
// date_of_birth, banden uit de som van eigen assets/debts, fiscaal partner
// bij 'samen'/'gezin' ONBEKEND (keuze 10), kinderleeftijd en werk waar de
// data ze niet draagt als zelf ingevuld gemarkeerd. Fase 2 (profiel-afleiding
// op echte rijen) vervangt deze handafleiding; tot die tijd zijn dit de vijf
// profieltypes van de meting.
//
// De AOW-rijen zijn de seed uit supabase/migrations/20260315000001_create_aow_leeftijd.sql.

import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { DUIDING_VERSIE, type DuidingV1 } from './duiding-schema'
import { PROFIEL_VERSIE, type NieuwsprofielV1 } from './profiel'
import type { KandidaatArtikel } from './matcher'

export const AOW_RIJEN: AowLeeftijdRow[] = [
  ['1956-06-01', '1957-02-28', 66, 10, true],
  ['1957-03-01', '1960-12-31', 67, 0, true],
  ['1961-01-01', '1964-09-30', 67, 3, true],
  ['1964-10-01', '1966-09-30', 67, 3, false],
  ['1966-10-01', '1970-06-30', 67, 6, false],
  ['1970-07-01', '1973-03-31', 67, 9, false],
  ['1973-04-01', '1975-12-31', 68, 0, false],
  ['1976-01-01', '1978-09-30', 68, 3, false],
  ['1978-10-01', '1982-06-30', 68, 6, false],
  ['1982-07-01', '1985-03-31', 68, 9, false],
  ['1985-04-01', '1988-12-31', 69, 0, false],
  ['1989-01-01', '1991-09-30', 69, 3, false],
  ['1991-10-01', '1995-06-30', 69, 6, false],
  ['1995-07-01', '1999-03-31', 69, 9, false],
  ['1999-04-01', '2000-12-31', 70, 0, false],
].map(([from, through, years, months, definitive], i) => ({
  id: `aow-${i}`,
  birth_date_from: from as string,
  birth_date_through: through as string,
  aow_years: years as number,
  aow_months: months as number,
  is_definitive: definitive as boolean,
  source: definitive ? 'SVB 2026' : 'CBS-prognose 2026',
}))

/** Het vaste "nu" van de fixture: maandag 21 sep 2026, 06:00 UTC (de editie-cron). */
export const NU = new Date('2026-09-21T06:00:00Z')

// ── Persona-profielen ────────────────────────────────────────────────────────

export const PROFIEL_DAAN: NieuwsprofielV1 = {
  versie: PROFIEL_VERSIE,
  geboortejaar: 2000,
  huishouden: 'alleen',
  kinderen: 'geen',
  werk: ['loondienst'],
  inkomen: '3250-4250',
  wonen: null, // huurt, soort onbekend (geen eigen_huis; huursoort niet af te leiden)
  hypotheek: { restschuld: null, rentevast: null },
  woonplan: 'geen-koopplan',
  spaargeld: 'tot-5k',
  beleggingen: { band: 'tot-25k', vorm: ['fondsen'] },
  schulden: ['studieschuld-tot-15k'],
  pensioenopbouw: { werkgever: 'ja', lijfrente: 'nee' },
  rubrieken: null,
}

export const PROFIEL_LISA: NieuwsprofielV1 = {
  versie: PROFIEL_VERSIE,
  geboortejaar: 1981,
  huishouden: null, // gezin → partner, fiscaal partnerschap onbekend (keuze 10)
  kinderen: null, // twee kinderen, leeftijd niet af te leiden
  werk: ['loondienst'],
  inkomen: '4250-5500',
  wonen: 'koop-met-hypotheek',
  hypotheek: { restschuld: '300k-450k', rentevast: null },
  woonplan: 'geen-koopplan',
  spaargeld: 'tot-5k',
  beleggingen: { band: '25k-100k', vorm: ['fondsen', 'crypto', 'tweede-woning'] },
  schulden: ['studieschuld-tot-15k', 'consumptief-krediet'],
  pensioenopbouw: { werkgever: 'ja', lijfrente: 'nee' },
  rubrieken: null,
}

export const PROFIEL_WILLEM: NieuwsprofielV1 = {
  versie: PROFIEL_VERSIE,
  geboortejaar: 1968,
  huishouden: null,
  kinderen: 'alleen-18-plus',
  werk: ['loondienst'],
  inkomen: '2500-3250',
  wonen: 'koop-zonder-hypotheek',
  hypotheek: { restschuld: null, rentevast: null },
  woonplan: 'geen-koopplan',
  spaargeld: 'tot-5k',
  beleggingen: { band: 'boven-250k', vorm: ['aandelen', 'tweede-woning'] },
  schulden: ['geen'],
  pensioenopbouw: { werkgever: 'ja', lijfrente: 'nee' },
  rubrieken: null,
}

export const PROFIEL_MARIJKE: NieuwsprofielV1 = {
  versie: PROFIEL_VERSIE,
  geboortejaar: 1957,
  huishouden: null,
  kinderen: 'alleen-18-plus',
  werk: ['pensioen'],
  inkomen: '3250-4250',
  wonen: 'koop-zonder-hypotheek',
  hypotheek: { restschuld: null, rentevast: null },
  woonplan: 'geen-koopplan',
  spaargeld: 'tot-5k',
  beleggingen: { band: 'boven-250k', vorm: ['aandelen'] },
  schulden: ['geen'],
  pensioenopbouw: { werkgever: 'ja', lijfrente: 'nee' },
  rubrieken: null,
}

export const PROFIEL_TESSA: NieuwsprofielV1 = {
  versie: PROFIEL_VERSIE,
  geboortejaar: 1984,
  huishouden: 'fiscaal-partner', // zelf ingevuld
  kinderen: 'jongste-4-11', // zelf ingevuld
  werk: ['dga'],
  inkomen: 'boven-5500',
  wonen: 'koop-met-hypotheek',
  hypotheek: { restschuld: '300k-450k', rentevast: 'variabel' }, // rentevast zelf ingevuld
  woonplan: 'geen-koopplan',
  spaargeld: '50k-100k',
  beleggingen: { band: 'boven-250k', vorm: ['fondsen', 'crypto', 'tweede-woning'] },
  schulden: ['studieschuld-tot-15k', 'consumptief-krediet'],
  pensioenopbouw: { werkgever: 'ja', lijfrente: 'nee' },
  rubrieken: ['beleggingen', 'fiscaal'],
}

export const PERSONA_PROFIELEN = {
  daan: PROFIEL_DAAN,
  lisa: PROFIEL_LISA,
  willem: PROFIEL_WILLEM,
  marijke: PROFIEL_MARIJKE,
  tessa: PROFIEL_TESSA,
} as const

// ── Artikelen ────────────────────────────────────────────────────────────────

const META = {
  grondslag: 'fragment',
  grondslagSha256: 'f'.repeat(64),
  tekens: 300,
  model: 'fixture',
  kopBron: 'bron',
  modeltekst: false,
  poort: { status: 'groen', reden: null },
} as const

function duiding(d: Omit<DuidingV1, 'versie' | 'meta' | 'grond'> & { grond?: Record<string, string> }): DuidingV1 {
  return { versie: DUIDING_VERSIE, grond: {}, meta: META, ...d }
}

interface ArtikelOpties {
  id: string
  title: string
  category: string | null
  fetched_at?: string
  published_at?: string
  duiding_status?: string
  duiding: DuidingV1 | null
}

function artikel(o: ArtikelOpties): KandidaatArtikel {
  const fetched = o.fetched_at ?? '2026-09-19T05:10:00Z'
  return {
    id: o.id,
    title: o.title,
    source_url: `https://voorbeeld.nl/${o.id}`,
    source_name: 'Voorbeeldbron',
    category: o.category,
    published_at: o.published_at ?? fetched,
    fetched_at: fetched,
    duiding_status: o.duiding_status ?? 'geduid',
    duiding: o.duiding,
  }
}

const geenBox3 = {
  heffingsvrij_single: null,
  heffingsvrij_partner: null,
  forfait_spaargeld_pct: null,
  forfait_beleggingen_pct: null,
  forfait_schulden_pct: null,
  tarief_pct: null,
}
const geenBox1 = {
  schijf_1_grens: null,
  schijf_2_grens: null,
  schijf_1_tarief_pct: null,
  schijf_2_tarief_pct: null,
  schijf_3_tarief_pct: null,
  algemene_heffingskorting_max: null,
  arbeidskorting_max: null,
}

export const ARTIKELEN: KandidaatArtikel[] = [
  artikel({
    id: 'a01-box3-heffingsvrij',
    title: 'Heffingsvrij vermogen box 3 naar 60.000 euro in 2027',
    category: 'fiscaal',
    duiding: duiding({
      soort: 'besloten',
      ingangsdatum: '2027-01-01',
      deadline: null,
      doelgroep: [{ veld: 'spaargeld', op: 'minstens', waarden: ['25k-50k'] }],
      mechanisme: {
        soort: 'box3-parameter',
        params: { ...geenBox3, jaar: 2027, heffingsvrij_single: 60000 },
        drempel: 'heffingsvrij-vermogen-single',
      },
      samenvatting: 'Het heffingsvrij vermogen in box 3 gaat in 2027 naar 60.000 euro. Het tarief blijft 36 procent.',
    }),
  }),
  artikel({
    id: 'a02-box1-schijf1',
    title: 'Tarief eerste schijf inkomstenbelasting naar 36 procent',
    category: 'fiscaal',
    duiding: duiding({
      soort: 'voorstel',
      ingangsdatum: '2027-01-01',
      deadline: null,
      doelgroep: [{ veld: 'werk', op: 'in', waarden: ['loondienst', 'zelfstandig', 'dga'] }],
      mechanisme: {
        soort: 'box1-parameter',
        params: { ...geenBox1, jaar: 2027, schijf_1_tarief_pct: 36 },
        drempel: 'box1-schijf-1-tarief',
      },
      samenvatting: 'Het tarief in de eerste schijf van box 1 gaat in 2027 naar 36 procent. De schijfgrenzen blijven gelijk.',
    }),
  }),
  artikel({
    id: 'a03-aow-leeftijd',
    title: 'AOW-leeftijd in 2033 drie maanden omhoog',
    category: 'pensioen',
    duiding: duiding({
      soort: 'besloten',
      ingangsdatum: '2033-01-01',
      deadline: null,
      doelgroep: [{ veld: 'geboortejaar', op: 'minstens', waarden: ['1960'] }],
      mechanisme: { soort: 'aow-leeftijd', params: { vanaf_jaar: 2033, verschuiving_maanden: 3 }, drempel: 'aow-leeftijd-standaard' },
      samenvatting: 'De AOW-leeftijd stijgt in 2033 met drie maanden. Dat volgt uit de nieuwe levensverwachting.',
    }),
  }),
  artikel({
    id: 'a04-studieschuld-rente',
    title: 'Rente op studieschuld in 2027 naar 3 procent',
    category: 'rente',
    duiding: duiding({
      soort: 'besloten',
      ingangsdatum: '2027-01-01',
      deadline: null,
      doelgroep: [{ veld: 'schulden', op: 'in', waarden: ['studieschuld-tot-15k', 'studieschuld-15k-40k', 'studieschuld-boven-40k'] }],
      mechanisme: { soort: 'studieschuld-rente', params: { jaar: 2027, rente_pct: 3 }, drempel: null },
      samenvatting: 'De rente op studieschulden wordt in 2027 vastgesteld op 3 procent. Dat geldt voor wie dan een nieuwe rentevaste periode ingaat.',
    }),
  }),
  artikel({
    id: 'a05-eigen-risico',
    title: 'Eigen risico in 2027 naar 165 euro',
    category: 'macro',
    duiding: duiding({
      soort: 'voorstel',
      ingangsdatum: '2027-01-01',
      deadline: null,
      doelgroep: [{ veld: 'geboortejaar', op: 'hoogstens', waarden: ['2008'] }],
      mechanisme: { soort: 'eigen-risico', params: { jaar: 2027, bedrag: 165 }, drempel: null },
      samenvatting: 'Het verplicht eigen risico gaat in 2027 naar 165 euro per jaar. Het voorstel ligt bij de Kamer.',
    }),
  }),
  artikel({
    id: 'a06-spaarrente',
    title: 'Spaarrentes dalen na rentebesluit ECB',
    category: 'rente',
    duiding: duiding({
      soort: 'marktbeweging',
      ingangsdatum: null,
      deadline: null,
      doelgroep: [{ veld: 'spaargeld', op: 'minstens', waarden: ['5k-25k'] }],
      mechanisme: { soort: 'spaarrente-markt', params: { verschuiving_pp: 0.25, nieuwe_rente_pct: null }, drempel: null },
      samenvatting: 'Na het rentebesluit van de ECB verlagen banken de spaarrente met 0,25 procentpunt. Niet elke bank volgt.',
    }),
  }),
  artikel({
    id: 'a07-hypotheekrente',
    title: 'Hypotheekrente stijgt licht',
    category: 'woningmarkt',
    duiding: duiding({
      soort: 'marktbeweging',
      ingangsdatum: null,
      deadline: null,
      doelgroep: [{ veld: 'wonen', op: 'is', waarden: ['koop-met-hypotheek'] }],
      mechanisme: { soort: 'hypotheekrente-markt', params: { verschuiving_pp: 0.1, nieuwe_rente_pct: 4.1 }, drempel: null },
      samenvatting: 'De gemiddelde hypotheekrente voor tien jaar vast steeg naar 4,1 procent. Het verschil met vorige maand is 0,1 procentpunt.',
    }),
  }),
  artikel({
    id: 'a08-kinderopvangtoeslag',
    title: 'Kinderopvangtoeslag: aanvraag voor 2027 vóór 31 oktober',
    category: 'fiscaal',
    fetched_at: '2026-09-01T05:10:00Z', // buiten het venster, maar de deadline ligt in de toekomst
    duiding: duiding({
      soort: 'besloten',
      ingangsdatum: '2027-01-01',
      deadline: { datum: '2026-10-31', soort: 'aanvraag' },
      doelgroep: [{ veld: 'kinderen', op: 'in', waarden: ['jongste-0-3', 'jongste-4-11'] }],
      mechanisme: { soort: 'toeslag-regel', params: { jaar: 2027, toeslag: 'kinderopvangtoeslag', inkomensgrens: null, vermogensgrens: null }, drempel: null },
      samenvatting: 'Wie in 2027 kinderopvangtoeslag wil, moet de aanvraag vóór 31 oktober 2026 indienen. De regels voor het inkomen veranderen niet.',
    }),
  }),
  artikel({
    id: 'a09-huurverhoging',
    title: 'Maximale huurverhoging vrije sector 2027 vastgesteld',
    category: 'woningmarkt',
    duiding: duiding({
      soort: 'besloten',
      ingangsdatum: '2027-01-01',
      deadline: null,
      doelgroep: [{ veld: 'wonen', op: 'in', waarden: ['huur-sociaal', 'huur-vrije-sector'] }],
      mechanisme: { soort: 'huurverhoging-max', params: { jaar: 2027, max_pct: 4.1, sector: 'vrije-sector' }, drempel: null },
      samenvatting: 'De maximale huurverhoging in de vrije sector is voor 2027 vastgesteld op 4,1 procent.',
    }),
  }),
  artikel({
    id: 'a10-wtp',
    title: 'Pensioenfondsen stappen over op nieuw stelsel',
    category: 'pensioen',
    duiding: duiding({
      soort: 'achtergrond',
      ingangsdatum: null,
      deadline: null,
      doelgroep: [{ veld: 'pensioen_werkgever', op: 'is', waarden: ['ja'] }],
      mechanisme: { soort: 'pensioenregeling', params: { onderwerp: 'wtp-overgang' }, drempel: null },
      samenvatting: 'Grote pensioenfondsen zetten hun regelingen om naar het nieuwe stelsel. Deelnemers krijgen een persoonlijk pensioenvermogen.',
    }),
  }),
  artikel({
    id: 'a11-inflatie',
    title: 'Inflatie in augustus 2,6 procent',
    category: 'macro',
    duiding: duiding({
      soort: 'cijfer',
      ingangsdatum: null,
      deadline: null,
      doelgroep: [],
      mechanisme: { soort: 'inflatie-cijfer', params: {}, drempel: null },
      samenvatting: 'De inflatie kwam in augustus uit op 2,6 procent. Vooral de huren en energie stegen.',
    }),
  }),
  artikel({
    id: 'a12-beurs',
    title: 'AEX sluit week hoger af',
    category: 'beleggingen',
    duiding: duiding({
      soort: 'marktbeweging',
      ingangsdatum: null,
      deadline: null,
      doelgroep: [{ veld: 'beleggingen', op: 'minstens', waarden: ['tot-25k'] }],
      mechanisme: { soort: 'beursbeweging', params: {}, drempel: null },
      samenvatting: 'De AEX sloot de week 1,4 procent hoger af. Vooral chipbedrijven stegen.',
    }),
  }),
  artikel({
    id: 'a13-box3-forfait',
    title: 'Forfait beleggingen box 3 in 2027 naar 6,5 procent',
    category: 'fiscaal',
    duiding: duiding({
      soort: 'voorstel',
      ingangsdatum: '2027-01-01',
      deadline: null,
      doelgroep: [{ veld: 'beleggingen', op: 'minstens', waarden: ['25k-100k'] }],
      mechanisme: {
        soort: 'box3-parameter',
        params: { ...geenBox3, jaar: 2027, forfait_beleggingen_pct: 6.5 },
        drempel: 'forfait-beleggingen',
      },
      samenvatting: 'Het forfaitair rendement op beleggingen in box 3 gaat in 2027 naar 6,5 procent.',
    }),
  }),
  artikel({
    id: 'a14-wacht',
    title: 'Nog niet geduid artikel',
    category: 'fiscaal',
    duiding_status: 'wacht',
    duiding: null,
  }),
  artikel({
    id: 'a15-oud',
    title: 'Oud artikel zonder deadline',
    category: 'macro',
    fetched_at: '2026-08-20T05:10:00Z',
    duiding: duiding({
      soort: 'achtergrond',
      ingangsdatum: null,
      deadline: null,
      doelgroep: [],
      mechanisme: null,
      samenvatting: 'Een achtergrondverhaal van een maand geleden zonder termijn.',
    }),
  }),
  artikel({
    id: 'a16-box3-tarief',
    title: 'Box 3-tarief in 2027 naar 38 procent',
    category: 'fiscaal',
    duiding: duiding({
      soort: 'voorstel',
      ingangsdatum: '2027-01-01',
      deadline: null,
      doelgroep: [{ veld: 'spaargeld', op: 'minstens', waarden: ['50k-100k'] }],
      mechanisme: { soort: 'box3-parameter', params: { ...geenBox3, jaar: 2027, tarief_pct: 38 }, drempel: 'box3-tarief' },
      samenvatting: 'Het tarief in box 3 gaat in 2027 van 36 naar 38 procent.',
    }),
  }),
  artikel({
    id: 'a17-teruggetrokken',
    title: 'Teruggetrokken duiding',
    category: 'fiscaal',
    duiding_status: 'teruggetrokken',
    duiding: duiding({
      soort: 'besloten',
      ingangsdatum: '2027-01-01',
      deadline: null,
      doelgroep: [],
      mechanisme: { soort: 'box3-parameter', params: { ...geenBox3, jaar: 2027, heffingsvrij_single: 90000 }, drempel: null },
      samenvatting: 'Een teruggetrokken duiding met een verkeerd getal van 90.000 euro.',
    }),
  }),
]
