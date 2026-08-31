#!/usr/bin/env node
/**
 * check-freedom-time-basis — lint-gate op de GRONDSLAG van het €→vrijheidstijd-
 * dagtarief.
 *
 * ── Waarom dit script bestaat ───────────────────────────────────────────────
 * Twee keer op rij is dezelfde bug ontstaan, met dezelfde vorm:
 *   · KRUIS-20 (jul 2026): zes oppervlakken herimplementeerden "jaaruitgaven →
 *     dagtarief" op net andere vensters. Opgelost met één bron
 *     (`lib/expense-rate.ts`) plus het bundelveld `DashboardData.dailyExpenseRate`.
 *   · Vervolg-KRUIS-20 (aug 2026): een TWEEDE familie bleek `dailyExpenseRate()`
 *     zélf aan te roepen op de EFFECTIVE maanduitgaven — de losse kalendermaand,
 *     of bij `income_source='manual'` de profielschatting. Op de 3e van de maand
 *     geeft dat een factor 20+ verschil op elke "jaren vrijheid"-regel, naast een
 *     widget die met het rolling tarief rekent.
 *
 * Er is geen typeverschil tussen "€/mnd effective" en "€/mnd rolling" — het zijn
 * allebei `number`. De compiler kan de derde familie dus niet tegenhouden; dit
 * script wel.
 *
 * ── De regel ────────────────────────────────────────────────────────────────
 * Een aanroep van `dailyExpenseRate(...)` in productiecode is alleen toegestaan
 * wanneer minstens één van deze waar is:
 *
 *   1. Het bestand staat in ALLOWED_FILES (canonieke producer of gedocumenteerde
 *      andere grondslag — zie de lijst hieronder, elke entry draagt zijn reden).
 *   2. De aanroep is de expliciete TERUGVAL achter een canoniek bundelveld, dus
 *      op dezelfde regel staat `.dailyExpenseRate ?? ` vóór de aanroep. Dat is
 *      het gesanctioneerde widget-patroon:
 *          data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
 *      Het bundelveld wint altijd; de conversie is er alleen voor mock-/empty-
 *      bundels die het additieve veld niet dragen.
 *
 * Alles daarbuiten is een NIEUWE eigen grondslag en faalt de gate. De fix is
 * bijna altijd: consumeer het bundelveld (`DashboardData` / `HorizonPageData` /
 * `CorePageData` / `CashflowCardScalars`.`dailyExpenseRate`), of roep de
 * gedeelde server-bron `getRecentDailyExpenseRate` aan.
 *
 * ── Wat dit script NIET ziet (vangrail, geen dekkingsbewijs) ────────────────
 *  a. Een eigen deling die `dailyExpenseRate` omzeilt (`bedrag / 30`,
 *     `jaar / 365`). Regel 2 hieronder vangt de meest voorkomende vorm — een
 *     letterlijke `/ 30` op een maanduitgaven-achtige naam — maar een som via
 *     tussenvariabelen glipt erdoor.
 *  b. Een verkeerd ARGUMENT dat toch uit een bundel komt: geef je
 *     `dailyExpenseRate(data.monthlyExpenses)` door als terugval, dan is dat
 *     toegestaan (regel 2) — óók als het bundelveld er wél was.
 *  c. Doorgeefketens: een canoniek tarief dat via vijf props alsnog naast een
 *     effective tarief belandt.
 *
 * Run:  npm run check:freedom-basis
 * Flags: --list  print alle gevonden aanroepen met hun oordeel (om de allowlist
 *                te herijken na een bewuste wijziging).
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks']

/** Aanroep van de canonieke conversie-helper (niet: het gelijknamige VELD/`key:`). */
const CALL = /(?<![A-Za-z0-9_$.])dailyExpenseRate\s*\(/
/** Het gesanctioneerde terugval-patroon: bundelveld wint, conversie is vangnet. */
const BUNDLE_FALLBACK = /\.dailyExpenseRate\s*\?\?[\s\S]*?dailyExpenseRate\s*\(/
/** Regel is puur commentaar (blok-vervolg of //) → nooit een aanroep. */
const COMMENT_LINE = /^\s*(\*|\/\/|\/\*)/

/**
 * REGEL 2 (M22) — een eigen deling die `dailyExpenseRate` omzeilt.
 *
 * Blinde vlek (a) in de kop van dit bestand was geen theorie: `loadPerspectiveBox3`
 * deelde de som van budget-LIMIETEN door 30 en gaf zo dezelfde Box 3-heffing op
 * de subpagina een ander aantal vrijheidsdagen dan op de hub — op productie
 * −68% tot +441%. Deze gate zag daar niets van, want er stond nergens
 * `dailyExpenseRate(`.
 *
 * Wat we vangen: een deling door 30 / 30.4 / 30.44 / 30.5 op een identifier die
 * naar UITGAVEN ruikt. Dat is de vorm die drie keer op rij is teruggekomen
 * (household-tax ÷30, inflatie-koopkracht ÷30,44, what-if ÷30). Een som via
 * tussenvariabelen glipt er nog steeds doorheen — dit is een vangrail, geen
 * dekkingsbewijs.
 *
 * De juiste vorm is ALTIJD `dailyExpenseRate(maandbedrag)` (×12/365): twaalf
 * maanden van 30 dagen is 360, geen jaar, dus ÷30 overschat elk dagtarief met
 * 365/360 — bovenop de kans dat de TELLER ook al niet klopt.
 */
const MONTH_DIVISION = /(?<![A-Za-z0-9_$])([A-Za-z0-9_$.]*(?:xpense|itgave|osten|pend)[A-Za-z0-9_$.]*)\s*\/\s*30(?:\.[45]?\d*)?(?![\d.])/

/**
 * REGEL 3 (M22, tweede ronde) — een dagtarief uit het ZICHTBARE VENSTER.
 *
 * Blinde vlek (a) sloeg een tweede keer toe, nu zónder deling door 30: de
 * transactielijst had een eigen `avgDailyExpense(txns, windowDays)` in
 * lib/transaction-display.ts, die de uitgaven van de op dat moment gefilterde
 * lijst deelde door de lengte van de gekozen periode. Grammaticaal onschuldig —
 * geen `dailyExpenseRate(`, geen `/ 30` — maar het maakte de wisselkoers
 * "€ → tijd" een eigenschap van je filterkeuze: € 2.500 las op de transactielijst
 * als 6000,0 vrijheidsdagen en op de check-in als 6083.
 *
 * De functie is verwijderd (de tijdlijn leest nu `useDailyExpenseRate`); deze
 * regel houdt de naam bezet zodat herintroductie hard faalt. Niet-allowlistbaar,
 * net als regel 2: een venster-gemiddelde is geen andere GRONDSLAG maar een
 * tarief dat per scherm verschilt — precies wat één bron moet uitsluiten.
 *
 * Wat dit NIET vangt: dezelfde som onder een andere naam. Dit blijft een
 * vangrail, geen dekkingsbewijs.
 */
const WINDOW_AVERAGE = /(?<![A-Za-z0-9_$.])avgDailyExpense(?![A-Za-z0-9_$])/

/**
 * Verwijder string-literals uit een regel vóór de match-test. De naam
 * `dailyExpenseRate(3000)` komt namelijk óók voor in PROZA — UAT-verwachtingen
 * ("vrijheidsdagen = calculateFreedomTime(…, dailyExpenseRate(2200))") en de
 * formule-teksten in lib/architecture/calculations.ts. Dat zijn beschrijvingen
 * van de canonieke keten, geen tweede grondslag.
 *
 * BLINDE VLEK: een echte aanroep binnen een template-interpolatie
 * (`${dailyExpenseRate(x)}`) wordt hierdoor óók weggestreept. Die vorm komt
 * vandaag nergens voor; verschijnt hij, dan ziet deze gate hem niet.
 */
function stripStrings(line) {
  return line
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/**
 * Bestanden die WEL zelf een dagtarief mogen maken. Elke entry draagt zijn
 * reden; voeg niets toe zonder er één te schrijven — dat is precies de
 * overtreding die deze gate hoort te vangen.
 */
const ALLOWED_FILES = new Map([
  // ── Canonieke bron ────────────────────────────────────────────────────────
  ['lib/format.ts', 'DEFINITIE van dailyExpenseRate zelf (×12/365).'],
  ['lib/expense-rate.ts', 'DE canonieke 12-mnd rolling bron; roept de conversie als laatste stap aan.'],

  // ── Andere, bewust gedocumenteerde grondslag ──────────────────────────────
  [
    'components/app/horizon/sim-chart-widget.tsx',
    'ONTTREKKINGSFASE-grondslag: rekent op yearlyMustExpenses (uitgaven ná pensioen, ' +
      'de FIRE-doel-invoer uit lib/budget-utils.ts), niet op de huidige levensstijl. ' +
      'Dit is de kassabon ONDER de simulatie; het huidige-levensstijl-tarief zou de ' +
      'onderbouwing niet meer laten kloppen met de motor eronder.',
  ],
  [
    'components/app/horizon/grafiek-uitleg/grafiek-uitleg-walkthrough.tsx',
    'Zelfde onttrekkingsfase-grondslag als sim-chart-widget (krijgt dezelfde ' +
      'yearlyExpenses-prop en wordt er letterlijk door gerenderd).',
  ],
  [
    'components/core/holdings/portfolio-value-chart.tsx',
    'ESSENTIELE-uitgaven-grondslag (yearlyEssentialExpenses): bewust de must-basis ' +
      'van de FIRE-doelberekening, niet het totale levensstijl-tarief.',
  ],
  [
    'lib/dashboard-data-loader.ts',
    'Produceert het canonieke bundelveld; de resterende aanroep is de must-grondslag ' +
      '(yearlyMustExpenses/365) voor de FIRE-tak.',
  ],
  [
    // Was lib/horizon-data-loader.ts; die loader is bij ADR 0107 geknipt en de
    // queries + rauwe afleidingen (waaronder deze aanroep) wonen nu in de rauwe
    // laag. Zelfde regel, zelfde reden — alleen een ander pad.
    'lib/horizon/raw-data-loader.ts',
    'Produceert HorizonRawData.dailyExpenseRate; de resterende aanroep voedt alleen ' +
      'calculateBox3 waarvan enkel .tax gelezen wordt (freedomDays ongebruikt).',
  ],
  // components/overview/cashflow-instellingen-blok.tsx stond hier tot M22 met de
  // redenering "dit paneel toont het tarief van het bedrag dat er op dát moment
  // staat". Die uitzondering is INGETROKKEN (eigenaar-besluit 26-08-2026, optie
  // B1): een dagtarief is geen grondslagkeuze maar een app-brede wisselkoers, en
  // deze uitzondering maakte het paneel de derde koers binnen één module ("één
  // dag vrijheid kost je nu €106" naast een app op ~€124/dag). Het blok
  // consumeert nu `CashflowSettingsData.dailyExpenseRate` en benoemt de herkomst
  // in de regel eronder — dát is wat de kassabon kloppend houdt, niet een eigen
  // tarief. Zet het bestand hier NIET terug zonder nieuw eigenaar-besluit.

  // ── Eigen invoer / eigen flow (geen app-brede weergave-grondslag) ─────────
  [
    // De check-wizard rékent sinds bevinding H12 niet meer zelf: hij consumeert
    // computeFreedomTicker uit lib/freedom-ticker.ts (gedeeld met de
    // onboarding-teller). De entry blijft staan omdat dit bestand hét precedent
    // is voor de intake-grondslag; verdwijnt de wizard, dan mag hij weg.
    'components/check/intake/check-wizard.tsx',
    'Check-intake rekent op de bedragen die de gebruiker NET in de wizard typte — ' +
      'er is nog geen transactiehistorie om een rolling tarief uit te halen.',
  ],
  [
    'lib/freedom-ticker.ts',
    'DE gedeelde intake-grondslag (intakeDailyExpenseRate): de meelopende ' +
      '"Al vrijgekocht"-teller van /check én /onboarding rekent op de bedragen die ' +
      'de gebruiker zojuist zelf typte — er is nog geen transactiehistorie voor een ' +
      'rolling tarief. Bewust ÉÉN module in plaats van de conversie per intake-scherm ' +
      '(bevinding H12): zo blijft "intake rekent op eigen invoer" één gedocumenteerde ' +
      'uitzondering. De conversie zelf blijft dailyExpenseRate (×12/365).',
  ],
  ['components/check/intake/steps/step-gebeurtenissen.tsx', 'Idem: intake-eigen invoer.'],
  [
    'lib/check/build-report.ts',
    'Het check-rapport is een momentopname van de intake-context, niet van de app-bundel.',
  ],
  [
    'app/(app)/core/checkin/page.tsx',
    'Check-in vergelijkt SNAPSHOTS met elkaar; het tarief hoort bij de snapshot-maand, ' +
      'niet bij het rolling vandaag-tarief (anders verandert de historie met terugwerkende kracht).',
  ],
  ['app/(app)/core/checkin/historie/page.tsx', 'Idem: snapshot-historie.'],
  [
    'lib/ai/tools/freedom-calc.ts',
    'AI-tool die een DOOR DE GEBRUIKER OPGEGEVEN maandbedrag omrekent ("wat als ik ' +
      '€X/mnd uitgeef") — een hypothese, geen weergave van zijn eigen dagtarief.',
  ],
  [
    'app/(app)/horizon/whatif/whatif-page-client.tsx',
    'WHAT-IF-grondslag: het scenariobedrag dat de gebruiker in de schuifjes zet is ' +
      'hier de hele vraag ("wat als ik €X/mnd uitgeef"), net als bij de AI-tool ' +
      'hierboven. De CONVERSIE is wél canoniek — dit verving een ÷30 (M22).',
  ],

  // ── Vaste testgetallen (geen gebruikersdata) ─────────────────────────────
  ['lib/uat/acceptance/budget-checks.ts', 'UAT-fixture met een vast literal-bedrag.'],
  ['lib/uat/acceptance/canon-checks.ts', 'UAT-fixture met een vast literal-bedrag.'],
  ['lib/uat/acceptance/cash-checks.ts', 'UAT-fixture met een vast literal-bedrag.'],
  ['lib/uat/acceptance/kruis-checks.ts', 'UAT-fixture met een vast literal-bedrag.'],
  ['lib/uat/acceptance/start-checks.ts', 'UAT-fixture met een vast literal-bedrag.'],
  ['lib/regression-tests/suites/vaste-kosten-analyse.ts', 'Regressie-fixture met een vast literal-bedrag.'],
  ['lib/regression-tests/suites/identiteit-household.ts', 'Regressie-fixture met een vast literal-bedrag (M22-noemerregel).'],
])

function walk(dir, acc) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) acc.push(full)
  }
  return acc
}

