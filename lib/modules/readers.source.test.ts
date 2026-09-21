/**
 * Bron-scan: elke lezer van `profiles.active_modules` gaat via de ene helper
 * (Krant 2A, fase 1). Een eigen `?? ALL_MODULES` of een hardcoded
 * `[...ALL_MODULES]` naast de helper is precies de drift die 2A opheft.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const root = resolve(__dirname, '..', '..')
const code = (rel: string) =>
  readSourceLF(resolve(root, rel))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

describe('lezers van active_modules gaan via resolveActiveModules', () => {
  it('app-shell (app/(app)/layout.tsx) leidt activeModules af uit het profiel', () => {
    const src = code('app/(app)/layout.tsx')
    expect(src).toMatch(/const activeModules = resolveActiveModules\(profile\)/)
    expect(src).not.toMatch(/ALL_MODULES/)
    // De coach-vlaggen volgen dezelfde afgeleide set, niet een eigen constante.
    expect(src).toMatch(/coachHasTransactionsModule = activeModules\.includes\('budgetteren'\)/)
    // De client-home (top-bar ←, waffle) krijgt dezelfde set als de proxy.
    expect(src).toMatch(/<HomeScreenProvider[\s\S]*?activeModules=\{activeModules\}/)
  })

  it('AI-context (lib/ai/context/builder.ts) leest de kolom via de helper', () => {
    const src = code('lib/ai/context/builder.ts')
    expect(src).toMatch(/activeModules = resolveActiveModules\(profile\)/)
    expect(src).not.toMatch(/ALL_MODULES/)
  })

  it('proxy (lib/supabase/proxy.ts) haalt beide kolommen in één query en routeert via resolveHomeHref', () => {
    const src = code('lib/supabase/proxy.ts')
    expect(src).toMatch(/\.select\('home_screen, active_modules'\)/)
    expect(src).toMatch(/return resolveHomeHref\(/)
    expect(src).not.toMatch(/homeHrefFor\(/)
  })

  it('getHomePath is weg uit de module-registry', () => {
    expect(code('lib/module-registry.ts')).not.toMatch(/getHomePath/)
  })
})

describe('geen lezer van .active_modules buiten de helper', () => {
  // Een nieuwe `profile.active_modules.includes(...)` ergens anders omzeilt
  // de helper compile-onzichtbaar. Schrijvers die een object vullen staan
  // bewust op de lijst; een nieuwe entry vraagt een bewuste afweging.
  const ALLOWED = new Set([
    'lib/modules/resolve.ts', // de helper zelf
    'lib/seed-persona.ts', // schrijver: profileData.active_modules = persona…
  ])

  function walk(dir: string, out: string[]): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        walk(full, out)
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
        out.push(full)
      }
    }
  }

  it('alleen de helper leest de kolom als property', () => {
    const files: string[] = []
    for (const top of ['app', 'lib', 'components']) walk(join(root, top), files)
    const offenders = files
      .map((f) => relative(root, f).split(sep).join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      // `profiles.active_modules` is de kolomnaam in proza (UAT-teksten), geen lezing.
      .filter((rel) => /(?<!profiles)\.active_modules\b|\[['"]active_modules['"]\]/.test(code(rel)))
    expect(offenders).toEqual([])
  })
})
