#!/usr/bin/env node
/**
 * check-client-data-reads — lint-gate voor de datapad-conventie (ADR 0058).
 *
 * Regel: weergavedata lees je via een server-loader/bundel, niet met de
 * browser-client in een 'use client'-bestand. Dit script flagt NIEUWE
 * read-for-display-queries (`.from(...).select(...)`) in client-code die niet
 * op de grandfather-allowlist staan. Mirror van de allowlist-gedachte uit de
 * e-mail-allowlist (ADR 0047-stijl).
 *
 * Detectie ("reader"):
 *  - bestand heeft een `'use client'`-directive,
 *  - importeert `lib/supabase/client` (de browser-client),
 *  - bevat minstens één `.from(<x>) … .select(` waarbij de keten TUSSEN
 *    `.from(` en `.select(` GEEN `insert/update/upsert/delete` bevat.
 *    → `.insert().select('id')` returning is GEEN read-for-display en telt niet.
 *
 * Uitzonderingen (binnen de conventie — horen NIET in de allowlist als reader,
 * maar worden hoe dan ook niet geflagd omdat ze geen display-read doen):
 *  - eigen-rij preferences (own-row RMW, spiegel app/api/appearance),
 *  - auth (supabase.auth.*),
 *  - realtime (.channel()/postgres_changes) — initiële load blijft via loader/API.
 * Bestanden die naast prefs/auth/realtime tóch een display-read doen, staan als
 * grandfather op de allowlist tot Fase b ze uitfaseert.
 *
 * Exit 0 = geen nieuwe overtredingen. Exit 1 = nieuwe reader buiten de allowlist.
 *
 * ── Regel 2: geen `select('*')` op tabellen met crypto-kolommen ──────────────
 * Regel 1 hierboven kent alleen "leest de browser rechtstreeks, ja of nee", en
 * de allowlist grandfathert een bestand als GEHEEL. Een `select('*')` op een
 * tabel met veld-encryptie glipt daar dus per definitie doorheen: de gate ziet
 * geen kolommen. Twee lekken (bank_connection_accounts, 1e2125e8f; assets) zijn
 * daardoor met de hand gevonden i.p.v. mechanisch. Regel 2 sluit dat gat en
 * staat BEWUST LOS van de ALLOWLIST — daar een bestand op zetten onderdrukt
 * regel 2 niet.
 *
 * ── Wat regel 2 NIET ziet (gemeten, niet gegokt — behandel groen dus niet als
 *    bewijs dat er geen crypto-kolommen naar de browser gaan) ────────────────
 *  a. TRANSITIEF VIA EEN GEDEELDE HELPER. De scan slaat elk bestand zonder
 *     `use client`-directive over. Staat de `select('*')` in een gewone
 *     lib-module die dóór clientcode wordt aangeroepen, dan ziet de gate niets.
 *     Geen theorie: zo liepen `lib/household/perspective-loader.ts` en
 *     `lib/household-projection.ts` maandenlang groen langs deze gate terwijl ze
 *     de partner-kolommen van `assets` naar de browser stuurden.
 *  b. SERVER-LOADER → CLIENT-PROP. Een server-loader mag `select('*')` doen,
 *     maar gaat het resultaat als prop naar een clientcomponent, dan
 *     serialiseert Next het volledig in de RSC-payload en staat het alsnog in
 *     de paginabron. Zo lekten `core-data-loader#fullAssets` (→ <CoreLanding>),
 *     `server-data/base#getActiveAssets` (→ <HorizonPage>) en de
 *     bezittingen-categoriepagina. De gate kent alleen bestanden, geen
 *     propstromen.
 *
 *     Die vijf zijn 2 aug 2026 gedicht (alle vijf lezen nu ASSET_CLIENT_COLUMNS,
 *     bewaakt door lib/household/assets-column-contract.test.ts) — ze staan hier
 *     als BEWIJS dat deze twee klassen echt voorkomen, niet als openstaande
 *     lekken. Een nieuwe gaat er even hard doorheen; alleen de kolomconstante
 *     vangt 'm, en die is geen automatisme.
 *  c. NIET-LETTERLIJKE ARGUMENTEN. `.from(tabelVariabele)`, `.select(KOLOMMEN)`
 *     met een constante, en een sterretje uit een template-expressie matchen
 *     geen van alle; net zomin als een keten van >500 tekens tussen `.from(`
 *     en `.select(`.
 * Kortom: regel 2 vangt de letterlijke, inline vorm — de vorm waarin de twee
 * historische lekken stonden. Hij is een vangrail, geen dekkingsbewijs.
 *
 * Run:  npm run check:client-reads   (of: node scripts/check-client-data-reads.mjs)
 * Flags: --list  print de huidige reader-set (om de allowlist te herijken).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks']

const USE_CLIENT = /^\s*['"]use client['"]/m
const CLIENT_IMPORT = /from\s+['"][^'"]*lib\/supabase\/client['"]/
// .from(<args>) … (max 500 tekens keten) … .select(
const READ_RE = /\.from\(([^)]*)\)([\s\S]{0,500}?)\.select\(/g
const MUTATION_IN_CHAIN = /\.(insert|update|upsert|delete)\(/

/**
 * Grandfather-allowlist (ADR 0058, gemeten op HEAD 2026-07-21).
 * Deze bestanden lazen op het moment van vastleggen al direct met de
 * browser-client. Ze blijven toegestaan tot Fase b ze per domein uitfaseert.
 * Voeg hier NIETS nieuws aan toe zonder motivatie — dat is precies de
 * overtreding die deze gate hoort te vangen. Verwijder entries zodra een
 * domein-slice ze heeft gemigreerd.
 *
 * Enkele entries vallen conceptueel binnen de conventie (prefs/realtime) maar
 * doen tóch een display-read bij de initiële load; ze zijn gemarkeerd en
 * worden bij Fase b naar loader/API getild.
 */
