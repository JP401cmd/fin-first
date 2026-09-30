// ── Bron-scan: geen AI in aanmelden en onboarding van de Krant (Krant 2C) ────
//
// De poort van kaart 2C vraagt "een bevestiging dat er bij het aanmelden en
// tijdens de onboarding geen AI-route is aangeroepen". Een Krant-account krijgt
// nergens AI (B11) en er is geen AI-toestemmingsstap. Deze test is de vangrail
// in de bron: geen import uit lib/ai, en geen fetch naar een AI-route, de oude
// AI-Krant (/api/news) of de AI-extractie van de gewone onboarding.
//
// Alleen CODE telt: commentaar wordt gestript (de bestanden leggen juist uit
// waarom er geen AI in zit).

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

const ROOT = process.cwd()

const MAPPEN = [
  ['app', '(onboarding)', 'onboarding', 'krant'],
  ['components', 'krant'],
  ['app', 'api', 'krant', 'profiel'],
  ['app', 'api', 'krant', 'onboarding'],
  // De tweede host van de profielbody (eindreview 0.92.28).
  ['app', '(app)', 'mijn', 'nieuwsprofiel'],
]

const LOSSE_BESTANDEN = [
  ['lib', 'krant', 'aanmelden.ts'],
  ['lib', 'krant', 'aanmelden-pad.ts'],
  ['lib', 'modules', 'product-preset.ts'],
  ['app', 'auth', 'callback', 'route.ts'],
]

function bestandenIn(dir: string): string[] {
  const out: string[] = []
  for (const naam of readdirSync(dir).sort()) {
    const pad = join(dir, naam)
    if (statSync(pad).isDirectory()) out.push(...bestandenIn(pad))
    else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) out.push(pad)
  }
  return out
}

const zonderCommentaar = (bron: string) => bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const VERBODEN: Array<[RegExp, string]> = [
  [/from\s+['"](?:@\/lib\/ai|(?:\.\.\/)+ai)(?:\/|['"])/, 'import uit lib/ai'],
  [/import\(\s*['"]@\/lib\/ai/, 'dynamische import uit lib/ai'],
  [/['"`]\/api\/ai(?:\/|['"`?])/, 'een AI-route (/api/ai)'],
  [/['"`]\/api\/news(?:\/|['"`?])/, 'de oude AI-Krant (/api/news)'],
  [/['"`]\/api\/onboarding\/extract/, 'de AI-extractie van de onboarding'],
]

describe('geen AI in aanmelden en onboarding van de Krant (Krant 2C)', () => {
  const bestanden = [
    ...MAPPEN.map((d) => join(ROOT, ...d)).filter((d) => existsSync(d)).flatMap(bestandenIn),
    ...LOSSE_BESTANDEN.map((p) => join(ROOT, ...p)),
  ]

  it('vindt de bestanden van de onboarding, de routes en de body', () => {
    const rel = bestanden.map((f) => relative(ROOT, f).split('\\').join('/'))
    for (const verwacht of [
      'app/(onboarding)/onboarding/krant/page.tsx',
      'components/krant/profiel-body.tsx',
      'components/krant/krant-onboarding.tsx',
      'components/krant/nieuwsprofiel-scherm.tsx',
      'app/api/krant/profiel/route.ts',
      'app/api/krant/onboarding/klaar/route.ts',
    ]) {
      expect(rel).toContain(verwacht)
    }
  })

  it('geen import uit lib/ai en geen fetch naar /api/ai, /api/news of /api/onboarding/extract', () => {
    for (const f of bestanden) {
      const code = zonderCommentaar(readSourceLF(f))
      for (const [re, wat] of VERBODEN) expect(re.test(code), `${relative(ROOT, f)}: ${wat}`).toBe(false)
    }
  })

  it('sentinel: de scan bijt op een echte overtreding, niet op commentaar', () => {
    const bijt = (s: string) => VERBODEN.some(([re]) => re.test(zonderCommentaar(s)))
    expect(bijt("import { getModel } from '@/lib/ai/config'")).toBe(true)
    expect(bijt("await fetch('/api/news')")).toBe(true)
    expect(bijt('await fetch(`/api/ai/chat`)')).toBe(true)
    expect(bijt("fetch('/api/onboarding/extract', {})")).toBe(true)
    expect(bijt("// fetch('/api/news') mag hier niet")).toBe(false)
    expect(bijt("await fetch('/api/krant/profiel')")).toBe(false)
    expect(bijt("await fetch('/api/newsletter')")).toBe(false)
  })
})
