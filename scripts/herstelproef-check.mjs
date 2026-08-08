#!/usr/bin/env node
/**
 * Herstelproef-controle — draait de controlechecklist uit
 * `docs/beheerders-runbook.md` (§Back-up en herstel) tegen één Supabase-omgeving
 * en drukt er een vingerafdruk van af.
 *
 * Waarom dit script bestaat: de checklist stond als losse SQL in het runbook, en
 * die moet je op de dag van de proef twee keer met de hand draaien en met het oog
 * vergelijken — precies het moment waarop je onder tijdsdruk staat. Dit script
 * maakt er twee commando's en één diff van, en het dwingt de peildatum af (zie
 * hieronder). Het is de canonieke route; de SQL in het runbook blijft de fallback
 * voor als je alleen de Supabase SQL-editor hebt. Beide leveren dezelfde
 * vingerafdruk op — de kolommen worden bewust als tekst opgehaald (`amount::text`)
 * zodat de hash gelijk is aan die van `md5(string_agg(...))` in Postgres.
 *
 * DE PEILDATUM IS HET HELE PUNT. Een herstelde omgeving is een foto van het
 * moment van de back-up; productie is doorgelopen. Vergelijk je zonder afkap, dan
 * verschilt élke telling en zegt de uitkomst niets. `--cutoff` is daarom
 * verplicht: vul het tijdstip van de back-up in, dan telt aan beide kanten alleen
 * wat er op dat moment al bestond.
 *
 * WAT EEN VERSCHIL BETEKENT (de vergelijking is niet symmetrisch):
 *   - hersteld  >  productie : rijen zijn ná de back-up verwijderd. Verwacht en
 *                              niet fout — wel verklaren.
 *   - hersteld  <  productie : de back-up mist rijen die er wél waren. FOUT.
 *   - vingerafdruk verschilt bij een gelíjk rij-aantal: de inhoud is gedrift.
 *     FOUT. Bij een ongelijk rij-aantal zegt de vingerafdruk niets en wordt hij
 *     overgeslagen.
 *
 * ALLEEN LEZEN. Dit script schrijft niets naar de database of Storage, en zet
 * niets van de opgehaalde persoonsgegevens op schijf: het uitvoerbestand bevat
 * uitsluitend tellingen en hashes. Met `--storage-download` wordt één bestand
 * opgehaald om te bewijzen dát het er is; alleen de omvang in bytes wordt
 * gerapporteerd, de inhoud wordt weggegooid.
 *
 * Gebruik (vanuit de repo-root):
 *   # 1. Nulmeting op productie, op het tijdstip van de back-up:
 *   node --env-file=.env.local scripts/herstelproef-check.mjs \
 *     --cutoff=2026-08-08T02:00:00Z --out=herstelproef-productie.json
 *
 *   # 2. Zelfde meting tegen de herstelde omgeving, en vergelijken:
 *   HERSTELPROEF_SUPABASE_URL=... HERSTELPROEF_SERVICE_ROLE_KEY=... \
 *   node --env-file=.env.local scripts/herstelproef-check.mjs --doel=hersteld \
 *     --cutoff=2026-08-08T02:00:00Z --vergelijk=herstelproef-productie.json
 *
 * Opties:
 *   --cutoff=<ISO>       peildatum/-tijd van de back-up (verplicht)
 *   --doel=productie     leest NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (default)
 *   --doel=hersteld      leest HERSTELPROEF_SUPABASE_URL + HERSTELPROEF_SERVICE_ROLE_KEY
 *   --out=<bestand>      schrijft het resultaat als JSON weg
 *   --vergelijk=<best.>  vergelijkt met een eerder weggeschreven nulmeting
 *   --storage-download   haalt één bestand uit de bucket op als bewijs
 *
 * Uitvoercodes: 0 = alles groen · 1 = harde afwijking · 2 = verkeerd gebruik.
 *
 * De service-role-sleutel staat in `.env.local` en hoort daar te blijven; commit
 * hem nooit, en zet hem voor de herstelde omgeving alleen in de shell van dat
 * moment.
 */

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'

// Storage wordt bewust NIET op een vaste bucketnaam gecontroleerd. Het runbook
// noemde één bucket (`pension-documents`) die op 2026-08-08 leeg bleek te zijn —
// een controlepunt dat dus altijd zou slagen zonder iets te bewijzen. Het script
// vraagt de buckets daarom op bij de omgeving zelf; een nieuwe bucket valt
// automatisch onder de proef.
//
// Een databaseback-up herstelt de rijen in `storage.objects`, niet
// noodzakelijkerwijs de bestanden erachter. Daarom telt niet de rij maar het
// daadwerkelijk kunnen ophalen van een bestand als bewijs.
const STORAGE_DIEPTE = 3