const ALLOWLIST = new Set([
  // — Fase b, slice 1: assets —
  'components/core/assets-client.tsx',
  // `components/core/asset-detail-flow.tsx` stond hier tot aug 2026; het bestand
  // had nul call-sites en is verwijderd. Entry mee weggehaald, anders meldt de
  // stale-check hem terecht.
  'components/app/core/assets/asset-pane.tsx',
  'components/core/rebalancing-settings-section.tsx',
  'app/(app)/core/assets/revalue/page.tsx',
  'components/app/app-setup/configs/aandelen-holdings.config.tsx',
  'components/app/app-setup/configs/crypto-holdings.config.tsx',
  'components/app/app-setup/configs/verhuurrendement.config.tsx',
  'components/app/app-setup/configs/hypotheekplanner.config.tsx',
  'components/core/deepenings/hypotheekplanner-tab.tsx',
  'components/core/deepenings/verhuurrendement-tab.tsx',
  // — Fase b, slice 2: budgets —
  'components/app/budgets-client.tsx',
  'components/app/budget-form.tsx',
  'components/app/app-setup/configs/budgetteren.config.tsx',
  // — Fase b, slice 3: cash —
  'components/app/cash-account-view.tsx',
  'components/app/transaction-form.tsx',
  'components/app/transfer-confirm-sheet.tsx',
  'components/app/manual-transfer-sheet.tsx',
  'components/app/category-rules-sheet.tsx',
  'components/app/ai-categorize-sheet.tsx',
  'components/app/account-form-modal.tsx',
  'components/app/counterparty-analysis-panel.tsx',
  'components/overview/transacties/transacties-analyse.tsx',
  'app/(app)/core/cash/import/page.tsx',
  // 'app/(app)/core/cash/connect/success/page.tsx' — VERVALLEN (fase 5): leest nu
  // via GET /api/bank-connect/linked-accounts. Entries verwijderen mag; toevoegen niet.
  // — Fase b, slice 4: horizon / toekomst —
  'components/app/horizon/horizon-client.tsx',
  'components/app/horizon/strategie-modal.tsx',
  'components/future/doel-toevoegen-sheet.tsx',
  'components/future/doel-bewerken-sheet.tsx',
  'app/(app)/horizon/whatif/whatif-page-client.tsx',
  // — Fase b, slice 5: debts + belasting —
  'app/(app)/core/debts/debts-client.tsx',
  'components/core/debt-category-page.tsx',
  'components/aangifte/review-step.tsx',
  // — Fase b, slice 6: beheer / rapportages / onboarding / checkin / overig —
  'app/(app)/beheer/integraties/integraties-shell.tsx',
  'app/(app)/beheer/testdata/page.tsx',
  // 'app/(app)/rapportages/page.tsx' — GERETIREERD (S9, 28 aug 2026): de hub is
  // een serverpagina met `lib/rapportages-data-loader.ts`; er wordt niets meer
  // client-direct gelezen.
  'app/(app)/core/checkin/page.tsx',
  'app/(onboarding)/onboarding/page.tsx',
  'components/app/module-activation-modal.tsx',
  'components/app/app-setup/use-is-setup-completed.tsx',
  'app/(app)/mijn/profiel/page.tsx',
  // — Binnen de conventie (prefs/realtime), grandfathered vanwege initiële display-read —
  'components/mijn/ai-privacy-settings.tsx', // eigen-rij prefs (profiles) — legit, verplaatst mee bij Fase b indien nodig
  'components/mijn/local-categorization-settings.tsx', // eigen-rij prefs — legit
  'app/(app)/mijn/notificaties/page.tsx', // realtime; initiële load nog client-side → Fase b naar API
])

