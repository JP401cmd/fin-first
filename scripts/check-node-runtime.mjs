#!/usr/bin/env node
// ── Runtime-poort: lopende Node-versie tegen `engines.node` ───────────────────
//
// Achtergrond (ADR 0100): op Node < 24.15.0 leeft de webstreams-race
// (nodejs/node#62036) die de SSR-crash op /overzicht veroorzaakte. De canary
// `test/node-webstreams-race.test.ts` bewaakt dat, maar als één rode test tussen
// ~18.000 werd hij een maand lang weggeschreven als "bekend rood, omgeving, geen
// regressie" — een vrijwaring zonder houdbaarheid die bleef staan nadat de
// runtime al was bijgewerkt. Deze poort maakt een te oude runtime tot één
// harde, ondubbelzinnige stop vóór er iets draait, zodat die notitie geen
// onderwerp meer heeft.
//
// Aangeroepen vanuit: `vitest.config.ts` (top-level, dekt ook een kale
// `npx vitest`), `.husky/pre-push` en de `predev`-hook. Bewust NIET vanuit
// `prebuild` en bewust géén `engine-strict` in `.npmrc`: ADR 0100 accepteert dat
// we het patchniveau op Vercel niet afdwingen — een te oude Vercel-runtime mag
// een (hotfix-)build nooit breken. Draait dit script tóch op Vercel (env
// `VERCEL`), dan waarschuwt het alleen.
//
// Bewust géén override-vlag (bv. ALLOW_OLD_NODE): dat zou precies een nieuwe
// vrijwaring zonder houdbaarheid zijn.
//
// Licht gehouden: alleen node:fs + één JSON-parse — geen semver-dependency
// (die is geen directe dependency). Daarom ondersteunt de parser uitsluitend de
// vorm `>=x.y.z`; een andere range faalt met een duidelijke melding in plaats
// van stil verkeerd te vergelijken.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const UPGRADE_HINT = 'upgrade: winget install --id OpenJS.NodeJS.LTS --exact'

const MIN_RANGE_PATTERN = /^\s*>=\s*v?(\d+)\.(\d+)\.(\d+)\s*$/
const VERSION_PATTERN = /^\s*v?(\d+)\.(\d+)\.(\d+)/

/**
 * Parseert een `engines.node`-range van de vorm `>=x.y.z`.
 * @param {string} range
 * @returns {[number, number, number] | null} null bij een niet-ondersteunde vorm
 */
export function parseMinimumVersion(range) {
  const match = MIN_RANGE_PATTERN.exec(range)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Parseert een lopende versie (`24.19.0`, `v24.19.0`, `25.0.0-nightly…`).
 * @param {string} version
 * @returns {[number, number, number] | null}
 */
export function parseVersion(version) {
  const match = VERSION_PATTERN.exec(version)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Numerieke vergelijking per segment (nooit als string: "24.9" > "24.15" als tekst).
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 * @returns {number} < 0 als a ouder is dan b, 0 bij gelijk, > 0 als a nieuwer is
 */
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/**
 * @typedef {'ok' | 'too-old' | 'no-engines' | 'unsupported-range' | 'unparseable-version'} RuntimeStatus
 * @typedef {{ status: RuntimeStatus, fatal: boolean, message: string }} RuntimeVerdict
 */

/**
 * Pure beoordeling — geen I/O, zodat alle takken testbaar zijn.
 * `fatal` zegt of de aanroeper moet stoppen; op Vercel is het nooit fataal.
 * Ontbrekende `engines.node` is een waarschuwing: er is dan geen ondergrens
 * om af te dwingen, en een poort die alles blokkeert omdat een veld weg is
 * zou de verkeerde fout tonen.
 * @param {{ engineRange: string | undefined, currentVersion: string, isVercel: boolean }} input
 * @returns {RuntimeVerdict}
 */
export function evaluateNodeRuntime({ engineRange, currentVersion, isVercel }) {
  const prefix = isVercel ? '[check-node-runtime] waarschuwing (Vercel, niet blokkerend): ' : '[check-node-runtime] '

  if (typeof engineRange !== 'string' || engineRange.trim() === '') {
    return {
      status: 'no-engines',
      fatal: false,
      message: `${prefix}package.json heeft geen engines.node — geen runtime-ondergrens om te toetsen (ADR 0100).`,
    }
  }

  const minimum = parseMinimumVersion(engineRange)
  if (!minimum) {
    return {
      status: 'unsupported-range',
      fatal: !isVercel,
      message:
        `${prefix}engines.node "${engineRange}" heeft een niet-ondersteunde vorm; ` +
        'deze poort begrijpt alleen ">=x.y.z". Pas de range of het script aan.',
    }
  }

  const current = parseVersion(currentVersion)
  if (!current) {
    return {
      status: 'unparseable-version',
      fatal: !isVercel,
      message: `${prefix}kan de lopende Node-versie "${currentVersion}" niet lezen.`,
    }
  }

  const floor = minimum.join('.')
  if (compareVersions(current, minimum) < 0) {
    return {
      status: 'too-old',
      fatal: !isVercel,
      message: `${prefix}Node v${current.join('.')} < ondergrens ${floor} (ADR 0100) — ${UPGRADE_HINT}`,
    }
  }

  return { status: 'ok', fatal: false, message: `[check-node-runtime] Node v${current.join('.')} >= ${floor} — ok.` }
}

/**
 * Leest `engines.node` uit package.json in `rootDir` en beoordeelt de runtime.
 * @param {{ rootDir?: string, currentVersion?: string, env?: Record<string, string | undefined> }} [options]
 * @returns {RuntimeVerdict}
 */
export function checkNodeRuntime({
  rootDir = process.cwd(),
  currentVersion = process.versions.node,
  env = process.env,
} = {}) {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
  return evaluateNodeRuntime({
    engineRange: pkg?.engines?.node,
    currentVersion,
    // Vercel zet VERCEL=1 in elke build-omgeving.
    isVercel: Boolean(env.VERCEL),
  })
}

/**
 * Voor in-process aanroepers (vitest.config.ts): gooit bij een fataal oordeel,
 * waarschuwt anders alleen wanneer er iets te melden is. Stil bij 'ok'.
 * @param {Parameters<typeof checkNodeRuntime>[0]} [options]
 * @returns {RuntimeVerdict}
 */
export function assertNodeRuntime(options) {
  const verdict = checkNodeRuntime(options)
  if (verdict.fatal) throw new Error(verdict.message)
  if (verdict.status !== 'ok') console.warn(verdict.message)
  return verdict
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const verdict = checkNodeRuntime()
  if (verdict.fatal) {
    console.error(verdict.message)
    process.exit(1)
  }
  if (verdict.status !== 'ok') console.warn(verdict.message)
}