// Paginagrootte voor het ophalen van vingerafdruk-rijen. PostgREST kapt zelf af
// op `max-rows`; 1000 blijft daar veilig onder en houdt het aantal rondjes laag.
const PAGINA = 1000

/**
 * De tabellen die de proef controleert. `vingerafdruk` staat alleen op tabellen
 * waar de inhoud ertoe doet én stabiel is: transacties en snapshots worden
 * aangemaakt en daarna nauwelijks gewijzigd, dus een hash over (id, datum,
 * bedrag) is een zinnige gelijkheidstoets. Tabellen die de gebruiker doorlopend
 * bijwerkt (budgetten, assets, schulden) tellen we alleen — een hash daarover
 * zou bij elke normale wijziging afgaan en dus niets bewaken.
 */
const TABELLEN = [
  { naam: 'profiles', vingerafdruk: ['id'] },
  { naam: 'transactions', vingerafdruk: ['id', 'date', 'amount::text'] },
  { naam: 'bank_accounts' },
  { naam: 'assets' },
  { naam: 'budgets' },
  { naam: 'debts' },
  { naam: 'net_worth_snapshots', vingerafdruk: ['id', 'snapshot_date', 'net_worth::text'] },
  { naam: 'bank_connections' },
]

function parseArgs(argv) {
  const args = { doel: 'productie', storageDownload: false }
  for (const arg of argv.slice(2)) {
    if (arg === '--storage-download') args.storageDownload = true
    else if (arg.startsWith('--cutoff=')) args.cutoff = arg.slice('--cutoff='.length)
    else if (arg.startsWith('--doel=')) args.doel = arg.slice('--doel='.length)
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length)
    else if (arg.startsWith('--vergelijk=')) args.vergelijk = arg.slice('--vergelijk='.length)
    else return { fout: `Onbekende optie: ${arg}` }
  }
  if (!args.cutoff) {
    return {
      fout:
        'Geef --cutoff=<ISO-tijdstip van de back-up> op. Zonder peildatum vergelijk ' +
        'je een foto met een film en verschilt elke telling.',
    }
  }
  if (Number.isNaN(Date.parse(args.cutoff))) {
    return { fout: `--cutoff is geen geldig tijdstip: ${args.cutoff}` }
  }
  if (args.doel !== 'productie' && args.doel !== 'hersteld') {
    return { fout: `--doel moet 'productie' of 'hersteld' zijn, niet '${args.doel}'` }
  }
  return args
}

function omgeving(doel) {
  const url =
    doel === 'hersteld' ? process.env.HERSTELPROEF_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    doel === 'hersteld'
      ? process.env.HERSTELPROEF_SERVICE_ROLE_KEY
      : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    const namen =
      doel === 'hersteld'
        ? 'HERSTELPROEF_SUPABASE_URL en HERSTELPROEF_SERVICE_ROLE_KEY'
        : 'NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY'
    throw new Error(`Ontbrekende omgevingsvariabelen: ${namen}`)
  }
  return { url, key }
}

/** Telt de rijen die op de peildatum al bestonden. */
async function telRijen(supabase, tabel, cutoff) {
  const { count, error } = await supabase
    .from(tabel)
    .select('id', { count: 'exact', head: true })
    .lte('created_at', cutoff)
  if (error) throw new Error(`Tellen van '${tabel}' mislukte: ${error.message}`)
  return count ?? 0
}

/**
 * Bouwt md5 over de opgegeven kolommen, gesorteerd op id — identiek aan
 * `md5(string_agg(kolom||'|'||..., ',' order by id))` in Postgres.
 */
async function bouwVingerafdruk(supabase, tabel, kolommen, cutoff) {
  const namen = kolommen.map((k) => k.split('::')[0])
  const delen = []
  for (let van = 0; ; van += PAGINA) {
    const { data, error } = await supabase
      .from(tabel)
      .select(kolommen.join(','))
      .lte('created_at', cutoff)
      .order('id', { ascending: true })
      .range(van, van + PAGINA - 1)
    if (error) throw new Error(`Vingerafdruk van '${tabel}' mislukte: ${error.message}`)
    if (!data || data.length === 0) break
    for (const rij of data) delen.push(namen.map((n) => rij[n]).join('|'))
    if (data.length < PAGINA) break
  }
  if (delen.length === 0) return null
  return createHash('md5').update(delen.join(',')).digest('hex')
}

