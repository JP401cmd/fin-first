// @vitest-environment node
/**
 * Tests voor scripts/litert/release-check.mjs.
 *
 * Vier lagen, elk met een reden om te bestaan:
 *   1. semver — de prerelease-tak is geen theorie: `0.14.0-alpha.0` bestaat
 *      echt upstream en mag nooit als "nieuwe release" tellen.
 *   2. pin-lezing — inclusief drift (app vs. spike-harnas) en de range-guard;
 *      plus één LIVE assertie tegen de échte repo-bestanden, zodat een bump
 *      die maar één van de twee package.json's raakt hier rood wordt.
 *   3. oordeel — alle statussen, met echte v0.14.0/v0.15.0-release-notes als
 *      fixture (de vals-positief-val: v0.14.0 noemt "NPU and GPU audio
 *      acceleration" en zou bij een naïeve scan-over-alles aanslaan).
 *   4. de HARDE REGEL — geen enkele tak mag ooit `autoReopen: true` opleveren.
 *      Dat is de invariant die dit script bewoonbaar houdt en de enige die,
 *      als hij breekt, een productbesluit omzet in een ongeluk.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PACKAGE_NAME,
  PIN_SOURCES,
  AUTO_REOPEN_ALLOWED,
  EXIT_CODES,
  parseVersion,
  isPrerelease,
  compareVersions,
  readPins,
  pickLatest,
  scanAdrenoSignal,
  releasesNewerThanPin,
  evaluateRelease,
  runCheck,
  formatReport,
} from './release-check.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * De ECHTE release-body van v0.15.0 (opgehaald 8 aug 2026). Bewust integraal
 * als fixture: dit is precies het geval waarop de check bij zijn eerste run
 * afgaat, en het bewijst dat een release vol GPU-achtige woorden ("hardware
 * backends", "Metal", "web") tóch géén Adreno-signaal oplevert.
 */
const RELEASE_0_15_0 = {
  tag_name: 'v0.15.0',
  prerelease: false,
  body: `### 🍎 Apple Foundation Framework
* **Apple FM Adapter:** Shipped a new Apple Foundation framework adapter natively integrating Apple's backend with the LiteRT-LM runtime for fast text and multimodal (vision/audio) execution featuring Gemma4 models.
* **Concurrency & Stability:** Resolved re-entrancy issues on concurrent engine initializations.

### 🛠️ LiteRT-LM CLI
* **Centralized \`config.json\` System:** Introduced configuration file support for the LiteRT-LM CLI to define global defaults and per-model settings (such as specialized hardware backends, thinking budgets, and context window sizes).
* **Strict Parameter Precedence:** Runtime arguments > Model-specific config > Global defaults > Model metadata > Engine fallbacks.

### 🌐 JavaScript API & Web Application (\`LiteRT-LM.js\`)
* **Gemma 4 Web Support:** Gemma 4 12B, Gemma 4 26B A4B and Gemma 4 31B are officially supported on web.
* **Memory Efficiency:** Added a new \`use_autosized_ringbuffers\` option that improves long context memory efficiency.
* **Tool Calling Capabilities:** Added \`AutoToolChat\`, which automatically runs tool calls that the model emits.`,
}

/** Echte v0.14.0-body — de vals-positief-val ("NPU and GPU audio acceleration"). */
const RELEASE_0_14_0 = {
  tag_name: 'v0.14.0',
  prerelease: false,
  body: `*   **Android Support for Python and CLI**: The command-line interface and Python API now support running directly on Android.
*   **Tool Calling & Agentic Capabilities**: Enabled real-time streaming of tool call tokens in C and Swift APIs.
*   **Expanded Multi-Modality & Auto-Backend Selection**: Automatic backend selection for audio and vision models in the CLI, alongside NPU and GPU audio acceleration.`,
}

const RELEASE_0_14_0_ALPHA = { tag_name: 'v0.14.0-alpha.0', prerelease: true, body: 'For broader testing.' }