// ── Regel 2 — kolomniveau ────────────────────────────────────────────────────
//
// Tabellen met veld-encryptie: naast de zichtbare kolom dragen ze een
// `*_encrypted` (ciphertext) en een `*_hash` (blind index — HMAC-SHA256 onder
// een server-only sleutel, dus een STABIELE correlatiesleutel die dezelfde
// invoer altijd op dezelfde waarde afbeeldt). Geen van beide is in de browser
// ergens goed voor: `decryptField` heeft server-only sleutels.
const CRYPTO_TABLES = {
  assets: {
    columns: 'account_number_hash / account_number_encrypted / account_number',
    // Waarom deze tabel het zwaarst weegt: de SELECT-policy is HUISHOUD-GEDEELD.
    extra:
      'De SELECT-policy op `assets` is huishoud-gedeeld (auth.uid() = user_id OR (ownership = \'shared\' AND household_id = user_household_id())), dus `*` levert bij een gedeelde bezitting de rekeningnummer-kolommen van de PARTNER in de bundel van de vragende gebruiker.',
    hint: 'Gebruik ASSET_CLIENT_COLUMNS uit lib/asset-data.ts.',
  },
  bank_accounts: {
    columns: 'iban_hash / iban_encrypted',
    extra: '',
    hint: 'Vraag alleen de kolommen op die het scherm toont (zie 984b54eba).',
  },
  bank_connection_accounts: {
    columns: 'iban_hash / iban_encrypted',
    extra: '',
    hint: 'Zie components/app/cash-account-view.tsx#loadGcAccounts voor de vorm.',
  },
  bank_connections: {
    columns: 'access_token_encrypted / refresh_token_encrypted',
    extra: '',
    hint: 'Tokens horen de browser nooit te bereiken.',
  },
}

