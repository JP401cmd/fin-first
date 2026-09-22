import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Bron-gate voor ADR 0146 — "Beheer ziet gebruik, geen inhoud".
 *
 * Tot sep 2026 kon een superadmin via /beheer het vermogen, de schulden en de
 * rekeningsaldi van een gebruiker zien en diens volledige data exporteren. Die
 * paden zijn weg. Deze test voorkomt dat ze stil terugkomen.
 *
 * FAIL-CLOSED. Elke `.from('<tabel>').select('<kolommen>')` in een beheer-bron
 * moet óf op een tabel uit {@link VRIJ_LEESBAAR} staan (configuratie,
 * operationele logs, gebruiksmeting, en wat de gebruiker zelf naar ons stuurde),
 * óf alleen meta-kolommen lezen ({@link META_KOLOMMEN}: dát en wanneer, nooit
 * wat). Een NIEUWE tabel valt dus automatisch onder de strenge regel — wie hem
 * vrij wil lezen, moet hem hier bewust toevoegen, met reden. Idem voor RPC's:
 * alleen {@link TOEGESTANE_RPCS}. De chat-tabellen zijn nooit leesbaar.
 *
 * Gescand: app/api/admin, app/(app)/beheer, components/app/beheer, lib/beheer,
 * plus élke route onder app/api die `isSuperAdmin` of `superadminGate` gebruikt.
 *
 * Grenzen, bewust benoemd:
 *  - tekstscan: een dynamische tabel- of kolomnaam (variabele) ziet hij niet;
 *  - de inhoud van een embed (`tabel(kolommen)`) binnen een vrij leesbare tabel
 *    wordt niet apart getoetst;
 *  - `app_settings` staat op de vrije lijst omdat beheer er zijn configuratie
 *    leest. Per-gebruiker-sleutels (check-ins) zijn via de sessie-client
 *    afgeschermd door migratie 20260915120000; een service-role-lezing van een
 *    per-gebruiker `value` toets je met de hand.
 */

const ROOT = join(__dirname, '..', '..')

const SCAN_DIRS = ['app/api/admin', 'app/(app)/beheer', 'components/app/beheer', 'lib/beheer']

/** Tabellen die beheer met elke kolom mag lezen — met de reden per groep. */
const VRIJ_LEESBAAR = new Set([
  // Configuratie en referentiedata (geen gebruikersdata).
  'app_settings',
  'aow_leeftijd',
  'fire_assumptions',
  // `news_articles`: platform-brede artikelbak met openbaar nieuws uit publieke
  // bronnen plus de daarvan afgeleide duiding (ADR 0171) — geen user_id, geen
  // gebruikersdata, niets wat een gebruiker invoerde. De enige persoonsverwijzing
  // is `teruggetrokken_door`: de beheerder zélf die een duiding terugtrok (B4,
  // dezelfde soort als `admin_actions_log.actor_id`). /beheer/nieuws leest hem
  // met alle kolommen voor de grond, het terugtrekken en de K1-meting.
  // Wat NIET onder deze reden valt: de per-lezer-tabellen van de Krant
  // (`nieuwsprofiel`, `krant_edities`, `krant_editie_items`, ADR 0173) — die
  // blijven op de strenge regel; de herberekening na terugtrekken leest ze in
  // lib/krant via de service-role en geeft beheer alleen een aantal terug.
  // Zelfde lijn voor de twee oppervlakken van kaart 1B fase 3, die deze scan
  // dus NIET hoeven te verruimen (openstaande G6 blijft dicht):
  //  - `GET /api/admin/krant-meting` + het meting-paneel lezen alléén
  //    `job_runs` (hieronder, operationeel): de tellingen per profieltype zijn
  //    in de cron-summary al k=5-onderdrukt;
  //  - de testsectie op /nieuws leest wél editie-inhoud, maar uitsluitend de
  //    EIGEN rij van de aanroeper via de sessie-client onder own-row-RLS
  //    (lib/krant/testeditie.ts) — een superadmin ziet daar zijn eigen editie,
  //    nooit die van een ander. Die belofte hangt niet aan deze scan maar aan
  //    RLS + geen service-role; bewaakt door lib/krant/testeditie.gate.test.ts.
  'news_articles',
  'questionnaires',
  'questionnaire_questions',
  'signup_email_allowlist',
  // Operationeel: logs, jobs, test-rondes, beheeracties zelf.
  'admin_actions_log',
  'contract_events',
  'error_logs',
  'error_log_resolutions',
  'job_runs',
  'mail_log',
  'tier_assignments_log',
  'uat_results',
  'uat_rounds',
  // Gebruiksmeting zonder inhoud.
  'ai_token_usage',
  'ai_usage',
  'user_activity_days',
  // Uitnodigingen voor vragenlijsten (ADR 0147). Beheer kiest zelf wie er een
  // krijgt en moet kunnen zien hoe de uitnodiging loopt (uitgenodigd, gezien,
  // uitgesteld, geweigerd). Draagt geen enkel antwoord — alleen tijdstempels,
  // de herkomst en het e-mailadres dat beheer er zélf in heeft gezet.
  'questionnaire_invitations',
  // Gebruikersgroepen (ADR 0147, fase 3). `user_groups` is configuratie die
  // beheer zelf maakt: een naam, een omschrijving, statisch/dynamisch en een
  // regelset op gebruiksmeta — geen user_id, geen antwoorden, geen bedragen.
  'user_groups',
  // `user_group_members` is lidmaatschap dat beheer zélf koos (group_id,
  // user_id, added_at). Beheer ziet dus alleen wie het er zelf in zette en
  // wanneer — dezelfde grens als handmatige uitnodigingen hierboven.
  'user_group_members',
  'user_feature_visits',
  'household_members',
  'news_feedback',
  // Wat de gebruiker zelf naar ons stuurde (ADR 0146 besluit 1). De
  // vragenlijst-invullingen: antwoorden ja, invuller nee — de route laat
  // user_id weg en RLS geeft superadmins er geen leesrecht op.
  'feedback',
  'user_reports',
  'calculator_reports',
  'questionnaire_sessions',
])

