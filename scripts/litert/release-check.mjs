#!/usr/bin/env node
/**
 * TriFinity — LiteRT-LM release-check (deterministische kern)
 * ===========================================================
 * Zero-dependency Node ESM script. Beantwoordt tweemaal per week één vraag:
 * **is er een nieuwere `@litert-lm/core` dan wij gepind hebben, en zegt de
 * changelog iets over de Adreno-GPU-correctheidsbug?**
 *
 *   npm run litert:check            # tabel + advies op stdout
 *   npm run litert:check -- --json  # machineleesbaar (voor de routine)
 *
 * ── Waarom dit script bestaat ──────────────────────────────────────────────
 * L3 (mobiele lokale AI) staat GEPARKEERD op een bug in Googles WebGPU/
 * LiteRT-runtime, niet in onze code: op Adreno-GPU's rekent het model snel én
 * fout (2,6 s/transactie, 0% bruikbare uitvoer — meertalige token-soep;
 * `spikes/litert-lm/meetrapport-v1.md` §L1.5). De trackers zijn upstream:
 * LiteRT #8065 (WebGPU/Dawn, "correct output only on first inference") en
 * LiteRT-LM #3012 (Adreno 750, corrupte generatie). Onze infrastructuur is
 * pad-agnostisch klaar; we wachten puur op upstream. Dit script maakt het
 * WACHTEN goedkoop en deterministisch.
 *
 * ── Wat dit script wél en niet doet (HARDE REGEL) ──────────────────────────
 * Het script **signaleert alleen**. Het opent NOOIT zelf de bouwfase (L3) en
 * bumpt NOOIT zelf de pin. Reden: het oordeel "zit de Adreno-fix erin?" is
 * niet deterministisch af te leiden uit release-notes — die noemen
 * GPU-precisie zelden expliciet — en het echte bewijs is een on-device
 * WebGPU-hermeting op een écht Adreno-toestel, wat in geen enkele CI of
 * headless runner kan draaien. Vandaar `autoReopen` hardcoded `false` in elke
 * verdict, plus `AUTO_REOPEN_ALLOWED = false` als expliciete, getestte
 * invariant. Wie die regel ooit wil omzetten, verandert een productbesluit,
 * geen implementatiedetail.
 *
 * ── Detectie (deterministisch) vs. oordeel (indicatief) ────────────────────
 *   1. DETECTIE — `pin` vs. `npm-latest`: hard, reproduceerbaar, exact.
 *      De pin wordt GELEZEN uit `package.json` (+ de spike-kopie), nooit
 *      hardgecodeerd — anders veroudert het script zelf bij elke bump.
 *   2. OORDEEL — Adreno-signaal in de release-notes van uitsluitend de
 *      versies NIEUWER dan de pin. Bewust NIET over alle releases: oudere
 *      notes noemen "GPU" in irrelevante context (v0.14.0: "NPU and GPU audio
 *      acceleration") en zouden een vals-positief opleveren. Een treffer is
 *      een AANLEIDING TOT HERMETEN, nooit een conclusie.
 *
 * ── Twee pin-bronnen, drift is een bevinding ───────────────────────────────
 * De versie staat op twee plekken: `package.json` (de app) en
 * `spikes/litert-lm/package.json` (het meetharnas dat de hermeting draait).
 * Lopen die uiteen, dan meet het harnas iets anders dan de app draait en is
 * elke hermeting waardeloos. Dat is dus geen detail maar een eigen status
 * (`pin-drift`, exit 12) die vóór de release-vergelijking komt.
 *
 * ── Exit-codes ─────────────────────────────────────────────────────────────
 *    0  geen actie (pin === npm-latest)
 *   10  nieuwe release ÉN Adreno-signaal in de notes → hermeting aanstoten
 *   11  nieuwe release zonder Adreno-signaal (of changelog onbereikbaar) →
 *       lagere urgentie, wel zichtbaar; let op Early-Preview-API-breuk
 *   12  pin-drift tussen app en spike
 *    1  fout (netwerk, ontbrekende dependency, onleesbare package.json)
 *
 * Let op: bij exit ≠ 0 print npm zelf nog een `npm ERR!`-blok ná de output van
 * dit script. Dat is geen crash — dat ís het signaal. De inhoudelijke uitkomst
 * staat altijd volledig in de stdout erboven (of in `--json`).
 *
 * ── Early-Preview-waarschuwing bij een bump ────────────────────────────────
 * `@litert-lm/core` is Early Preview: API-breuk tussen versies is toegestaan
 * en gebeurt. Een gedetecteerde release is daarom NOOIT een blinde
 * dependency-bump — eerst `npx tsc --noEmit` tegen de facade in
 * `lib/ai/local/litert-runtime.ts` plus de typecheck van `spikes/litert-lm`.
 * Het script zegt dat ook in zijn advies, zodat het niet in iemands hoofd
 * hoeft te zitten.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/** De dependency waar dit alles om draait. */
