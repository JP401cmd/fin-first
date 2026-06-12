/**
 * globals-legacy-aliases.test.ts
 *
 * Pint de legacy-alias-tokens die in app/globals.css zijn gedefinieerd als
 * onderdeel van de accentkleuren-fix (2026-06-12). Vóór de fix bestonden
 * deze tokens nergens en draaiden ~25 componenten/charts stilletjes op hun
 * hex-fallbacks of renderden zonder kleur.
 *
 * Elke assertion controleert twee dingen:
 *   1. Het token is gedefineerd (de CSS-declaratie bestaat in het bestand).
 *   2. Het token verwijst naar de canonieke instelbare var(--color-*) —
 *      zodat de accentkeuze op /mijn/uiterlijk ook hier doorwerkt.
 *
 * Dit is een file-parse test — geen DOM of JSDOM nodig.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const CSS_PATH = join(process.cwd(), 'app', 'globals.css')
const css = readFileSync(CSS_PATH, 'utf-8')

/**
 * Parse alle `--naam: waarde;`-declaraties binnen :root { … } uit de CSS.
 * Retourneert een Map<naam, getrimde waarde>.
 */
function parseRootVars(source: string): Map<string, string> {
  const map = new Map<string, string>()
  // Isoleer de :root-block (eerste occurrence)
  // Geen dotAll-flag nodig: negated classes ([^}]) matchen ook newlines.
  const rootMatch = source.match(/:root\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/)
  if (!rootMatch) return map

  const block = rootMatch[1]
  // Zoek alle --name: value; patronen (value kan zelf var(...) bevatten)
  const declRegex = /(--[\w-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = declRegex.exec(block)) !== null) {
    map.set(m[1].trim(), m[2].trim())
  }
  return map
}

const vars = parseRootVars(css)

// ── Helper ────────────────────────────────────────────────────────────────

function assertAlias(token: string, expectedRef: string) {
  const value = vars.get(token)
  expect(
    value,
    `Token '${token}' niet gevonden in :root — was het legacy-alias-blok verwijderd?`,
  ).toBeDefined()
  expect(
    value,
    `Token '${token}' verwijst naar '${value}' i.p.v. '${expectedRef}'`,
  ).toBe(expectedRef)
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('globals.css — legacy module-alias-tokens (accentkleuren-fix)', () => {
  // ── kern-groep ──
  describe('kern-shorthands', () => {
    it('--kern verwijst naar var(--color-kern-500)', () => {
      assertAlias('--kern', 'var(--color-kern-500)')
    })
    it('--kern-t verwijst naar var(--color-kern-700)', () => {
      assertAlias('--kern-t', 'var(--color-kern-700)')
    })
    it('--kern-l verwijst naar var(--color-kern-50)', () => {
      assertAlias('--kern-l', 'var(--color-kern-50)')
    })
    it('--kern-m verwijst naar var(--color-kern-200)', () => {
      assertAlias('--kern-m', 'var(--color-kern-200)')
    })
  })

  describe('kern-genummerd', () => {
    it('--kern-400 verwijst naar var(--color-kern-400)', () => {
      assertAlias('--kern-400', 'var(--color-kern-400)')
    })
    it('--kern-500 verwijst naar var(--color-kern-500)', () => {
      assertAlias('--kern-500', 'var(--color-kern-500)')
    })
    it('--kern-700 verwijst naar var(--color-kern-700)', () => {
      assertAlias('--kern-700', 'var(--color-kern-700)')
    })
  })

  // ── will-groep ──
  describe('will-shorthands', () => {
    it('--will verwijst naar var(--color-wil-500)', () => {
      assertAlias('--will', 'var(--color-wil-500)')
    })
    it('--will-t verwijst naar var(--color-wil-700)', () => {
      assertAlias('--will-t', 'var(--color-wil-700)')
    })
    it('--will-l verwijst naar var(--color-wil-50)', () => {
      assertAlias('--will-l', 'var(--color-wil-50)')
    })
    it('--will-m verwijst naar var(--color-wil-200)', () => {
      assertAlias('--will-m', 'var(--color-wil-200)')
    })
  })

  // ── hor-groep (Toekomst / horizon) ──
  describe('hor-shorthands', () => {
    it('--hor verwijst naar var(--color-horizon-500)', () => {
      assertAlias('--hor', 'var(--color-horizon-500)')
    })
    it('--hor-t verwijst naar var(--color-horizon-700)', () => {
      assertAlias('--hor-t', 'var(--color-horizon-700)')
    })
    it('--hor-l verwijst naar var(--color-horizon-50)', () => {
      assertAlias('--hor-l', 'var(--color-horizon-50)')
    })
    it('--hor-m verwijst naar var(--color-horizon-200)', () => {
      assertAlias('--hor-m', 'var(--color-horizon-200)')
    })
  })

  // ── horizon-genummerd (meest gebruikt door charts en SVG-components) ──
  describe('horizon-genummerd', () => {
    it('--horizon-50 verwijst naar var(--color-horizon-50)', () => {
      assertAlias('--horizon-50', 'var(--color-horizon-50)')
    })
    it('--horizon-200 verwijst naar var(--color-horizon-200)', () => {
      assertAlias('--horizon-200', 'var(--color-horizon-200)')
    })
    it('--horizon-400 verwijst naar var(--color-horizon-400)', () => {
      assertAlias('--horizon-400', 'var(--color-horizon-400)')
    })
    it('--horizon-500 verwijst naar var(--color-horizon-500)', () => {
      assertAlias('--horizon-500', 'var(--color-horizon-500)')
    })
    it('--horizon-700 verwijst naar var(--color-horizon-700)', () => {
      assertAlias('--horizon-700', 'var(--color-horizon-700)')
    })
    it('--horizon-950 verwijst naar var(--color-horizon-950)', () => {
      assertAlias('--horizon-950', 'var(--color-horizon-950)')
    })
  })

  // ── Sanity: het blok is aanwezig en de parser werkt ──
  describe('parser-sanity', () => {
    it('parseert meer dan 50 CSS-variabelen uit :root (sanity check parser)', () => {
      expect(vars.size).toBeGreaterThan(50)
    })
    it('de canonieke --color-horizon-500 var zelf is gedefineerd (als oklch)', () => {
      const val = vars.get('--color-horizon-500')
      expect(val, '--color-horizon-500 niet gevonden in :root').toBeDefined()
      expect(val).toMatch(/oklch/)
    })
  })
})
