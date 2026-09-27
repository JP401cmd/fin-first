// @vitest-environment node
/**
 * Tests voor de runtime-poort `scripts/check-node-runtime.mjs` (ADR 0100).
 *
 * Wat hier vastligt: de versievergelijking is numeriek per segment (24.9 is
 * óúder dan 24.15), een te oude runtime is fataal behalve op Vercel (daar alleen
 * een waarschuwing, zodat een build nooit breekt), een ontbrekende engines.node
 * is niet-fataal, en een range die de poort niet begrijpt faalt luid in plaats
 * van stil verkeerd te vergelijken.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseMinimumVersion,
  parseVersion,
  compareVersions,
  evaluateNodeRuntime,
  checkNodeRuntime,
  assertNodeRuntime,
  UPGRADE_HINT,
} from './check-node-runtime.mjs'

const FLOOR = '>=24.15.0'

describe('parseMinimumVersion', () => {
  it('leest de vorm >=x.y.z', () => {
    expect(parseMinimumVersion('>=24.15.0')).toEqual([24, 15, 0])
    expect(parseMinimumVersion(' >= 24.15.0 ')).toEqual([24, 15, 0])
  })

  it.each(['^24.15.0', '24.x', '>=24.15', '>=22.0.0 || >=24.15.0', '~24.15.0', ''])(
    'weigert de niet-ondersteunde vorm %j',
    (range) => {
      expect(parseMinimumVersion(range)).toBeNull()
    },
  )
})

describe('parseVersion', () => {
  it('accepteert met en zonder v-prefix en met een pre-release-staart', () => {
    expect(parseVersion('24.19.0')).toEqual([24, 19, 0])
    expect(parseVersion('v24.19.0')).toEqual([24, 19, 0])
    expect(parseVersion('25.0.0-nightly20260901')).toEqual([25, 0, 0])
  })

  it('geeft null op onzin', () => {
    expect(parseVersion('onbekend')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('vergelijkt numeriek per segment, niet als tekst', () => {
    expect(compareVersions([24, 9, 0], [24, 15, 0])).toBeLessThan(0)
    expect(compareVersions([24, 15, 0], [24, 15, 0])).toBe(0)
    expect(compareVersions([25, 0, 0], [24, 99, 99])).toBeGreaterThan(0)
  })
})

describe('evaluateNodeRuntime', () => {
  it.each([
    ['24.13.0', 'too-old', true],
    ['24.14.9', 'too-old', true],
    ['22.20.0', 'too-old', true],
    ['24.15.0', 'ok', false],
    ['24.19.0', 'ok', false],
    ['25.8.1', 'ok', false],
    ['26.0.0', 'ok', false],
  ])('Node %s tegen >=24.15.0 → %s (fataal: %s)', (currentVersion, status, fatal) => {
    const verdict = evaluateNodeRuntime({ engineRange: FLOOR, currentVersion, isVercel: false })
    expect(verdict.status).toBe(status)
    expect(verdict.fatal).toBe(fatal)
  })

  it('noemt versie, ondergrens, ADR en de upgrade-route in de stopmelding', () => {
    const verdict = evaluateNodeRuntime({ engineRange: FLOOR, currentVersion: '24.13.0', isVercel: false })
    expect(verdict.message).toContain('Node v24.13.0 < ondergrens 24.15.0 (ADR 0100)')
    expect(verdict.message).toContain(UPGRADE_HINT)
  })

  it('waarschuwt op Vercel alleen, ook bij een te oude runtime — nooit een buildbreuk', () => {
    const verdict = evaluateNodeRuntime({ engineRange: FLOOR, currentVersion: '24.13.0', isVercel: true })
    expect(verdict.status).toBe('too-old')
    expect(verdict.fatal).toBe(false)
    expect(verdict.message).toMatch(/waarschuwing \(Vercel, niet blokkerend\)/)
  })

  it('is niet-fataal op Vercel bij een onbegrepen range', () => {
    const verdict = evaluateNodeRuntime({ engineRange: '^24.15.0', currentVersion: '24.19.0', isVercel: true })
    expect(verdict.status).toBe('unsupported-range')
    expect(verdict.fatal).toBe(false)
  })

  it.each([undefined, ''])('ontbrekende engines.node (%j) is een waarschuwing, geen stop', (engineRange) => {
    const verdict = evaluateNodeRuntime({ engineRange, currentVersion: '20.0.0', isVercel: false })
    expect(verdict.status).toBe('no-engines')
    expect(verdict.fatal).toBe(false)
  })

  it('faalt luid op een range die de poort niet begrijpt', () => {
    const verdict = evaluateNodeRuntime({ engineRange: '^24.15.0', currentVersion: '24.19.0', isVercel: false })
    expect(verdict.status).toBe('unsupported-range')
    expect(verdict.fatal).toBe(true)
    expect(verdict.message).toContain('>=x.y.z')
  })

  it('faalt luid op een onleesbare lopende versie', () => {
    const verdict = evaluateNodeRuntime({ engineRange: FLOOR, currentVersion: 'onbekend', isVercel: false })
    expect(verdict.status).toBe('unparseable-version')
    expect(verdict.fatal).toBe(true)
  })
})

describe('checkNodeRuntime / assertNodeRuntime (leest package.json)', () => {
  let withEngines
  let withoutEngines

  beforeAll(() => {
    withEngines = mkdtempSync(join(tmpdir(), 'check-node-runtime-'))
    writeFileSync(join(withEngines, 'package.json'), JSON.stringify({ engines: { node: FLOOR } }))
    withoutEngines = mkdtempSync(join(tmpdir(), 'check-node-runtime-'))
    writeFileSync(join(withoutEngines, 'package.json'), JSON.stringify({ name: 'zonder-engines' }))
  })

  afterAll(() => {
    rmSync(withEngines, { recursive: true, force: true })
    rmSync(withoutEngines, { recursive: true, force: true })
  })

  it('stopt (throw) op een te oude runtime buiten Vercel', () => {
    expect(() => assertNodeRuntime({ rootDir: withEngines, currentVersion: '24.13.0', env: {} })).toThrow(
      /ondergrens 24\.15\.0/,
    )
  })

  it('waarschuwt alleen op Vercel', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const verdict = assertNodeRuntime({ rootDir: withEngines, currentVersion: '24.13.0', env: { VERCEL: '1' } })
      expect(verdict.status).toBe('too-old')
      expect(warn).toHaveBeenCalledOnce()
    } finally {
      warn.mockRestore()
    }
  })

  it('is stil bij een geldige runtime', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(assertNodeRuntime({ rootDir: withEngines, currentVersion: '24.19.0', env: {} }).status).toBe('ok')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('laat een package.json zonder engines door', () => {
    expect(checkNodeRuntime({ rootDir: withoutEngines, currentVersion: '20.0.0', env: {} }).fatal).toBe(false)
  })

  it('leest de échte ondergrens van dit repo en de lopende runtime voldoet eraan', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    expect(parseMinimumVersion(pkg.engines.node)).not.toBeNull()
    expect(checkNodeRuntime({ env: {} }).status).toBe('ok')
  })
})