export const PACKAGE_NAME = '@litert-lm/core'

/**
 * Alle plekken waar de versie gepind staat, relatief aan de repo-root. Beide
 * MOETEN gelijk zijn — zie module-docblock ("Twee pin-bronnen"). Komt er ooit
 * een derde plek bij, dan hoort die hier; de drift-detectie werkt generiek
 * over deze lijst.
 */
export const PIN_SOURCES = ['package.json', join('spikes', 'litert-lm', 'package.json')]

/** Upstream-trackers voor onze bug — puur informatief, in het advies gedrukt. */
export const UPSTREAM_TRACKERS = [
  'https://github.com/google-ai-edge/LiteRT/issues/8065',
  'https://github.com/google-ai-edge/LiteRT-LM/issues/3012',
]

export const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}`
export const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/google-ai-edge/LiteRT-LM/releases?per_page=20'

/**
 * HARDE REGEL, zie module-docblock: deze check heropent de bouwfase nooit
 * zelf. Bewust een geëxporteerde constante en geen los commentaar, zodat de
 * test 'm kan vastzetten en een toekomstige "even automatiseren"-poging als
 * gefaalde assertie zichtbaar wordt.
 */
export const AUTO_REOPEN_ALLOWED = false

/**
 * Signaalpatronen voor "hier gaat het over de Adreno-/GPU-correctheidsfamilie".
 * Gelabeld zodat de uitkomst BEWIJS meedraagt (welk patroon raakte) in plaats
 * van een kaal ja/nee. Bewust breed: een vals-positief kost één handmatige
 * changelog-lezing, een vals-negatief kost weken stilstand.
 */
export const ADRENO_SIGNAL_PATTERNS = [
  ['adreno', /adreno/i],
  ['qualcomm', /qualcomm/i],
  ['dawn', /\bdawn\b/i],
  ['f16', /\b(f16|fp16|float16|shader-f16)\b/i],
  ['gpu-precisie', /(gpu|shader)[\s\S]{0,40}(precision|precisie|numerical|accuracy)/i],
  ['webgpu-correctheid', /webgpu[\s\S]{0,60}(correct|precision|accuracy|corrupt|garbl)/i],
  ['corrupte-uitvoer', /(token soup|garbled|gibberish|corrupted (output|generation)|incorrect output)/i],
]

export const EXIT_CODES = {
  noAction: 0,
  error: 1,
  newReleaseAdrenoSignal: 10,
  newReleasePlain: 11,
  pinDrift: 12,
}

// ───────────────────────────────────────────────────────────── semver ──────

/**
 * Minimale semver-parser (geen dependency). `null` bij onparseerbaar — het
 * script mag niet crashen op een rare tag zoals `nightly`.
 */
export function parseVersion(raw) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    String(raw ?? '').trim()
  )
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

export function isPrerelease(raw) {
  const parsed = parseVersion(raw)
  return parsed ? parsed.prerelease.length > 0 : false
}

/**
 * Semver-precedentie volgens de spec: numeriek op major/minor/patch, daarna
 * geldt "een versie MET prerelease komt vóór dezelfde versie zonder"
 * (0.14.0-alpha.0 < 0.14.0 — die tag bestaat echt upstream, vandaar dat dit
 * meer dan theorie is). Prerelease-identifiers: numeriek < alfanumeriek,
 * numeriek numeriek vergeleken, alfanumeriek lexicaal, meer velden wint bij
 * gelijke voorloop. Onparseerbare invoer sorteert altijd achteraan.
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1

  for (const key of ['major', 'minor', 'patch']) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1
  }

  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0
  if (pa.prerelease.length === 0) return 1
  if (pb.prerelease.length === 0) return -1

  const len = Math.max(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < len; i++) {
    const ia = pa.prerelease[i]
    const ib = pb.prerelease[i]
    if (ia === undefined) return -1
    if (ib === undefined) return 1
    const na = /^\d+$/.test(ia)
    const nb = /^\d+$/.test(ib)
    if (na && nb) {
      if (Number(ia) !== Number(ib)) return Number(ia) < Number(ib) ? -1 : 1
    } else if (na !== nb) {
      return na ? -1 : 1
    } else if (ia !== ib) {
      return ia < ib ? -1 : 1
    }
  }
  return 0
}

// ─────────────────────────────────────────────────────────────── pins ──────

/**
 * Leest de gepinde versie uit elke bron in `PIN_SOURCES`. Kijkt zowel in
 * `dependencies` als `devDependencies` (de spike zet 'm als gewone dep, maar
 * dat is geen contract om op te leunen).
 *
 * `exact` markeert of het een kale versie is (`"0.14.0"`) en geen range
 * (`^0.14.0`): een range ondermijnt de hele premisse van deze check — dan is
 * "onze versie" niet meer één getal maar wat npm die dag oplost.
 *
 * `drift` is waar zodra twee bronnen verschillende versies noemen. Ontbrekende
 * bronbestanden tellen NIET als drift (de spike-map kan legitiem ontbreken in
 * een afgeslankte checkout) maar worden wel gerapporteerd als `missing`.
 */
export function readPins({ root = ROOT, sources = PIN_SOURCES } = {}) {
  const pins = []
  const missing = []

  for (const rel of sources) {
    const abs = join(root, rel)
    if (!existsSync(abs)) {
      missing.push(rel)
      continue
    }
    let pkg
    try {
      pkg = JSON.parse(readFileSync(abs, 'utf8'))
    } catch (err) {
      throw new Error(`Kan ${rel} niet lezen als JSON: ${err.message}`)
    }
    const spec = pkg?.dependencies?.[PACKAGE_NAME] ?? pkg?.devDependencies?.[PACKAGE_NAME]
    if (spec == null) {
      missing.push(rel)
      continue
    }
    pins.push({ source: rel, spec: String(spec), exact: parseVersion(spec) !== null })
  }

  const versions = [...new Set(pins.map((p) => p.spec))]
  return {
    pins,
    missing,
    drift: versions.length > 1,
    version: versions.length === 1 ? versions[0] : null,
    inexact: pins.filter((p) => !p.exact).map((p) => p.source),
  }
}

// ───────────────────────────────────────────────────────── npm-latest ──────

/**
 * Hoogste versie uit een npm-packument. Prereleases worden standaard
 * genegeerd (`0.14.0-alpha.0` bestaat upstream en is geen release om op te
 * acteren). `dist-tags.latest` is het startpunt maar niet het laatste woord:
 * we vergelijken 'm met de hoogste stabiele in `versions`, zodat een
 * achterlopende dist-tag ons niet blind maakt.
 */
export function pickLatest(packument, { includePrerelease = false } = {}) {
  const all = Object.keys(packument?.versions || {}).filter((v) => parseVersion(v) !== null)
  const candidates = includePrerelease ? all : all.filter((v) => !isPrerelease(v))

  const tagged = packument?.['dist-tags']?.latest
  if (tagged && parseVersion(tagged) && (includePrerelease || !isPrerelease(tagged))) {
    candidates.push(tagged)
  }
  if (candidates.length === 0) return null

  return candidates.reduce((best, v) => (compareVersions(v, best) > 0 ? v : best))
}

// ───────────────────────────────────────────────── Adreno-signaalscan ──────

/**
 * Scant vrije tekst op de Adreno-/GPU-correctheidsfamilie. Geeft de GELABELDE
 * treffers terug, zodat het advies kan tonen wáárom het aansloeg.
 */
export function scanAdrenoSignal(text) {
  const haystack = String(text ?? '')
  const matches = ADRENO_SIGNAL_PATTERNS.filter(([, re]) => re.test(haystack)).map(([label]) => label)
  return { hit: matches.length > 0, matches }
}

/**
 * Filtert de releases die er voor dit oordeel toe doen: uitsluitend die
 * NIEUWER zijn dan de pin (zie module-docblock — oudere notes leveren
 * vals-positieven). Prereleases vallen af tenzij expliciet gevraagd.
 */
export function releasesNewerThanPin(releases, pin, { includePrerelease = false } = {}) {
  return (releases || [])
    .filter((r) => {
      const tag = r?.tag_name ?? r?.tagName
      if (!parseVersion(tag)) return false
      if (!includePrerelease && (r?.prerelease === true || isPrerelease(tag))) return false
      return compareVersions(tag, pin) > 0
    })
    .sort((a, b) => compareVersions(b.tag_name ?? b.tagName, a.tag_name ?? a.tagName))
}

// ──────────────────────────────────────────────────────────── verdict ──────

/**
 * Pure beoordeling — het hart van de check, los van elk netwerk. Geeft altijd
 * een volledig verdict terug (nooit een throw voor een normale uitkomst) met
 * een expliciete `action` in mensentaal.
 *
 * `autoReopen` staat in ELKE tak hard op `AUTO_REOPEN_ALLOWED` (= false): de
 * check signaleert, de eigenaar beslist. Zie module-docblock, HARDE REGEL.
 */
export function evaluateRelease({
  pinInfo,
  latest,
  releases = null,
  latestPublishedAt = null,
  includePrerelease = false,
} = {}) {
  const base = {
    package: PACKAGE_NAME,
    pin: pinInfo?.version ?? null,
    pinSources: pinInfo?.pins ?? [],
    latest: latest ?? null,
    latestPublishedAt,
    newer: false,
    adreno: { hit: false, matches: [], scanned: [], changelogAvailable: releases !== null },
    autoReopen: AUTO_REOPEN_ALLOWED,
    trackers: UPSTREAM_TRACKERS,
  }

  // Drift eerst: zonder één gedeelde pin is elke verdere vergelijking (en elke
  // hermeting op het spike-harnas) betekenisloos.
  if (pinInfo?.drift) {
    return {
      ...base,
      status: 'pin-drift',
      exitCode: EXIT_CODES.pinDrift,
      action:
        `Pin-drift: ${pinInfo.pins.map((p) => `${p.source} → ${p.spec}`).join(', ')}. ` +
        'Het meetharnas draait dan iets anders dan de app; trek de versies gelijk vóór welke hermeting dan ook.',
    }
  }

  if (!pinInfo?.version) {
    return {
      ...base,
      status: 'pin-missing',
      exitCode: EXIT_CODES.error,
      action: `Geen ${PACKAGE_NAME}-pin gevonden in ${PIN_SOURCES.join(' / ')}.`,
    }
  }

  if (pinInfo.inexact?.length) {
    return {
      ...base,
      status: 'pin-inexact',
      exitCode: EXIT_CODES.error,
      action:
        `Pin is een range in ${pinInfo.inexact.join(', ')} — ${PACKAGE_NAME} is Early Preview en moet ` +
        'exact gepind blijven, anders verschuift "onze versie" stilzwijgend.',
    }
  }

  if (!latest) {
    return {
      ...base,
      status: 'latest-unknown',
      exitCode: EXIT_CODES.error,
      action: 'Geen bruikbare versie uit het npm-packument kunnen afleiden.',
    }
  }

  const newer = compareVersions(latest, pinInfo.version) > 0
  if (!newer) {
    return {
      ...base,
      status: 'up-to-date',
      exitCode: EXIT_CODES.noAction,
      action: `Geen nieuwe release (pin ${pinInfo.version} === npm-latest ${latest}). Geen actie; L3 blijft geparkeerd.`,
    }
  }

  const relevant = releases === null ? [] : releasesNewerThanPin(releases, pinInfo.version, { includePrerelease })
  const scanned = relevant.map((r) => r.tag_name ?? r.tagName)
  const signal = scanAdrenoSignal(relevant.map((r) => `${r.tag_name ?? r.tagName}\n${r.body ?? ''}`).join('\n\n'))

  const bumpWarning =
    `Geen blinde dependency-bump: ${PACKAGE_NAME} is Early Preview (API-breuk toegestaan). ` +
    'Eerst `npx tsc --noEmit` tegen lib/ai/local/litert-runtime.ts + de typecheck van spikes/litert-lm.'

  if (releases === null) {
    return {
      ...base,
      newer: true,
      adreno: { hit: false, matches: [], scanned: [], changelogAvailable: false },
      status: 'new-release-changelog-unavailable',
      exitCode: EXIT_CODES.newReleasePlain,
      action:
        `Nieuwe release ${latest} (pin ${pinInfo.version}), maar de changelog was niet op te halen — ` +
        `lees ${GITHUB_RELEASES_URL.replace(/\?.*$/, '')} met de hand op een Adreno-/GPU-correctheidsfix. ${bumpWarning}`,
    }
  }

  if (signal.hit) {
    return {
      ...base,
      newer: true,
      adreno: { ...signal, scanned, changelogAvailable: true },
      status: 'new-release-adreno-signal',
      exitCode: EXIT_CODES.newReleaseAdrenoSignal,
      action:
        `Adreno-fix MOGELIJK geland in ${latest} (signaal: ${signal.matches.join(', ')}). ` +
        'Draai de L1.5-hermeting op een écht Adreno-toestel (spikes/litert-lm, `npx vite --host`, ' +
        'url `?autorun=1&tx=30`, zie meetrapport-v1.md §L1.5). Alleen de eigenaar beslist op basis van ' +
        `die meting of L3 heropent — deze check doet dat niet. ${bumpWarning}`,
    }
  }

  return {
    ...base,
    newer: true,
    adreno: { ...signal, scanned, changelogAvailable: true },
    status: 'new-release-no-adreno',
    exitCode: EXIT_CODES.newReleasePlain,
    action:
      `Nieuwe release ${latest} (pin ${pinInfo.version}), maar de notes van ${scanned.join(', ') || '—'} ` +
      'noemen geen Adreno-/GPU-correctheidsfix. Lagere urgentie: L3 blijft geparkeerd, hermeten optioneel. ' +
      `Controleer wel de upstream-trackers (${UPSTREAM_TRACKERS.join(', ')}). ${bumpWarning}`,
  }
}

// ─────────────────────────────────────────────────────────── netwerk ───────

async function fetchJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': 'trifinity-litert-release-check' },
  })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

/**
 * Draait de volledige check. `fetchImpl` is injecteerbaar zodat de test geen
 * netwerk raakt. De GitHub-changelog is BEST-EFFORT: valt die weg (rate limit
 * 60/uur zonder token, of downtime), dan blijft de npm-detectie staan en
 * degradeert alleen het oordeel — de check zegt dan eerlijk "lees zelf".
 */
export async function runCheck({
  root = ROOT,
  fetchImpl = globalThis.fetch,
  includePrerelease = false,
  skipChangelog = false,
} = {}) {
  const pinInfo = readPins({ root })

  // Drift/ontbrekende pin hoeft geen netwerk — meteen oordelen.
  if (pinInfo.drift || !pinInfo.version || pinInfo.inexact.length) {
    return evaluateRelease({ pinInfo, latest: null, releases: null, includePrerelease })
  }

  const packument = await fetchJson(NPM_REGISTRY_URL, fetchImpl)
  const latest = pickLatest(packument, { includePrerelease })
  const latestPublishedAt = latest ? packument?.time?.[latest] ?? null : null

  let releases = null
  if (!skipChangelog) {
    try {
      const fetched = await fetchJson(GITHUB_RELEASES_URL, fetchImpl)
      if (Array.isArray(fetched)) releases = fetched
    } catch {
      releases = null // best-effort, zie docblock
    }
  }

  return evaluateRelease({ pinInfo, latest, releases, latestPublishedAt, includePrerelease })
}

// ──────────────────────────────────────────────────────────── rapport ──────

/** Mensleesbaar rapport; de `--json`-vorm is het verdict-object zelf. */
export function formatReport(verdict) {
  const lines = []
  lines.push('')
  lines.push(`LiteRT-LM release-check — ${verdict.package}`)
  lines.push('─'.repeat(64))
  lines.push(`  Onze pin      : ${verdict.pin ?? '—'}`)
  lines.push(`  npm-latest    : ${verdict.latest ?? '—'}${verdict.latestPublishedAt ? ` (gepubliceerd ${verdict.latestPublishedAt})` : ''}`)
  lines.push(`  Nieuwer?      : ${verdict.newer ? 'JA' : 'nee'}`)
  if (verdict.pinSources?.length) {
    lines.push(`  Pin-bronnen   : ${verdict.pinSources.map((p) => `${p.source} → ${p.spec}`).join(', ')}`)
  }
  if (verdict.newer) {
    lines.push(
      `  Adreno-signaal: ${
        !verdict.adreno.changelogAvailable
          ? 'changelog niet opgehaald'
          : verdict.adreno.hit
            ? `JA (${verdict.adreno.matches.join(', ')})`
            : 'nee'
      }${verdict.adreno.scanned?.length ? ` — gescand: ${verdict.adreno.scanned.join(', ')}` : ''}`
    )
  }
  lines.push(`  Status        : ${verdict.status}`)
  lines.push('')
  lines.push(`  → ${verdict.action}`)
  lines.push('')
  lines.push('  Deze check signaleert alleen: L3-heropening blijft een beslissing van de eigenaar,')
  lines.push('  op basis van een on-device hermeting. Zie scripts/litert/release-check.mjs.')
  lines.push('')
  return lines.join('\n')
}

async function main() {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')

  let verdict
  try {
    verdict = await runCheck({
      includePrerelease: argv.includes('--include-prerelease'),
      skipChangelog: argv.includes('--no-changelog'),
    })
  } catch (err) {
    if (asJson) {
      console.log(JSON.stringify({ status: 'error', autoReopen: AUTO_REOPEN_ALLOWED, error: err.message }, null, 2))
    } else {
      console.error(`\n✗ LiteRT-LM release-check mislukt: ${err.message}\n`)
    }
    process.exit(EXIT_CODES.error)
  }

  console.log(asJson ? JSON.stringify(verdict, null, 2) : formatReport(verdict))
  process.exit(verdict.exitCode)
}

// Alleen uitvoeren als direct aangeroepen (niet bij `import` vanuit de test).
// `pathToFileURL` is vereist voor Windows-paden — zie scripts/perf/route-sizes.mjs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
