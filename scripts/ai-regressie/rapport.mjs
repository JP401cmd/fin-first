#!/usr/bin/env node
/**
 * Zet een meting om in een leesbaar rapport, met de nulmeting van 5 sep 2026
 * ernaast en het onderscheid tussen oude en nieuwe regels bewaard.
 *
 *   node scripts/ai-regressie/rapport.mjs scripts/ai-regressie/uitvoer/meting-....json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { DREMPELS, VERBOD_HARD, NULMETING, VRAGEN, VRAGEN_EXTRA, FISCALE_WAARHEID } from './vragen.mjs'

// De waarde die de repo zelf als bron heeft, per feitelijke vraag.
const CANONIEK = {
  D1: `€ ${FISCALE_WAARHEID.heffingsvrijSingle2026.waarde.toLocaleString('nl-NL')}`,
  D2: `${FISCALE_WAARHEID.forfaitBeleggingen2026.waarde.toFixed(2).replace('.', ',')} %`,
  D5: `${FISCALE_WAARHEID.aowLeeftijd.waarde} jaar`,
}

const pad = process.argv[2]
if (!pad) { console.error('Geef het pad naar een meting-JSON.'); process.exit(1) }
const data = JSON.parse(readFileSync(pad, 'utf8'))
const { samenvatting: s, resultaten } = data
const gelukt = resultaten.filter(r => !r.antwoord.fout && r.antwoord.tekst)

function pct(t, n) { return n ? `${Math.round((t / n) * 100)} %` : 'n.v.t.' }
function mediaan(a) { if (!a.length) return null; const x = [...a].sort((p, q) => p - q); const m = Math.floor(x.length / 2); return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2) }

const uit = []
uit.push('# AI-regressieset — meting')
uit.push('')
uit.push(`Gedraaid: ${s.gedraaid.start} tot ${s.gedraaid.eind} op ${s.gedraaid.basis}`)
uit.push(`Aanroepen: ${s.aanroepen} (${s.beantwoord} beantwoord, ${s.mislukt} mislukt), ${s.gedraaid.herhalingen} herhalingen per vraag.`)
uit.push('')

// ── Oude regels: de controlegroep ───────────────────────────────────────────
uit.push('## Regels die al bestonden tijdens de nulmeting (controlegroep)')
uit.push('')
uit.push('| Regel | Nulmeting 5 sep | Nu | Norm |')
uit.push('|---|---|---|---|')
uit.push(`| Max 150 woorden | mediaan ${NULMETING.woordenMediaan}, ${pct(NULMETING.bovenNorm150, NULMETING.n)} erboven | mediaan ${s.woordenMediaan}, ${pct(s.bovenNorm150, s.beantwoord)} erboven | 150 |`)
uit.push(`| Geen emoji | ${pct(NULMETING.metEmoji, NULMETING.n)} | ${pct(s.metEmoji, s.beantwoord)} | 0 |`)
uit.push(`| Geen product-aanbeveling | ${NULMETING.productMetActie} geval | ${s.productMetActie} | 0 |`)
uit.push(`| Jargon per antwoord | mediaan ${NULMETING.jargonMediaan} | mediaan ${s.jargonMediaan} | 2 |`)
uit.push('')
uit.push(`De nulmeting is met de hand gescoord op ${NULMETING.n} antwoorden (${NULMETING.bron}); de meting hierboven automatisch. Vergelijkbaar in richting, niet in decimalen.`)
uit.push('')

// ── Nieuwe regels: het experiment ───────────────────────────────────────────
uit.push('## Regels die NA de nulmeting zijn geschreven (het experiment)')
uit.push('')
uit.push('| Regel | Nulmeting 5 sep | Nu | Norm |')
uit.push('|---|---|---|---|')
uit.push(`| Geen vergelijkend oordeel / aansporing | ${NULMETING.grensDuidelijkOver} duidelijk over, ${NULMETING.grensRandje} op het randje (van ${NULMETING.n}) | ${s.metHardVerbod} hard, ${s.metZachtVerbod} twijfel (van ${s.beantwoord}) | 0 |`)
uit.push(`| Adviesgrens in de eerste alinea | niet gemeten (regel bestond niet) | ${s.grensVooraanGehaald} van ${s.grensvragen} = ${pct(s.grensVooraanGehaald, s.grensvragen)} | 100 % |`)
uit.push(`| Nul cijfers bij begripsmatige fiscale uitleg | niet gemeten (regel bestond niet) | ${s.nulCijfersGehaald} van ${s.nulCijfersGetoetst} = ${pct(s.nulCijfersGehaald, s.nulCijfersGetoetst)} | 100 % |`)
uit.push('')

// ── Per regel: hoe vaak overtreden ─────────────────────────────────────────
uit.push('## Overtredingen per regel')
uit.push('')
uit.push('De telling hieronder is per REGEL, niet per antwoord: een antwoord kan meer dan')
uit.push('een regel breken. Lengte staat er bewust apart in, zodat een te lang maar verder')
uit.push('correct antwoord niet als grensoverschrijding meetelt.')
uit.push('')
uit.push('| Regel | Sinds | Antwoorden die hem breken | Aandeel |')
uit.push('|---|---|---|---|')
const perRegel = {}
for (const r of gelukt) {
  for (const o of new Set(r.score.overtredingen.map(x => x.regel))) {
    perRegel[o] = (perRegel[o] ?? 0) + 1
  }
}
const sindsVan = { emoji: 'voor', lengte: 'voor', geenProduct: 'voor', grens: 'NA', grensVooraan: 'NA', nulCijfers: 'NA', fiscaalFeit: 'n.v.t.' }
for (const [regel, n] of Object.entries(perRegel).sort((a, b) => b[1] - a[1])) {
  uit.push(`| ${regel} | ${sindsVan[regel] ?? '?'} de nulmeting | ${n} | ${pct(n, gelukt.length)} |`)
}
uit.push('')

// ── Per categorie ───────────────────────────────────────────────────────────
uit.push('## Per categorie')
uit.push('')
uit.push('| Categorie | N | Woorden mediaan | > 150 w | Emoji | Hard verbod | Twijfel | Jargon mediaan |')
uit.push('|---|---|---|---|---|---|---|---|')
const cats = [...new Set(gelukt.map(r => r.vraag.cat))].sort()
for (const c of cats) {
  const g = gelukt.filter(r => r.vraag.cat === c)
  uit.push(`| ${c} | ${g.length} | ${mediaan(g.map(r => r.score.woorden))} | ${g.filter(r => r.score.woorden > 150).length} | ${g.filter(r => r.score.emoji).length} | ${g.filter(r => r.score.verbodHard.length).length} | ${g.filter(r => r.score.verbodZacht.length).length} | ${mediaan(g.map(r => r.score.jargonAantal))} |`)
}
uit.push('')

// ── Consistentie over de herhalingen ───────────────────────────────────────
// Alleen vragen met precies EEN juist antwoord (veld `claim` in vragen.mjs).
// Een eerdere versie vergeleek alle genoemde getallen en markeerde daardoor elke
// vraag als inconsistent: welke cijfers Fin noemt varieert nu eenmaal, en dat is
// geen drift. Wat telt is of het ANTWOORD op de vraag verschilt.
uit.push('## Consistentie over de drie herhalingen')
uit.push('')
uit.push('Zelfde vraag, zelfde account, binnen dezelfde twintig minuten. Alleen vragen')
uit.push('met een enkel juist antwoord staan hieronder.')
uit.push('')
uit.push('| Vraag | Herh. 1 | Herh. 2 | Herh. 3 | Canoniek | Eensluidend |')
uit.push('|---|---|---|---|---|---|')
const metClaim = [...VRAGEN, ...VRAGEN_EXTRA].filter(v => v.claim)
for (const v of metClaim) {
  const groep = gelukt.filter(r => r.vraag.id === v.id).sort((a, b) => a.herhaling - b.herhaling)
  if (!groep.length) continue
  const claims = groep.map(r => {
    const m = v.claim.exec(r.antwoord.tekst)
    return m ? (m[1] ?? m[2] ?? m[0]).trim() : 'niet genoemd'
  })
  const eens = new Set(claims).size === 1
  uit.push(`| ${v.id} — ${v.vraag} | ${claims[0]} | ${claims[1] ?? '-'} | ${claims[2] ?? '-'} | ${CANONIEK[v.id] ?? '-'} | ${eens ? 'ja' : '**nee**'} |`)
}
uit.push('')

// ── Elke harde overtreding, met citaat ──────────────────────────────────────
uit.push('## Elke harde overtreding')
uit.push('')
const overtreders = gelukt.filter(r => r.score.hardeOvertredingen > 0)
if (!overtreders.length) uit.push('Geen enkele harde overtreding.')
for (const r of overtreders) {
  const regels = [...new Set(r.score.overtredingen.filter(o => o.ernst === 'hard').map(o => `${o.regel}${o.patroon ? ` (${o.patroon})` : ''}`))]
  uit.push(`**${r.vraag.id}.${r.herhaling}** — "${r.vraag.vraag}"`)
  uit.push('')
  uit.push(`- Overtreedt: ${regels.join(' · ')}`)
  for (const o of r.score.overtredingen.filter(x => x.ernst === 'hard')) {
    const re = VERBOD_HARD.find(v => v.id === o.patroon)?.re
    if (re) { const m = r.antwoord.tekst.match(re); if (m) uit.push(`- Citaat: "…${r.antwoord.tekst.slice(Math.max(0, r.antwoord.tekst.indexOf(m[0]) - 70), r.antwoord.tekst.indexOf(m[0]) + m[0].length + 70).replace(/\n/g, ' ')}…"`) }
  }
  uit.push('')
}

// ── Twijfelgevallen om met de hand na te lopen ──────────────────────────────
uit.push('## Met de hand nalopen (twijfel)')
uit.push('')
const twijfel = gelukt.filter(r => r.score.verbodZacht.length && !r.score.verbodHard.length)
uit.push(`${twijfel.length} antwoorden bevatten een formulering die een aansporing kan zijn maar ook neutraal kan zijn.`)
uit.push('')
for (const r of twijfel.slice(0, 25)) {
  uit.push(`- **${r.vraag.id}.${r.herhaling}** (${r.score.verbodZacht.join(', ')}) — "${r.vraag.vraag}"`)
}
uit.push('')

const uitPad = pad.replace(/\.json$/, '.md')
writeFileSync(uitPad, uit.join('\n'), 'utf8')
console.log(uit.join('\n'))
console.log(`\nGeschreven naar ${uitPad}`)
