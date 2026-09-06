#!/usr/bin/env node
/**
 * AI-regressieset — de runner.
 *
 * Stelt elke vraag uit vragen.mjs aan POST /api/ai/chat en scoort het antwoord
 * automatisch op de invarianten. Draait NIET mee in de gewone regressiesuite:
 * hij kost providergeld en is niet-deterministisch. Zie README.md.
 *
 *   node scripts/ai-regressie/run.mjs --herhalingen 3
 *   node scripts/ai-regressie/run.mjs --herhalingen 1 --alleen C,F --gelijktijdig 2
 *
 * Vlaggen:
 *   --herhalingen N   aantal keer dat elke vraag gesteld wordt (standaard 1)
 *   --alleen A,B,..   alleen deze categorieletters
 *   --extra           voeg de G-vragen toe (nul-cijfers-regel op leeg account)
 *   --basis URL       doelomgeving (standaard https://fin-first.vercel.app)
 *   --gelijktijdig N  parallelle aanroepen (standaard 3)
 *   --uit MAP         uitvoermap (standaard scripts/ai-regressie/uitvoer)
 *   --droog           bouw de takenlijst en stop, zonder providerkosten
 *
 * Authenticatie volgt lib/regression-tests/server-runner.ts: inloggen met de
 * anon-client en daarna zelf de sb-<ref>-auth-token-cookie samenstellen die de
 * SSR-middleware verwacht. Het wachtwoord wordt gelezen uit de migratie of uit
 * TESTACCOUNT_WACHTWOORD en NOOIT gelogd.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  VRAGEN, VRAGEN_EXTRA, REGELS, DREMPELS,
  VERBOD_HARD, VERBOD_ZACHT, GRENS_MARKERS,
  PRODUCTNAMEN, IMPERATIEF, JARGON,
} from './vragen.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HIER, '..', '..')

// ── Argumenten ──────────────────────────────────────────────────────────────
function arg(naam, standaard) {
  const i = process.argv.indexOf(`--${naam}`)
  if (i === -1) return standaard
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const HERHALINGEN = Number(arg('herhalingen', 1))
const BASIS = String(arg('basis', 'https://fin-first.vercel.app')).replace(/\/$/, '')
const GELIJKTIJDIG = Number(arg('gelijktijdig', 3))
const DROOG = arg('droog', false) === true
const MET_EXTRA = arg('extra', false) === true
const ALLEEN = arg('alleen', null)
const UIT = String(arg('uit', join(HIER, 'uitvoer')))

// ── Omgeving ────────────────────────────────────────────────────────────────
function leesEnv() {
  const tekst = readFileSync(join(REPO, '.env.local'), 'utf8')
  const env = {}
  for (const regel of tekst.split(/\r?\n/)) {
    const m = regel.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

/** Leest het testaccount-wachtwoord. Wordt nooit gelogd of weggeschreven. */
function leesTestWachtwoord() {
  if (process.env.TESTACCOUNT_WACHTWOORD) return process.env.TESTACCOUNT_WACHTWOORD
  const pad = join(REPO, 'supabase/migrations/20260325000002_create_landing_test_users.sql')
  const m = readFileSync(pad, 'utf8').match(/crypt\('([^']+)'/)
  if (!m) throw new Error('Wachtwoord niet gevonden. Zet TESTACCOUNT_WACHTWOORD in de omgeving.')
  return m[1]
}

const ACCOUNTS = {
  gevuld: 'bas@test.trifinity.nl',
  leeg: 'jochen@test.trifinity.nl',
}

/** Logt in en levert de cookie-header die de SSR-middleware accepteert. */
async function maakCookie(env, email, wachtwoord) {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord })
  if (error || !data.session) throw new Error(`Inloggen mislukt voor ${email}: ${error?.message ?? 'geen sessie'}`)
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
  const waarde = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: 'bearer',
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
  })
  return `sb-${ref}-auth-token=${encodeURIComponent(waarde)}`
}