/** Nooit lezen vanuit beheer — ook geen telling (ADR 0137). */
const VERBODEN_TABELLEN = new Set(['chat_conversations', 'chat_messages'])

/** Voor elke andere tabel: alleen deze kolommen. */
const META_KOLOMMEN = new Set(['id', 'user_id', 'created_at', 'updated_at', 'is_active', 'status', 'parent_id'])

/**
 * `profiles` draagt naast account-meta ook financiële profielvelden (inkomen,
 * leeftijd, FIRE-instellingen). Alleen deze kolommen horen bij beheer.
 */
const PROFIEL_KOLOMMEN = new Set([
  'id',
  'role',
  'full_name',
  'first_name',
  'blocked_at',
  'active_subscriptions',
  'commercial_tier',
  'created_at',
  'onboarding_completed',
  'last_known_phase',
  'is_demo_user',
])

/** RPC's die beheer mag aanroepen; elk geeft tellingen, config of account-lookup terug. */
const TOEGESTANE_RPCS = new Set([
  'admin_lookup_user_by_email',
  'admin_lookup_users_by_emails',
  'applied_migration_versions',
  'admin_activity_counts',
  // ADR 0147 fase 2: per app-deel een aantal gebruikers — geen namen, geen
  // dagen, geen routes (service-role-only).
  'admin_module_activity_counts',
  // ADR 0153: het gebruiksrapport voor /beheer/gebruik — tellingen per stroom,
  // week, aanmeldmaand en profielstand, in de database k-onderdrukt (k = 5);
  // geen ids, e-mailadressen, losse datums of chat (service-role-only).
  'admin_gebruik_analyse',
  // ADR 0153: doorstroom per actieve dag (Sankey) — idem tellingen, k-onderdrukt,
  // knopen zijn waardestromen, geen schermen (service-role-only).
  'admin_gebruik_doorstroom',
  // ADR 0147 fase 3: e-mailadres bij door beheer zelf gekozen groepsleden, zodat
  // beheer ze herkent — account-lookup, zelfde soort als de twee lookups
  // hierboven, geen inhoud (service-role-only).
  'admin_emails_for_user_ids',
  'web_vitals_p75_summary',
  'web_vitals_p75_daily',
  'web_vitals_p75_by_route',
])