/** auth.users loopt niet via PostgREST; de admin-API is de enige route. */
async function telAuthGebruikers(supabase, cutoff) {
  const grens = Date.parse(cutoff)
  const ids = []
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: PAGINA })
    if (error) throw new Error(`Ophalen van auth-gebruikers mislukte: ${error.message}`)
    const users = data?.users ?? []
    if (users.length === 0) break
    for (const user of users) {
      if (Date.parse(user.created_at) <= grens) ids.push(user.id)
    }
    if (users.length < PAGINA) break
  }
  ids.sort()
  return {
    rijen: ids.length,
    vingerafdruk: ids.length ? createHash('md5').update(ids.join(',')).digest('hex') : null,
  }
}

/** Loopt één bucket door en verzamelt de paden van de bestanden erin. */
async function verzamelPaden(supabase, bucket, prefix, diepte) {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGINA })
  if (error) throw new Error(`Bucket '${bucket}' uitlezen mislukte: ${error.message}`)
  const paden = []
  for (const item of data ?? []) {
    const pad = prefix ? `${prefix}/${item.name}` : item.name
    // Supabase geeft mappen terug als item zonder `id`; bestanden hebben er wel een.
    if (item.id) paden.push(pad)
    else if (diepte > 1) paden.push(...(await verzamelPaden(supabase, bucket, pad, diepte - 1)))
  }
  return paden
}

async function controleerStorage(supabase, downloadBewijs) {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) return { fout: error.message }

  const resultaat = {}
  for (const bucket of buckets ?? []) {
    const paden = await verzamelPaden(supabase, bucket.id, '', STORAGE_DIEPTE)
    const regel = { openbaar: bucket.public, bestanden: paden.length }

    // Bewijs dat het bestand er écht is en niet alleen de rij in storage.objects.
    // De inhoud wordt niet bewaard — alleen de omvang telt als bewijs.
    if (downloadBewijs && paden.length > 0) {
      const pad = paden[0]
      const { data: blob, error: dlFout } = await supabase.storage.from(bucket.id).download(pad)
      regel.download = dlFout ? { pad, fout: dlFout.message } : { pad, bytes: blob.size }
    }
    resultaat[bucket.id] = regel
  }
  return resultaat
}

async function meet(args) {
  const { url, key } = omgeving(args.doel)
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const meting = {
    doel: args.doel,
    project: new URL(url).hostname.split('.')[0],
    peildatum: args.cutoff,
    gemetenOp: new Date().toISOString(),
    tabellen: {},
  }

  meting.tabellen['auth.users'] = await telAuthGebruikers(supabase, args.cutoff)

  for (const tabel of TABELLEN) {
    const rijen = await telRijen(supabase, tabel.naam, args.cutoff)
    const vingerafdruk = tabel.vingerafdruk
      ? await bouwVingerafdruk(supabase, tabel.naam, tabel.vingerafdruk, args.cutoff)
      : null
    meting.tabellen[tabel.naam] = { rijen, vingerafdruk }
  }

  // Versleutelde bankkoppelingen: het aantal rijen dat ciphertext draagt. Of die
  // ciphertext ook ontsleutelt met ENCRYPTION_KEY_V1 bewijst dit script niet —
  // dat is de app-controle uit het runbook (inloggen + bankkoppeling openen).
  const { count: versleuteld, error: fout } = await supabase
    .from('bank_connections')
    .select('id', { count: 'exact', head: true })
    .lte('created_at', args.cutoff)
    .not('access_token_encrypted', 'is', null)
  if (fout) throw new Error(`Tellen van versleutelde bankkoppelingen mislukte: ${fout.message}`)
  meting.versleuteldeBankkoppelingen = versleuteld ?? 0

  meting.storage = await controleerStorage(supabase, args.storageDownload)
  return meting
}