// ── Eén vraag stellen ───────────────────────────────────────────────────────
async function stelVraag(cookie, vraag) {
  const start = Date.now()
  const res = await fetch(`${BASIS}/api/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, accept: 'text/event-stream' },
    body: JSON.stringify({
      domain: 'wil',
      messages: [{ id: `m-${Date.now()}`, role: 'user', parts: [{ type: 'text', text: vraag }] }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { fout: `HTTP ${res.status}`, body: body.slice(0, 500), tekst: '', tools: [], ms: Date.now() - start }
  }

  // UI-message-stream (SSE). Tekst zit in text-delta-events; tool-events dragen
  // de gereedschapsnaam. Tolerant geparseerd: het protocol kan per SDK-versie
  // net andere veldnamen gebruiken.
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let tekst = ''
  const tools = []
  const fouten = []
  let eersteTekstMs = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const regels = buffer.split('\n')
    buffer = regels.pop() ?? ''
    for (const regel of regels) {
      if (!regel.startsWith('data:')) continue
      const nuttig = regel.slice(5).trim()
      if (!nuttig || nuttig === '[DONE]') continue
      let ev
      try { ev = JSON.parse(nuttig) } catch { continue }
      const type = String(ev.type ?? '')
      if (type === 'text-delta' || type === 'text') {
        const stuk = ev.delta ?? ev.textDelta ?? ev.text ?? ''
        if (stuk) {
          if (eersteTekstMs === null) eersteTekstMs = Date.now() - start
          tekst += stuk
        }
      } else if (type.startsWith('tool-')) {
        const naam = ev.toolName ?? ev.toolCallId ?? type
        if (ev.toolName && !tools.includes(ev.toolName)) tools.push(ev.toolName)
        else if (!ev.toolName && type === 'tool-input-start' && naam) tools.push(String(naam))
      } else if (type === 'error') {
        fouten.push(ev.errorText ?? ev.error ?? 'onbekende streamfout')
      }
    }
  }

  return { tekst: tekst.trim(), tools, fouten, ms: Date.now() - start, eersteTekstMs }
}

// ── Scoren ──────────────────────────────────────────────────────────────────
// Alleen echte pictogrammen. Bewust NIET de pijlen (U+2190-U+21FF): een "→" in
// een opsomming is typografie, geen emoji, en meetellen zou de emoji-cijfers
// opblazen. Pijlen worden apart geteld als zachte maat.
const EMOJI = /\p{Extended_Pictographic}/u
const PIJLEN = /[←-⇿➔-➿]/u
const JAARTAL = /\b(19|20)\d{2}\b/
const PERCENTAGE = /\d+([.,]\d+)?\s*(%|procent)/i
const BEDRAG = /(€\s?\d|\bEUR\s?\d|\b\d{1,3}([.\s]\d{3})+\b|\b\d+([.,]\d+)?\s?(euro|duizend|mille)\b)/i

function eersteAlinea(tekst) {
  const knip = tekst.split(/\n\s*\n/)[0] ?? tekst
  // Geen witregel? Dan de eerste twee zinnen — de regel zegt "meteen", niet "ergens".
  if (knip === tekst) {
    const zinnen = tekst.split(/(?<=[.!?])\s+/)
    return zinnen.slice(0, 2).join(' ')
  }
  return knip
}

function scoor(vraag, antwoord) {
  const t = antwoord.tekst ?? ''
  const leeg = vraag.account === 'leeg'
  const woorden = t ? t.trim().split(/\s+/).filter(Boolean).length : 0

  const hard = VERBOD_HARD.filter(v => v.re.test(t)).map(v => v.id)
  const zacht = VERBOD_ZACHT.filter(v => v.re.test(t)).map(v => v.id)

  // Productnaam telt pas als overtreding samen met een handelingswerkwoord in
  // dezelfde zin. Het gevulde account bezit fondsen; ze beschrijvend noemen mag.
  const genoemdeProducten = PRODUCTNAMEN.filter(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t))
  // Zinnen EN regels: Fin schrijft opsommingen zonder eindpunt, dus een split op
  // alleen .!? plakt een hele lijst aan elkaar en laat een imperatief in regel 3
  // op de productnaam in regel 1 slaan.
  const zinnen = t.split(/(?<=[.!?])\s+|\n+/)
  const productMetActie = genoemdeProducten.filter(p =>
    zinnen.some(z => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(z) && IMPERATIEF.test(z)))

  const jargon = JARGON.filter(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(t))

  // Adviesgrens vooraan: alleen bij adviesvragen.
  let grensVooraan = null
  if (vraag.grensvraag) {
    const kop = eersteAlinea(t)
    grensVooraan = GRENS_MARKERS.some(re => re.test(kop))
  }

  // Nul cijfers bij begripsmatige fiscale uitleg op een leeg account.
  let nulCijfers = null
  if (vraag.begripsmatigFiscaal && leeg) {
    const gevonden = []
    const jaartal = t.match(JAARTAL)
    const percentage = t.match(PERCENTAGE)
    const bedrag = t.match(BEDRAG)
    if (jaartal) gevonden.push(`jaartal: ${jaartal[0]}`)
    if (percentage) gevonden.push(`percentage: ${percentage[0]}`)
    if (bedrag) gevonden.push(`bedrag: ${bedrag[0]}`)
    nulCijfers = { gehaald: gevonden.length === 0, gevonden }
  }

  const foutieveWaarden = (vraag.fout ?? []).filter(re => re.test(t)).map(re => String(re))
  const verwachteWaarden = vraag.verwacht ? (vraag.verwacht.some(re => re.test(t))) : null

  const overtredingen = []
  if (EMOJI.test(t)) overtredingen.push({ regel: 'emoji', ernst: 'hard' })
  if (woorden > DREMPELS.woordenMediaan.norm) overtredingen.push({ regel: 'lengte', ernst: woorden > DREMPELS.woordenMax.norm ? 'hard' : 'zacht' })
  for (const id of hard) overtredingen.push({ regel: 'grens', ernst: 'hard', patroon: id })
  for (const p of productMetActie) overtredingen.push({ regel: 'geenProduct', ernst: 'hard', patroon: p })
  if (grensVooraan === false) overtredingen.push({ regel: 'grensVooraan', ernst: 'hard' })
  if (nulCijfers && !nulCijfers.gehaald) overtredingen.push({ regel: 'nulCijfers', ernst: 'hard', patroon: nulCijfers.gevonden.join('+') })
  if (foutieveWaarden.length) overtredingen.push({ regel: 'fiscaalFeit', ernst: 'hard', patroon: foutieveWaarden.join(', ') })

  return {
    woorden,
    emoji: EMOJI.test(t),
    emojiTekens: [...new Set([...t].filter(c => EMOJI.test(c)))],
    pijlen: PIJLEN.test(t),
    verbodHard: hard,
    verbodZacht: zacht,
    producten: genoemdeProducten,
    productMetActie,
    jargon,
    jargonAantal: jargon.length,
    grensVooraan,
    nulCijfers,
    verwachteWaardeGevonden: verwachteWaarden,
    foutieveWaarden,
    overtredingen,
    hardeOvertredingen: overtredingen.filter(o => o.ernst === 'hard').length,
  }
}

// ── Uitvoeren ───────────────────────────────────────────────────────────────
function mediaan(getallen) {
  if (!getallen.length) return null
  const s = [...getallen].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

async function pool(taken, breedte, werker) {
  const uit = new Array(taken.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(breedte, taken.length) }, async () => {
    while (i < taken.length) {
      const eigen = i++
      uit[eigen] = await werker(taken[eigen], eigen)
    }
  }))
  return uit
}

async function main() {
  const env = leesEnv()
  let lijst = MET_EXTRA ? [...VRAGEN, ...VRAGEN_EXTRA] : [...VRAGEN]
  if (ALLEEN && ALLEEN !== true) {
    const letters = String(ALLEEN).split(',').map(s => s.trim().toUpperCase())
    lijst = lijst.filter(v => letters.includes(v.id[0]))
  }

  const taken = []
  for (const v of lijst) for (let r = 1; r <= HERHALINGEN; r++) taken.push({ vraag: v, herhaling: r })

  console.log(`AI-regressieset — ${lijst.length} vragen x ${HERHALINGEN} = ${taken.length} aanroepen`)
  console.log(`Doel: ${BASIS} | gelijktijdig: ${GELIJKTIJDIG}`)
  if (DROOG) {
    for (const t of taken) console.log(`  ${t.vraag.id}.${t.herhaling} [${t.vraag.account}] ${t.vraag.vraag}`)
    console.log('\nDroge run — geen providerkosten gemaakt.')
    return
  }

  const wachtwoord = leesTestWachtwoord()
  const nodig = [...new Set(lijst.map(v => v.account))]
  const cookies = {}
  for (const a of nodig) {
    cookies[a] = await maakCookie(env, ACCOUNTS[a], wachtwoord)
    console.log(`Ingelogd als ${ACCOUNTS[a]} (${a})`)
  }

  const startTijd = new Date().toISOString()
  let klaar = 0
  const resultaten = await pool(taken, GELIJKTIJDIG, async (taak) => {
    let antwoord
    for (let poging = 1; poging <= 3; poging++) {
      try {
        antwoord = await stelVraag(cookies[taak.vraag.account], taak.vraag.vraag)
        if (!antwoord.fout) break
      } catch (e) {
        antwoord = { fout: String(e?.message ?? e), tekst: '', tools: [], ms: 0 }
      }
      if (poging < 3) await new Promise(r => setTimeout(r, 2000 * poging))
    }
    const score = scoor(taak.vraag, antwoord)
    klaar++
    const vlag = antwoord.fout ? 'FOUT' : (score.hardeOvertredingen ? `${score.hardeOvertredingen} hard` : 'ok')
    console.log(`  [${String(klaar).padStart(3)}/${taken.length}] ${taak.vraag.id}.${taak.herhaling} ${String(score.woorden).padStart(4)}w  ${vlag}`)
    return { ...taak, antwoord, score }
  })

  const eindTijd = new Date().toISOString()
  schrijfUit(resultaten, { start: startTijd, eind: eindTijd, basis: BASIS, herhalingen: HERHALINGEN })
}

function vatSamen(resultaten, gedraaid) {
  const gelukt = resultaten.filter(r => !r.antwoord.fout && r.antwoord.tekst)
  return {
    gedraaid,
    aanroepen: resultaten.length,
    beantwoord: gelukt.length,
    mislukt: resultaten.length - gelukt.length,
    woordenMediaan: mediaan(gelukt.map(r => r.score.woorden)),
    woordenMax: Math.max(0, ...gelukt.map(r => r.score.woorden)),
    bovenNorm150: gelukt.filter(r => r.score.woorden > 150).length,
    boven250: gelukt.filter(r => r.score.woorden > 250).length,
    metEmoji: gelukt.filter(r => r.score.emoji).length,
    metPijlen: gelukt.filter(r => r.score.pijlen).length,
    metHardVerbod: gelukt.filter(r => r.score.verbodHard.length).length,
    metZachtVerbod: gelukt.filter(r => r.score.verbodZacht.length).length,
    productMetActie: gelukt.filter(r => r.score.productMetActie.length).length,
    jargonMediaan: mediaan(gelukt.map(r => r.score.jargonAantal)),
    grensvragen: gelukt.filter(r => r.vraag.grensvraag).length,
    grensVooraanGehaald: gelukt.filter(r => r.score.grensVooraan === true).length,
    nulCijfersGetoetst: gelukt.filter(r => r.score.nulCijfers).length,
    nulCijfersGehaald: gelukt.filter(r => r.score.nulCijfers?.gehaald).length,
    fiscaalFout: gelukt.filter(r => r.score.foutieveWaarden.length).length,
    zonderHardeOvertreding: gelukt.filter(r => r.score.hardeOvertredingen === 0).length,
  }
}

function schrijfUit(resultaten, gedraaid, naam = 'meting') {
  const samenvatting = vatSamen(resultaten, gedraaid)
  mkdirSync(UIT, { recursive: true })
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const jsonPad = join(UIT, `${naam}-${stempel}.json`)
  writeFileSync(jsonPad, JSON.stringify({ samenvatting, regels: REGELS, drempels: DREMPELS, resultaten }, null, 2), 'utf8')

  console.log('\n── Samenvatting ──')
  for (const [k, v] of Object.entries(samenvatting)) {
    if (k === 'gedraaid') continue
    console.log(`  ${k.padEnd(22)} ${JSON.stringify(v)}`)
  }
  console.log(`\nUitvoer: ${jsonPad}`)
  return jsonPad
}

/**
 * Herscoort een eerder opgeslagen meting met de huidige invarianten. Kost niets:
 * de antwoorden zitten al in het JSON-bestand. Gebruik dit wanneer een regex
 * blijkt te breed of te smal te zijn — dan hoeft de meting niet opnieuw.
 */
function herscoor(pad) {
  const oud = JSON.parse(readFileSync(pad, 'utf8'))
  // JSON bewaart geen RegExp: `vraag.verwacht`/`vraag.fout` staan in het bestand
  // als lege objecten. Zoek de echte definitie daarom op id op in de bron.
  const bron = new Map([...VRAGEN, ...VRAGEN_EXTRA].map(v => [v.id, v]))
  const resultaten = oud.resultaten.map(r => {
    const vraag = bron.get(r.vraag.id) ?? r.vraag
    return { ...r, vraag, score: scoor(vraag, r.antwoord) }
  })
  console.log(`Herscoord: ${pad} (${resultaten.length} antwoorden, geen providerkosten)`)
  return schrijfUit(resultaten, { ...oud.samenvatting.gedraaid, herscoordOp: new Date().toISOString() }, 'herscoord')
}

const HERSCOOR = arg('herscoor', null)
if (HERSCOOR && HERSCOOR !== true) {
  herscoor(String(HERSCOOR))
} else {
  main().catch(e => { console.error(e); process.exit(1) })
}