const TABLE_NAMES = Object.keys(CRYPTO_TABLES).join('|')
// .from('<tabel>') … .select('*…  — de select-arg moet MET een ster beginnen;
// `select('id, name')` is prima, `select('*, rel(x)')` niet.
//
// Het tussenstuk is een "tempered" token: het mag géén `.from(` of `.select(`
// bevatten, zodat alleen de EERSTE select ná deze from meetelt. Zonder die
// temporing sprong de match over een net gerepareerde kolomlijst heen naar de
// `select('*')` van een náást liggende query op een andere tabel — een fout-
// positief dat precies het bestand aanwees dat al goed was.
const STAR_SELECT_RE = new RegExp(
  `\\.from\\(\\s*['"\`](${TABLE_NAMES})['"\`]\\s*\\)((?:(?!\\.from\\(|\\.select\\()[\\s\\S]){0,500})\\.select\\(\\s*['"\`]\\s*\\*`,
  'g',
)

/**
 * Bekende rest die regel 2 (nog) niet hard mag afkeuren.
 *
 * Dit is NIET de grandfather-allowlist van regel 1 en gedraagt zich anders:
 *  - hij staat per BESTAND+TABEL, niet per bestand,
 *  - elke run print 'm luid als openstaande rest,
 *  - een entry die géén overtreding meer is, is een HARDE fout: de gate dwingt
 *    zo af dat de lijst alleen kan krimpen en nooit stil blijft hangen.
 * Voeg hier niets aan toe. Een nieuwe `select('*')` op deze tabellen is een
 * regressie, geen uitzondering.
 */
const COLUMN_RULE_RESIDUE = new Map()

function collectStarSelects(src) {
  const hits = new Set()
  STAR_SELECT_RE.lastIndex = 0
  let m
  while ((m = STAR_SELECT_RE.exec(src))) {
    if (MUTATION_IN_CHAIN.test(m[2])) continue
    hits.add(m[1])
  }
  return hits
}

