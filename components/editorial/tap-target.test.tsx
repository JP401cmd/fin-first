import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TapTarget,
  tapTargetClass,
  TAP_TARGET_RESERVE,
  TAP_TARGET_EXTEND,
  TAP_TARGET_EXTEND_BLOCK,
} from './tap-target'

const ROOT = resolve(__dirname, '../..')

describe('TapTarget', () => {
  it('rendert een button met de toegankelijke naam uit `label`', () => {
    render(
      <TapTarget label="Bewerken">
        <span data-testid="icoon" />
      </TapTarget>,
    )
    const btn = screen.getByRole('button', { name: 'Bewerken' })
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.getAttribute('title')).toBe('Bewerken')
    expect(screen.getByTestId('icoon')).toBeTruthy()
  })

  it('default-modus reserveert een echt 44×44 vak (.touch-target)', () => {
    render(<TapTarget label="Sluiten">x</TapTarget>)
    expect(screen.getByRole('button', { name: 'Sluiten' }).className).toContain('touch-target')
  })

  it('extend laat de zichtbare klassen staan en rekt alleen het raakgebied op', () => {
    render(
      <TapTarget label="Archiveren" hit="extend" className="h-8 w-8 rounded-full">
        x
      </TapTarget>,
    )
    const cls = screen.getByRole('button', { name: 'Archiveren' }).className
    // Zichtbare maat blijft ongemoeid …
    expect(cls).toContain('h-8')
    expect(cls).toContain('w-8')
    // … en het raakgebied krijgt een 44px-vloer in beide assen.
    expect(cls).toContain('after:min-h-[44px]')
    expect(cls).toContain('after:min-w-[44px]')
    expect(cls).toContain('relative')
  })

  it('extend-block rekt alleen verticaal op (voor dichte horizontale balken)', () => {
    render(
      <TapTarget label="Meldingen" hit="extend-block" className="h-9 w-9">
        x
      </TapTarget>,
    )
    const cls = screen.getByRole('button', { name: 'Meldingen' }).className
    expect(cls).toContain('after:min-h-[44px]')
    expect(cls).not.toContain('after:min-w-[44px]')
  })

  it('geeft klikken en extra button-attributen door', () => {
    const onClick = vi.fn()
    render(
      <TapTarget label="Pauzeren" aria-pressed onClick={onClick}>
        x
      </TapTarget>,
    )
    const btn = screen.getByRole('button', { name: 'Pauzeren' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('tapTargetClass mapt de drie modi op de geëxporteerde constanten', () => {
    expect(tapTargetClass()).toBe(TAP_TARGET_RESERVE)
    expect(tapTargetClass('reserve')).toBe(TAP_TARGET_RESERVE)
    expect(tapTargetClass('extend')).toBe(TAP_TARGET_EXTEND)
    expect(tapTargetClass('extend-block')).toBe(TAP_TARGET_EXTEND_BLOCK)
  })
})

/**
 * De preventie-gate hoort niet alleen in pre-push te leven: als de scanner stuk
 * gaat of iemand zet er stilletjes een bestand bij, moet de suite dat zien.
 */
describe('check-tap-targets (preventie-gate, M19)', () => {
  it('draait schoon op de huidige boom', () => {
    const out = execFileSync(process.execPath, ['scripts/check-tap-targets.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    expect(out).toContain('0 nieuwe')
  })

  it('de zes M19-oppervlakken staan NIET (meer) op de grandfather-allowlist', () => {
    const src = readFileSync(resolve(ROOT, 'scripts/check-tap-targets.mjs'), 'utf8')
    const start = src.indexOf('const ALLOWLIST_ENTRIES = [')
    const allow = src.slice(start, src.indexOf('\n]', start))
    for (const f of [
      'components/app/shell/lever-compass.tsx',
      'components/app/color-picker-card.tsx',
      'components/overview/guide-screen-view.tsx',
      'components/app/shell/top-bar.tsx',
      'components/app/privacy-toggle.tsx',
    ]) {
      expect(allow).not.toContain(f)
    }
  })
})