const files = []
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d)
  if (existsSync(abs)) walk(abs, files)
}

const listMode = process.argv.includes('--list')
const violations = []
const allowed = []

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/')
  const src = readFileSync(file, 'utf8')

  // ── Regel 2: eigen maand÷30-deling (M22) ────────────────────────────────
  // Niet-allowlistbaar, net als de kolomregel in check-client-data-reads.mjs:
  // een 360-dagenjaar is nooit een bewuste andere GRONDSLAG, het is een fout in
  // de CONVERSIE. Wie een andere grondslag wil, voedt `dailyExpenseRate()` een
  // ander maandbedrag — dat is regel 1, met zijn eigen allowlist.
  if (MONTH_DIVISION.test(src)) {
    src.split(/\r?\n/).forEach((rawLine, i) => {
      const line = stripStrings(rawLine)
      if (COMMENT_LINE.test(rawLine)) return
      const m = MONTH_DIVISION.exec(line)
      if (!m) return
      violations.push({
        rel,
        line: i + 1,
        text: rawLine.trim(),
        rule: 'maand÷30 i.p.v. dailyExpenseRate() (×12/365)',
      })
    })
  }

  // ── Regel 3: dagtarief uit het zichtbare venster (M22) ──────────────────
  // Ook niet-allowlistbaar. Een tarief dat met de filterkeuze meebeweegt is per
  // definitie een tweede wisselkoers, geen tweede grondslag.
  if (WINDOW_AVERAGE.test(src)) {
    src.split(/\r?\n/).forEach((rawLine, i) => {
      if (COMMENT_LINE.test(rawLine)) return
      if (!WINDOW_AVERAGE.test(stripStrings(rawLine))) return
      violations.push({
        rel,
        line: i + 1,
        text: rawLine.trim(),
        rule: 'venster-gemiddeld dagtarief i.p.v. de canonieke 12-mnd rolling bron',
      })
    })
  }

  if (!CALL.test(src)) continue
  const lines = src.split(/\r?\n/)
  lines.forEach((rawLine, i) => {
    const line = stripStrings(rawLine)
    if (!CALL.test(line) || COMMENT_LINE.test(rawLine)) return
    const reason = ALLOWED_FILES.get(rel)
    // Het terugval-patroon loopt vaak over twee regels; kijk dus ook naar de
    // vorige regel — precies zoals de widgets het schrijven.
    const before = (lines[i - 1] ?? '') + '\n' + line
    // Perspectief-override (gedocumenteerde KRUIS-20-uitzondering): in
    // huishoud-/partnerweergave houdt de widget bewust het uitgavenniveau van
    // dát perspectief. Vorm:
    //     const d = override
    //       ? dailyExpenseRate(monthlyExpenses)          ← deze regel
    //       : data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
    // Alleen de ECHTE ternary-vorm telt (regel begint met `?`, volgende met `:`
    // én draagt het bundelveld), niet zomaar "er staat verderop een fallback".
    const next = lines[i + 1] ?? ''
    const perspectiveOverride =
      /^\s*\?\s/.test(line) && /^\s*:/.test(next) && /\.dailyExpenseRate\s*\?\?/.test(next)
    if (reason) {
      allowed.push({ rel, line: i + 1, text: rawLine.trim(), why: 'allowlist: ' + reason })
    } else if (BUNDLE_FALLBACK.test(before)) {
      allowed.push({ rel, line: i + 1, text: rawLine.trim(), why: 'terugval achter het canonieke bundelveld' })
    } else if (perspectiveOverride) {
      allowed.push({
        rel,
        line: i + 1,
        text: rawLine.trim(),
        why: 'perspectief-override-tak (huishoud/partner houdt eigen uitgavenniveau — KRUIS-20)',
      })
    } else {
      violations.push({ rel, line: i + 1, text: rawLine.trim() })
    }
  })
}