function walk(dir) {
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
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === '__tests__') continue
      out.push(...walk(p))
    } else if (/\.(tsx|ts)$/.test(name) && !/\.test\.(tsx|ts)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

function hasDisplayRead(src) {
  READ_RE.lastIndex = 0
  let m
  while ((m = READ_RE.exec(src))) {
    if (MUTATION_IN_CHAIN.test(m[2])) continue // returning-select, geen display-read
    return true
  }
  return false
}

function collectReaders() {
  const readers = []
  // Regel 2-treffers als `<pad>::<tabel>`. Bewust ZONDER de CLIENT_IMPORT-eis:
  // een `select('*')` op deze tabellen is ook fout wanneer de client via een
  // wrapper of prop binnenkomt.
  const starSelects = []
  for (const d of SCAN_DIRS) {
    for (const file of walk(join(ROOT, d))) {
      const src = readFileSync(file, 'utf8')
      if (!USE_CLIENT.test(src)) continue
      const rel = relative(ROOT, file).split('\\').join('/')
      for (const table of collectStarSelects(src)) starSelects.push(`${rel}::${table}`)
      if (!CLIENT_IMPORT.test(src)) continue
      if (!hasDisplayRead(src)) continue
      readers.push(rel)
    }
  }
  readers.sort()
  starSelects.sort()
  return { readers, starSelects }
}

const { readers, starSelects } = collectReaders()

if (process.argv.includes('--list')) {
  console.log(`${readers.length} client display-readers:`)
  console.log(readers.map((r) => `  ${r}`).join('\n'))
  console.log(`\n${starSelects.length} select('*') op crypto-tabellen in clientcode:`)
  console.log(starSelects.map((s) => `  ${s}`).join('\n') || '  (geen)')
  process.exit(0)
}

// ── Regel 2 eerst: dit is de zwaarste van de twee (server-only crypto-materiaal
//    in een clientbundel), en hij staat los van de ALLOWLIST. ──
const starViolations = starSelects.filter((s) => !COLUMN_RULE_RESIDUE.has(s))
const staleResidue = [...COLUMN_RULE_RESIDUE.keys()].filter((s) => !starSelects.includes(s)).sort()
const openResidue = starSelects.filter((s) => COLUMN_RULE_RESIDUE.has(s))

if (openResidue.length > 0) {
  console.log('⚠  Openstaande rest op de kolomregel — deze lijst MOET krimpen, nooit groeien:')
  for (const s of openResidue) console.log(`   - ${s}  (${COLUMN_RULE_RESIDUE.get(s)})`)
  console.log('')
}

if (staleResidue.length > 0) {
  console.error('✗ COLUMN_RULE_RESIDUE bevat entries die geen overtreding meer zijn — haal ze weg,')
  console.error('  anders dekt de rest-lijst stilzwijgend een toekomstige regressie af:')
  for (const s of staleResidue) console.error(`   ${s}`)
  process.exit(1)
}

if (starViolations.length > 0) {
  console.error("✗ Kolomregel: select('*') in clientcode op een tabel met crypto-kolommen.")
  console.error('')
  for (const v of starViolations) {
    const [file, table] = v.split('::')
    const meta = CRYPTO_TABLES[table]
    console.error(`   ${file}`)
    console.error(`      tabel: ${table} — lekt: ${meta.columns}`)
    if (meta.extra) console.error(`      ${meta.extra}`)
    console.error(`      ${meta.hint}`)
  }
  console.error('')
  console.error("WAAROM dit hard faalt: een `*_hash` is een blind index (HMAC-SHA256 onder een server-only")
  console.error('sleutel). Dezelfde invoer geeft altijd dezelfde waarde, dus het is een STABIELE')
  console.error('correlatiesleutel waarmee rijen en gebruikers aan elkaar te knopen zijn — terwijl hij niets')
  console.error('toevoegt aan wat het scherm toont. Een `*_encrypted` is ciphertext die de browser niet kan')
  console.error('ontsleutelen. Beide horen daar dus simpelweg niet te komen, en `select(\'*\')` stuurt ze mee')
  console.error('zonder dat er iets zichtbaar verandert — precies waarom dit twee keer met de hand gevonden')
  console.error('moest worden in plaats van door een gate.')
  console.error('')
  console.error('OPLOSSING: vraag een expliciete kolomlijst op. Deze regel staat LOS van de ALLOWLIST —')
  console.error('een bestand daarop zetten onderdrukt hem niet, en dat is de bedoeling.')
  process.exit(1)
}

const violations = readers.filter((r) => !ALLOWLIST.has(r))
const stale = [...ALLOWLIST].filter((a) => !readers.includes(a)).sort()

if (stale.length > 0) {
  console.log('ℹ  Allowlist-entries die geen display-read meer doen (Fase b-voortgang — mag opgeruimd):')
  console.log(stale.map((s) => `   - ${s}`).join('\n'))
  console.log('')
}

if (violations.length > 0) {
  console.error('✗ Datapad-conventie (ADR 0058): nieuwe directe client-read(s) voor weergavedata gevonden.')
  console.error('')
  for (const v of violations) console.error(`   ${v}`)
  console.error('')
  console.error('Weergavedata hoort via een server-loader/bundel (lib/*-data-loader.ts → DashboardData → props),')
  console.error('of on-demand via een API-route (fetch). Zie docs/adr/0058-*.md en de CLAUDE.md-sectie "Datapad-conventie".')
  console.error('Is dit een legitieme uitzondering (eigen-rij pref / auth / realtime)? Dan hoort er geen display-read te staan;')
  console.error('anders motiveer + zet het bestand bewust op de ALLOWLIST in dit script.')
  process.exit(1)
}

console.log(`✓ Datapad-conventie: ${readers.length} bekende client-readers, 0 nieuwe overtredingen (allowlist dekt de bestaande).`)
console.log(
  `✓ Kolomregel: 0 nieuwe select('*') op crypto-tabellen in clientcode` +
    (openResidue.length > 0 ? ` (${openResidue.length} bekende rest, zie hierboven).` : '.'),
)
process.exit(0)