function bronbestanden(dir: string): string[] {
  const abs = join(ROOT, dir)
  let entries: string[]
  try {
    entries = readdirSync(abs)
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    const p = join(abs, e)
    if (statSync(p).isDirectory()) out.push(...bronbestanden(relative(ROOT, p)))
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

function beheerBronnen(): string[] {
  const set = new Set(SCAN_DIRS.flatMap(bronbestanden))
  for (const f of bronbestanden('app/api')) {
    if (/\b(isSuperAdmin|superadminGate|SUPERADMIN_ROLE)\b/.test(readFileSync(f, 'utf8'))) set.add(f)
  }
  return [...set]
}

interface Lezing {
  bestand: string
  tabel: string
  kolommen: string | null
}

/** Vind `.from('<tabel>')` en de eerste letterlijke `.select('…')` in dezelfde keten. */
function vindLezingen(bron: string, bestand: string): Lezing[] {
  const lezingen: Lezing[] = []
  const fromRe = /\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = fromRe.exec(bron))) {
    const tabel = m[1]
    const rest = bron.slice(m.index + m[0].length)
    // De keten eindigt bij de volgende .from( — kijk niet verder dan dat.
    const volgende = rest.search(/\.from\(/)
    const keten = volgende === -1 ? rest.slice(0, 600) : rest.slice(0, Math.min(volgende, 600))
    const sel = /\.select\(\s*(?:['"`]([^'"`]*)['"`])?/.exec(keten)
    lezingen.push({ bestand, tabel, kolommen: sel ? (sel[1] ?? '*') : null })
  }
  return lezingen
}

function vindRpcs(bron: string): string[] {
  return [...bron.matchAll(/\.rpc\(\s*['"`](\w+)['"`]/g)].map((m) => m[1])
}

function kolomlijst(select: string): string[] {
  return select
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

function schendingen(lezingen: Lezing[]): string[] {
  const fouten: string[] = []
  for (const l of lezingen) {
    const plek = `${relative(ROOT, l.bestand)} → ${l.tabel}`
    if (VERBODEN_TABELLEN.has(l.tabel)) {
      fouten.push(`${plek}: chat-tabellen zijn nooit leesbaar vanuit beheer`)
      continue
    }
    if (l.kolommen === null || VRIJ_LEESBAAR.has(l.tabel)) continue
    const toegestaan = l.tabel === 'profiles' ? PROFIEL_KOLOMMEN : META_KOLOMMEN
    for (const kolom of kolomlijst(l.kolommen)) {
      if (!toegestaan.has(kolom)) fouten.push(`${plek}: kolom "${kolom}" draagt (mogelijk) inhoud`)
    }
  }
  return fouten
}

describe('ADR 0146 — beheer leest geen gebruikersinhoud', () => {
  const bronnen = beheerBronnen()
  const lezingen = bronnen.flatMap((f) => vindLezingen(readFileSync(f, 'utf8'), f))

  it('scant daadwerkelijk beheer-bronnen (anders is groen betekenisloos)', () => {
    expect(bronnen.length).toBeGreaterThan(50)
    expect(lezingen.length).toBeGreaterThan(50)
    expect(lezingen.some((l) => l.tabel === 'profiles')).toBe(true)
  })

  it('geen beheer-bron leest inhoudskolommen of chat-tabellen', () => {
    expect(schendingen(lezingen)).toEqual([])
  })

  it('beheer roept alleen bekende RPC\'s aan', () => {
    const onbekend = bronnen.flatMap((f) =>
      vindRpcs(readFileSync(f, 'utf8'))
        .filter((r) => !TOEGESTANE_RPCS.has(r))
        .map((r) => `${relative(ROOT, f)} → ${r}`),
    )
    expect(onbekend, 'nieuwe RPC in beheer: toets of hij inhoud teruggeeft en voeg hem dan bewust toe').toEqual([])
  })

  it('de vrije lijst bevat geen tabel met financiële inhoud', () => {
    for (const t of ['assets', 'debts', 'transactions', 'bank_accounts', 'budgets', 'goals', 'profiles']) {
      expect(VRIJ_LEESBAAR.has(t), t).toBe(false)
    }
  })

  it('de verwijderde supportview en admin-export bestaan niet meer', () => {
    for (const pad of ['app/api/admin/user-diagnose/route.ts', 'app/api/admin/user-export/route.ts']) {
      expect(() => statSync(join(ROOT, pad)), pad).toThrow()
    }
  })

  describe('de scanner zelf', () => {
    const f = join(ROOT, 'app/api/admin/voorbeeld/route.ts')

    it('vangt de oude diagnose-query (bedragen en rekeningnamen)', () => {
      const bron = `service.from('assets').select('asset_type, name, current_value').eq('user_id', id)`
      expect(schendingen(vindLezingen(bron, f))).toHaveLength(3)
    })

    it('is fail-closed: een onbekende tabel mag alleen meta-kolommen', () => {
      expect(schendingen(vindLezingen(`x.from('nieuwe_tabel').select('bedrag')`, f))).toHaveLength(1)
      expect(schendingen(vindLezingen(`x.from('nieuwe_tabel').select('id, created_at')`, f))).toEqual([])
    })

    it('vangt select(*) en een lege select()', () => {
      expect(schendingen(vindLezingen(`x.from('transactions').select('*')`, f))).toHaveLength(1)
      expect(schendingen(vindLezingen(`x.from('debts').select()`, f))).toHaveLength(1)
    })

    it('vangt financiële profielvelden', () => {
      expect(schendingen(vindLezingen(`x.from('profiles').select('id, monthly_income')`, f))).toHaveLength(1)
    })

    it('vangt elke lezing op chat, ook een telling', () => {
      const bron = `x.from('chat_conversations').select('id', { count: 'exact', head: true })`
      expect(schendingen(vindLezingen(bron, f))).toHaveLength(1)
    })

    it('laat tellingen, tijdstempels en vrij leesbare tabellen door', () => {
      const bron = `
        x.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', u)
        x.from('transactions').select('created_at').order('created_at')
        x.from('bank_sync_log').select('created_at, status')
        x.from('job_runs').select('*')`
      expect(schendingen(vindLezingen(bron, f))).toEqual([])
    })

    it('kijkt niet over de volgende .from( heen', () => {
      const bron = `x.from('assets').delete().eq('id', a); y.from('ai_token_usage').select('feature, input_tokens')`
      expect(schendingen(vindLezingen(bron, f))).toEqual([])
    })

    it('vindt RPC-namen', () => {
      expect(vindRpcs(`s.rpc('admin_activity_counts'); s.rpc("iets_nieuws", { a: 1 })`)).toEqual([
        'admin_activity_counts',
        'iets_nieuws',
      ])
    })
  })
})