if (listMode) {
  console.log('── Toegestaan ──')
  for (const a of allowed) console.log(`  ${a.rel}:${a.line}  ${a.text}\n      → ${a.why}`)
  console.log('\n── Overtredingen ──')
  for (const v of violations) console.log(`  ${v.rel}:${v.line}  ${v.text}`)
  console.log(`\n${allowed.length} toegestaan, ${violations.length} overtreding(en).`)
  process.exit(0)
}

if (violations.length > 0) {
  console.error('\n✗ Eigen €→vrijheidstijd-dagtarief buiten de canonieke bron:\n')
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}${v.rule ? `  [${v.rule}]` : ''}\n    ${v.text}`)
  }
  console.error(
    '\nHet dagtarief komt uit ÉÉN bron (12-mnd rolling, lib/expense-rate.ts).\n' +
      'Consumeer het bundelveld `dailyExpenseRate` (DashboardData / HorizonPageData /\n' +
      'CorePageData / CashflowCardScalars), of roep `getRecentDailyExpenseRate(supabase)`\n' +
      'aan. Is dit bewust een ANDERE grondslag (onttrekkingsfase, essentiële uitgaven,\n' +
      'eigen intake-invoer)? Zet het bestand dan in ALLOWED_FILES in\n' +
      'scripts/check-freedom-time-basis.mjs MÉT de reden.\n' +
      '\nSTAAT ER [maand÷30] bij? Dan is de ALLOWLIST NIET de uitweg: twaalf maanden\n' +
      'van 30 dagen is 360, geen jaar. Een andere GRONDSLAG kies je door\n' +
      '`dailyExpenseRate()` een ander maandbedrag te voeren — de CONVERSIE zelf\n' +
      '(×12/365) is nooit een keuze.\n' +
      '\nSTAAT ER [venster-gemiddeld] bij? Ook dan niet: een tarief dat uit de op dat\n' +
      'moment zichtbare/gefilterde lijst komt, verandert zodra de gebruiker van\n' +
      'periode wisselt — dat is een tweede wisselkoers, geen tweede grondslag.\n' +
      'Client-side lees je het tarief uit `useDailyExpenseRate()`.\n',
  )
  process.exit(1)
}

console.log(`✓ Vrijheidstijd-grondslag: ${allowed.length} aanroep(en), allemaal canoniek of gedocumenteerd.`)
process.exit(0)