function vergelijk(nulmeting, hersteld) {
  const regels = []
  let hardeFouten = 0

  if (nulmeting.peildatum !== hersteld.peildatum) {
    regels.push({
      naam: 'peildatum',
      status: 'FOUT',
      toelichting: `nulmeting ${nulmeting.peildatum} vs. ${hersteld.peildatum} — vergelijking is ongeldig`,
    })
    hardeFouten++
  }

  for (const [naam, basis] of Object.entries(nulmeting.tabellen)) {
    const nu = hersteld.tabellen[naam]
    if (!nu) {
      regels.push({ naam, status: 'FOUT', toelichting: 'ontbreekt in de herstelde omgeving' })
      hardeFouten++
      continue
    }
    if (nu.rijen < basis.rijen) {
      regels.push({
        naam,
        status: 'FOUT',
        toelichting: `${nu.rijen} hersteld vs. ${basis.rijen} op productie — de back-up mist ${basis.rijen - nu.rijen} rijen`,
      })
      hardeFouten++
      continue
    }
    if (nu.rijen > basis.rijen) {
      regels.push({
        naam,
        status: 'LET OP',
        toelichting: `${nu.rijen} hersteld vs. ${basis.rijen} op productie — ${nu.rijen - basis.rijen} rijen ná de back-up verwijderd; verklaren`,
      })
      continue
    }
    if (basis.vingerafdruk && nu.vingerafdruk && basis.vingerafdruk !== nu.vingerafdruk) {
      regels.push({
        naam,
        status: 'FOUT',
        toelichting: `${nu.rijen} rijen aan beide kanten, maar de vingerafdruk verschilt — de inhoud is gedrift`,
      })
      hardeFouten++
      continue
    }
    regels.push({ naam, status: 'OK', toelichting: `${nu.rijen} rijen` })
  }

  // Storage volgt dezelfde asymmetrie: minder bestanden dan productie betekent
  // dat de back-up ze mist; meer betekent dat er ná de back-up is opgeruimd.
  for (const [bucket, basis] of Object.entries(nulmeting.storage ?? {})) {
    if (bucket === 'fout') continue
    const naam = `storage/${bucket}`
    const nu = hersteld.storage?.[bucket]
    if (!nu) {
      regels.push({ naam, status: 'FOUT', toelichting: 'bucket ontbreekt in de herstelde omgeving' })
      hardeFouten++
      continue
    }
    if (nu.bestanden < basis.bestanden) {
      regels.push({
        naam,
        status: 'FOUT',
        toelichting: `${nu.bestanden} hersteld vs. ${basis.bestanden} op productie — bestanden ontbreken`,
      })
      hardeFouten++
      continue
    }
    if (basis.bestanden === 0) {
      regels.push({
        naam,
        status: 'LET OP',
        toelichting: 'bucket is leeg op productie — dit controlepunt bewijst niets',
      })
      continue
    }
    regels.push({ naam, status: 'OK', toelichting: `${nu.bestanden} bestanden` })
  }

  return { regels, hardeFouten }
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.fout) {
    console.error(args.fout)
    process.exit(2)
  }

  const meting = await meet(args)

  console.log(`\nHerstelproef-controle — ${meting.doel} (${meting.project})`)
  console.log(`Peildatum: ${meting.peildatum}\n`)
  for (const [naam, waarde] of Object.entries(meting.tabellen)) {
    const hash = waarde.vingerafdruk ? `  ${waarde.vingerafdruk}` : ''
    console.log(`  ${naam.padEnd(22)} ${String(waarde.rijen).padStart(7)}${hash}`)
  }
  console.log(
    `  ${'bankkopp. versleuteld'.padEnd(22)} ${String(meting.versleuteldeBankkoppelingen).padStart(7)}`,
  )
  for (const [bucket, regel] of Object.entries(meting.storage)) {
    if (bucket === 'fout') continue
    const bewijs = regel.download ? `  bewijs: ${JSON.stringify(regel.download)}` : ''
    const soort = regel.openbaar ? 'openbaar' : 'privé'
    console.log(
      `  ${`storage/${bucket}`.padEnd(22)} ${String(regel.bestanden).padStart(7)}  (${soort})${bewijs}`,
    )
  }

  if (args.out) {
    writeFileSync(args.out, `${JSON.stringify(meting, null, 2)}\n`, 'utf8')
    console.log(`\nWeggeschreven naar ${args.out}`)
  }

  if (!args.vergelijk) {
    console.log('')
    return
  }

  const nulmeting = JSON.parse(readFileSync(args.vergelijk, 'utf8'))
  const { regels, hardeFouten } = vergelijk(nulmeting, meting)
  console.log(`\nVergelijking met ${args.vergelijk}:\n`)
  for (const regel of regels) {
    console.log(`  [${regel.status.padEnd(6)}] ${regel.naam.padEnd(22)} ${regel.toelichting}`)
  }
  console.log(
    hardeFouten === 0
      ? '\nGeen harde afwijkingen. Loop de resterende controles met de hand af: inloggen, ' +
          'bedragen-steekproef en het ontsleutelen van een bankkoppeling.\n'
      : `\n${hardeFouten} harde afwijking(en). De herstelproef is NIET geslaagd — dat is een incident, ` +
          'geen voetnoot (zie .claude/skills/incidentprotocol).\n',
  )
  if (hardeFouten > 0) process.exit(1)
}

main().catch((err) => {
  console.error(`\nHerstelproef-controle afgebroken: ${err.message}\n`)
  process.exit(2)
})