/** Hypothetische toekomstige release waarin de fix WEL genoemd wordt. */
const RELEASE_0_16_0_FIX = {
  tag_name: 'v0.16.0',
  prerelease: false,
  body: '### Web\n* Fixed incorrect output on Adreno GPUs after the first compute pass (weights corruption).',
}

function pinInfoFor(version, overrides = {}) {
  return {
    pins: [{ source: 'package.json', spec: version, exact: true }],
    missing: [],
    drift: false,
    version,
    inexact: [],
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────── semver ─────

describe('semver-helpers', () => {
  it('parseVersion accepteert v-prefix en prerelease, weigert onzin', () => {
    expect(parseVersion('0.15.0')).toMatchObject({ major: 0, minor: 15, patch: 0, prerelease: [] })
    expect(parseVersion('v0.14.0-alpha.0')).toMatchObject({ prerelease: ['alpha', '0'] })
    expect(parseVersion('nightly')).toBeNull()
    expect(parseVersion(undefined)).toBeNull()
  })

  it('isPrerelease herkent de upstream alpha-tag', () => {
    expect(isPrerelease('0.14.0-alpha.0')).toBe(true)
    expect(isPrerelease('0.14.0')).toBe(false)
  })

  it('compareVersions: numeriek op major/minor/patch', () => {
    expect(compareVersions('0.15.0', '0.14.0')).toBe(1)
    expect(compareVersions('0.14.0', '0.15.0')).toBe(-1)
    expect(compareVersions('0.14.0', '0.14.0')).toBe(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1)
    // 0.9.0 vs 0.10.0 — de klassieke lexicale val
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
  })

  it('compareVersions: een prerelease komt vóór dezelfde stabiele versie', () => {
    expect(compareVersions('0.14.0-alpha.0', '0.14.0')).toBe(-1)
    expect(compareVersions('0.14.0', '0.14.0-alpha.0')).toBe(1)
    expect(compareVersions('0.14.0-alpha.0', '0.14.0-alpha.1')).toBe(-1)
    expect(compareVersions('0.14.0-alpha', '0.14.0-alpha.0')).toBe(-1)
    // numeriek < alfanumeriek binnen dezelfde positie
    expect(compareVersions('0.14.0-1', '0.14.0-beta')).toBe(-1)
  })

  it('compareVersions sorteert onparseerbare invoer achteraan zonder te crashen', () => {
    expect(compareVersions('nightly', '0.1.0')).toBe(-1)
    expect(compareVersions('nightly', 'main')).toBe(0)
  })
})

describe('pickLatest', () => {
  const packument = {
    'dist-tags': { latest: '0.15.0' },
    versions: { '0.12.0': {}, '0.12.1': {}, '0.13.1': {}, '0.14.0-alpha.0': {}, '0.14.0': {}, '0.15.0': {} },
  }

  it('negeert prereleases by default', () => {
    expect(pickLatest(packument)).toBe('0.15.0')
    expect(pickLatest({ ...packument, 'dist-tags': {}, versions: { '0.14.0': {}, '0.15.0-rc.1': {} } })).toBe('0.14.0')
  })

  it('neemt prereleases mee met includePrerelease', () => {
    expect(
      pickLatest({ 'dist-tags': {}, versions: { '0.14.0': {}, '0.15.0-rc.1': {} } }, { includePrerelease: true })
    ).toBe('0.15.0-rc.1')
  })

  it('laat zich niet misleiden door een achterlopende dist-tag', () => {
    // dist-tags.latest wijst nog naar 0.14.0 terwijl 0.15.0 al gepubliceerd is
    expect(pickLatest({ 'dist-tags': { latest: '0.14.0' }, versions: { '0.14.0': {}, '0.15.0': {} } })).toBe('0.15.0')
  })

  it('geeft null bij een leeg/onbruikbaar packument', () => {
    expect(pickLatest({})).toBeNull()
    expect(pickLatest({ versions: { nightly: {} } })).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────── pin-lezing ───

describe('readPins', () => {
  let dir

  const writePkg = (rel, spec, { dev = false } = {}) => {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    const key = dev ? 'devDependencies' : 'dependencies'
    writeFileSync(abs, JSON.stringify({ name: 'fixture', [key]: { [PACKAGE_NAME]: spec } }))
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'litert-pins-'))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('leest gelijke pins uit beide bronnen — geen drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'litert-ok-'))
    mkdirSync(join(root, 'spikes', 'litert-lm'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { [PACKAGE_NAME]: '0.14.0' } }))
    writeFileSync(
      join(root, 'spikes', 'litert-lm', 'package.json'),
      JSON.stringify({ dependencies: { [PACKAGE_NAME]: '0.14.0' } })
    )
    const info = readPins({ root })
    expect(info.drift).toBe(false)
    expect(info.version).toBe('0.14.0')
    expect(info.pins).toHaveLength(2)
    rmSync(root, { recursive: true, force: true })
  })

  it('detecteert drift zodra app en spike-harnas uiteenlopen', () => {
    const root = mkdtempSync(join(tmpdir(), 'litert-drift-'))
    mkdirSync(join(root, 'spikes', 'litert-lm'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { [PACKAGE_NAME]: '0.15.0' } }))
    writeFileSync(
      join(root, 'spikes', 'litert-lm', 'package.json'),
      JSON.stringify({ dependencies: { [PACKAGE_NAME]: '0.14.0' } })
    )
    const info = readPins({ root })
    expect(info.drift).toBe(true)
    expect(info.version).toBeNull()
    rmSync(root, { recursive: true, force: true })
  })

  it('markeert een range als niet-exact (Early Preview moet exact gepind blijven)', () => {
    writePkg('package.json', '^0.14.0')
    const info = readPins({ root: dir, sources: ['package.json'] })
    expect(info.inexact).toEqual(['package.json'])
  })

  it('vindt de dep ook in devDependencies en meldt ontbrekende bronnen als missing (geen drift)', () => {
    const root = mkdtempSync(join(tmpdir(), 'litert-dev-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { [PACKAGE_NAME]: '0.14.0' } }))
    const info = readPins({ root })
    expect(info.version).toBe('0.14.0')
    expect(info.drift).toBe(false)
    expect(info.missing).toContain(join('spikes', 'litert-lm', 'package.json'))
    rmSync(root, { recursive: true, force: true })
  })

  it('LIVE: de échte repo pint dezelfde versie in alle PIN_SOURCES', () => {
    // Bijt bij een bump die maar één van de twee package.json's aanraakt —
    // precies het scenario waarin een hermeting stilzwijgend zinloos wordt.
    const info = readPins({ root: REPO_ROOT })
    expect(info.pins.length).toBeGreaterThan(0)
    expect(info.drift, `pins: ${JSON.stringify(info.pins)}`).toBe(false)
    expect(info.inexact).toEqual([])
    expect(parseVersion(info.version)).not.toBeNull()
  })
})

// ───────────────────────────────────────────────────── Adreno-signaalscan ──

describe('scanAdrenoSignal', () => {
  it('slaat NIET aan op de echte v0.15.0-notes (geen correctheidsfix genoemd)', () => {
    expect(scanAdrenoSignal(RELEASE_0_15_0.body)).toEqual({ hit: false, matches: [] })
  })

  it('slaat NIET aan op "NPU and GPU audio acceleration" (v0.14.0) — geen precisie-context', () => {
    expect(scanAdrenoSignal(RELEASE_0_14_0.body).hit).toBe(false)
  })

  it('slaat wél aan op een expliciete Adreno-correctheidsfix', () => {
    const { hit, matches } = scanAdrenoSignal(RELEASE_0_16_0_FIX.body)
    expect(hit).toBe(true)
    expect(matches).toContain('adreno')
  })

  it('slaat aan op de omschrijvende varianten zonder het woord "Adreno"', () => {
    expect(scanAdrenoSignal('Fixed garbled output on some mobile GPUs').hit).toBe(true)
    expect(scanAdrenoSignal('WebGPU: improved numerical correctness of matmul kernels').hit).toBe(true)
    expect(scanAdrenoSignal('Qualcomm driver workaround for bind group reuse').matches).toContain('qualcomm')
  })

  it('is leeg-invoer-bestendig', () => {
    expect(scanAdrenoSignal(undefined)).toEqual({ hit: false, matches: [] })
    expect(scanAdrenoSignal('')).toEqual({ hit: false, matches: [] })
  })
})

describe('releasesNewerThanPin', () => {
  const all = [RELEASE_0_16_0_FIX, RELEASE_0_15_0, RELEASE_0_14_0, RELEASE_0_14_0_ALPHA]

  it('houdt alleen stabiele releases boven de pin over, nieuwste eerst', () => {
    expect(releasesNewerThanPin(all, '0.14.0').map((r) => r.tag_name)).toEqual(['v0.16.0', 'v0.15.0'])
  })

  it('sluit de pin-versie zelf uit (vals-positief-val: v0.14.0 noemt "GPU")', () => {
    expect(releasesNewerThanPin(all, '0.14.0').map((r) => r.tag_name)).not.toContain('v0.14.0')
  })

  it('negeert prereleases tenzij gevraagd', () => {
    expect(releasesNewerThanPin(all, '0.13.1').map((r) => r.tag_name)).not.toContain('v0.14.0-alpha.0')
    expect(
      releasesNewerThanPin(all, '0.13.1', { includePrerelease: true }).map((r) => r.tag_name)
    ).toContain('v0.14.0-alpha.0')
  })

  it('overleeft onparseerbare tags en lege invoer', () => {
    expect(releasesNewerThanPin([{ tag_name: 'nightly', body: '' }], '0.14.0')).toEqual([])
    expect(releasesNewerThanPin(null, '0.14.0')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────── oordeel ───

describe('evaluateRelease', () => {
  it('gelijk aan npm-latest → up-to-date, exit 0', () => {
    const v = evaluateRelease({ pinInfo: pinInfoFor('0.15.0'), latest: '0.15.0', releases: [] })
    expect(v.status).toBe('up-to-date')
    expect(v.exitCode).toBe(EXIT_CODES.noAction)
    expect(v.newer).toBe(false)
  })

  it('de stand van 8 aug 2026 (pin 0.14.0, latest 0.15.0) → nieuwe release ZONDER Adreno-signaal, exit 11', () => {
    const v = evaluateRelease({
      pinInfo: pinInfoFor('0.14.0'),
      latest: '0.15.0',
      releases: [RELEASE_0_15_0, RELEASE_0_14_0, RELEASE_0_14_0_ALPHA],
    })
    expect(v.status).toBe('new-release-no-adreno')
    expect(v.exitCode).toBe(EXIT_CODES.newReleasePlain)
    expect(v.newer).toBe(true)
    expect(v.adreno.hit).toBe(false)
    expect(v.adreno.scanned).toEqual(['v0.15.0'])
    // Early-Preview-waarschuwing hoort altijd bij een bump-advies
    expect(v.action).toMatch(/tsc --noEmit/)
  })

  it('release mét Adreno-fix → signaal-status, exit 10, met hermeting-instructie', () => {
    const v = evaluateRelease({
      pinInfo: pinInfoFor('0.15.0'),
      latest: '0.16.0',
      releases: [RELEASE_0_16_0_FIX, RELEASE_0_15_0],
    })
    expect(v.status).toBe('new-release-adreno-signal')
    expect(v.exitCode).toBe(EXIT_CODES.newReleaseAdrenoSignal)
    expect(v.adreno.matches).toContain('adreno')
    expect(v.action).toMatch(/L1\.5-hermeting/)
    expect(v.action).toMatch(/eigenaar beslist/)
  })

  it('changelog onbereikbaar → eigen status, nog steeds gedetecteerd, exit 11', () => {
    const v = evaluateRelease({ pinInfo: pinInfoFor('0.14.0'), latest: '0.15.0', releases: null })
    expect(v.status).toBe('new-release-changelog-unavailable')
    expect(v.exitCode).toBe(EXIT_CODES.newReleasePlain)
    expect(v.newer).toBe(true)
    expect(v.adreno.changelogAvailable).toBe(false)
  })

  it('pin-drift wint van alles — geen versievergelijking op een gespleten pin', () => {
    const pinInfo = {
      pins: [
        { source: 'package.json', spec: '0.15.0', exact: true },
        { source: 'spikes/litert-lm/package.json', spec: '0.14.0', exact: true },
      ],
      missing: [],
      drift: true,
      version: null,
      inexact: [],
    }
    const v = evaluateRelease({ pinInfo, latest: '0.15.0', releases: [RELEASE_0_15_0] })
    expect(v.status).toBe('pin-drift')
    expect(v.exitCode).toBe(EXIT_CODES.pinDrift)
    expect(v.action).toMatch(/spikes\/litert-lm/)
  })

  it('ontbrekende of niet-exacte pin → error-status, exit 1', () => {
    expect(evaluateRelease({ pinInfo: pinInfoFor(null), latest: '0.15.0' }).status).toBe('pin-missing')
    const inexact = evaluateRelease({
      pinInfo: pinInfoFor('^0.14.0', { inexact: ['package.json'] }),
      latest: '0.15.0',
    })
    expect(inexact.status).toBe('pin-inexact')
    expect(inexact.exitCode).toBe(EXIT_CODES.error)
  })

  it('geen bruikbare npm-versie → latest-unknown', () => {
    expect(evaluateRelease({ pinInfo: pinInfoFor('0.14.0'), latest: null }).status).toBe('latest-unknown')
  })
})

// ──────────────────────────────────────────────────────────── harde regel ──

describe('HARDE REGEL: de check heropent de bouwfase nooit zelf', () => {
  it('AUTO_REOPEN_ALLOWED staat op false', () => {
    expect(AUTO_REOPEN_ALLOWED).toBe(false)
  })

  it('geen enkele tak van evaluateRelease levert autoReopen: true', () => {
    const cases = [
      { pinInfo: pinInfoFor('0.15.0'), latest: '0.15.0', releases: [] }, // up-to-date
      { pinInfo: pinInfoFor('0.14.0'), latest: '0.15.0', releases: [RELEASE_0_15_0] }, // no-adreno
      { pinInfo: pinInfoFor('0.15.0'), latest: '0.16.0', releases: [RELEASE_0_16_0_FIX] }, // adreno-signaal
      { pinInfo: pinInfoFor('0.14.0'), latest: '0.15.0', releases: null }, // changelog weg
      { pinInfo: pinInfoFor(null, { drift: true, pins: [] }), latest: '0.15.0' }, // drift
      { pinInfo: pinInfoFor(null), latest: '0.15.0' }, // pin-missing
      { pinInfo: pinInfoFor('^0.14.0', { inexact: ['package.json'] }), latest: '0.15.0' }, // range
      { pinInfo: pinInfoFor('0.14.0'), latest: null }, // latest-unknown
    ]
    const statuses = new Set()
    for (const input of cases) {
      const v = evaluateRelease(input)
      statuses.add(v.status)
      expect(v.autoReopen, `status ${v.status}`).toBe(false)
    }
    // Alle acht takken zijn ook echt geraakt — anders is deze test een
    // schijnzekerheid geworden nadat iemand een tak toevoegde of hernoemde.
    expect(statuses.size).toBe(8)
  })

  it('het advies bij een Adreno-treffer draagt de mens-gate expliciet uit', () => {
    const v = evaluateRelease({
      pinInfo: pinInfoFor('0.15.0'),
      latest: '0.16.0',
      releases: [RELEASE_0_16_0_FIX],
    })
    expect(v.action).toMatch(/deze check doet dat niet/i)
    expect(v.action).not.toMatch(/\bheropend\b|\bautomatisch heropen/i)
  })

  it('het rapport benoemt de mens-gate, ongeacht de uitkomst', () => {
    for (const releases of [[], [RELEASE_0_16_0_FIX]]) {
      const v = evaluateRelease({ pinInfo: pinInfoFor('0.15.0'), latest: '0.16.0', releases })
      expect(formatReport(v)).toMatch(/signaleert alleen/)
    }
  })
})

// ───────────────────────────────────────────────────────── end-to-end ──────

describe('runCheck (gemockte fetch, geen netwerk)', () => {
  let root

  const mockFetch = ({ packument, releases, failReleases = false }) => async (url) => {
    if (url.includes('registry.npmjs.org')) {
      return { ok: true, status: 200, json: async () => packument }
    }
    if (failReleases) return { ok: false, status: 403, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => releases }
  }

  const packument = {
    'dist-tags': { latest: '0.15.0' },
    versions: { '0.14.0-alpha.0': {}, '0.14.0': {}, '0.15.0': {} },
    time: { '0.14.0': '2026-07-01T22:29:24.722Z', '0.15.0': '2026-07-31T21:32:14.273Z' },
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'litert-e2e-'))
    mkdirSync(join(root, 'spikes', 'litert-lm'), { recursive: true })
    for (const rel of PIN_SOURCES) {
      writeFileSync(join(root, rel), JSON.stringify({ dependencies: { [PACKAGE_NAME]: '0.14.0' } }))
    }
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('reproduceert de stand van 8 aug 2026 end-to-end', async () => {
    const v = await runCheck({
      root,
      fetchImpl: mockFetch({ packument, releases: [RELEASE_0_15_0, RELEASE_0_14_0] }),
    })
    expect(v.pin).toBe('0.14.0')
    expect(v.latest).toBe('0.15.0')
    expect(v.latestPublishedAt).toBe('2026-07-31T21:32:14.273Z')
    expect(v.status).toBe('new-release-no-adreno')
    expect(v.autoReopen).toBe(false)
    expect(formatReport(v)).toMatch(/npm-latest\s*: 0\.15\.0/)
  })

  it('degradeert netjes als de GitHub-changelog faalt (rate limit) — npm-detectie blijft staan', async () => {
    const v = await runCheck({ root, fetchImpl: mockFetch({ packument, failReleases: true }) })
    expect(v.status).toBe('new-release-changelog-unavailable')
    expect(v.newer).toBe(true)
  })

  it('--no-changelog slaat de GitHub-call over zonder te falen', async () => {
    let releasesCalled = false
    const v = await runCheck({
      root,
      skipChangelog: true,
      fetchImpl: async (url) => {
        if (!url.includes('registry.npmjs.org')) releasesCalled = true
        return { ok: true, status: 200, json: async () => packument }
      },
    })
    expect(releasesCalled).toBe(false)
    expect(v.status).toBe('new-release-changelog-unavailable')
  })

  it('raakt het netwerk helemaal niet bij pin-drift', async () => {
    const driftRoot = mkdtempSync(join(tmpdir(), 'litert-e2e-drift-'))
    mkdirSync(join(driftRoot, 'spikes', 'litert-lm'), { recursive: true })
    writeFileSync(join(driftRoot, 'package.json'), JSON.stringify({ dependencies: { [PACKAGE_NAME]: '0.15.0' } }))
    writeFileSync(
      join(driftRoot, 'spikes', 'litert-lm', 'package.json'),
      JSON.stringify({ dependencies: { [PACKAGE_NAME]: '0.14.0' } })
    )
    let called = false
    const v = await runCheck({
      root: driftRoot,
      fetchImpl: async () => {
        called = true
        throw new Error('netwerk had niet geraakt mogen worden')
      },
    })
    expect(called).toBe(false)
    expect(v.status).toBe('pin-drift')
    rmSync(driftRoot, { recursive: true, force: true })
  })

  it('propageert een npm-registry-fout als throw (main() vertaalt die naar exit 1)', async () => {
    await expect(
      runCheck({ root, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) })
    ).rejects.toThrow(/HTTP 503/)
  })
})
