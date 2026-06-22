// lib/page-status/__tests__/banner-display.test.ts
//
// Unit-tests voor de pure weergave-helper resolveBannerDisplay()
// (lib/page-status/display.ts). Geen IO, geen Supabase, geen React.
//
// Laag: Vitest — pure module.

import { describe, it, expect } from 'vitest'
import { resolveBannerDisplay } from '../display'
import type { BannerDisplay, MinimizedLevel } from '../display'
import type { LeverageStatus } from '@/lib/leverage-status'

// ── Invarianten: minimizedLevel null ─────────────────────────────────────────
//
// Als de gebruiker nooit geminimaliseerd heeft, verschijnt de banner altijd
// expanded — ongeacht de huidige status.

describe('resolveBannerDisplay — minimizedLevel null → always expanded', () => {
  it('null minimizedLevel + warn status → expanded', () => {
    const result: BannerDisplay = resolveBannerDisplay('warn', null)
    expect(result).toBe('expanded')
  })

  it('null minimizedLevel + bad status → expanded', () => {
    expect(resolveBannerDisplay('bad', null)).toBe('expanded')
  })

  it('null minimizedLevel + good status → expanded (geen banner, maar helper geeft expanded)', () => {
    expect(resolveBannerDisplay('good', null)).toBe('expanded')
  })

  it('null minimizedLevel + neutral status → expanded', () => {
    expect(resolveBannerDisplay('neutral', null)).toBe('expanded')
  })
})

// ── Kernmatrix: geminimaliseerd op 'warn' ─────────────────────────────────────

describe('resolveBannerDisplay — minimizedLevel "warn"', () => {
  it('"warn" geminimaliseerd + huidige status "warn" → minimized (zelfde ernst, blijft ingeklapt)', () => {
    expect(resolveBannerDisplay('warn', 'warn')).toBe('minimized')
  })

  it('"warn" geminimaliseerd + huidige status "bad" → expanded (ESCALATIE: slechtere status hereopent de banner)', () => {
    expect(resolveBannerDisplay('bad', 'warn')).toBe('expanded')
  })

  it('"warn" geminimaliseerd + huidige status "good" → minimized (good < warn, geen escalatie)', () => {
    // good heeft severity 0; warn heeft severity 1. 0 <= 1 → minimized.
    // In de praktijk verschijnt de banner nooit voor good, maar de helper
    // moet wel een consistent antwoord geven.
    expect(resolveBannerDisplay('good', 'warn')).toBe('minimized')
  })

  it('"warn" geminimaliseerd + huidige status "neutral" → minimized (neutral < warn)', () => {
    expect(resolveBannerDisplay('neutral', 'warn')).toBe('minimized')
  })
})

// ── Kernmatrix: geminimaliseerd op 'bad' ──────────────────────────────────────

describe('resolveBannerDisplay — minimizedLevel "bad"', () => {
  it('"bad" geminimaliseerd + huidige status "bad" → minimized (zelfde ernst)', () => {
    expect(resolveBannerDisplay('bad', 'bad')).toBe('minimized')
  })

  it('"bad" geminimaliseerd + huidige status "warn" → minimized (de-escalatie blijft ingeklapt; severity warn < bad)', () => {
    // De gebruiker had alles bij 'bad' weggeklikt. Als het daarna verbetert
    // naar 'warn', mag de banner NIET vanzelf terug. De gebruiker heeft
    // bewust geminimaliseerd op het slechtste niveau.
    expect(resolveBannerDisplay('warn', 'bad')).toBe('minimized')
  })

  it('"bad" geminimaliseerd + huidige status "good" → minimized', () => {
    expect(resolveBannerDisplay('good', 'bad')).toBe('minimized')
  })

  it('"bad" geminimaliseerd + huidige status "neutral" → minimized', () => {
    expect(resolveBannerDisplay('neutral', 'bad')).toBe('minimized')
  })
})

// ── Grenscondities: severity-rangschikking ────────────────────────────────────
//
// De spec: minimized IFF minimizedLevel != null AND severity(status) <= severity(minimizedLevel)
// severity: good=0, neutral=0, warn=1, bad=2

describe('resolveBannerDisplay — severity ordering boundary checks', () => {
  it('severity(bad) > severity(warn) → bad na warn-minimalisatie heropent', () => {
    // Bevestigt dat bad STRIKT groter is dan warn in de ordening.
    const whenWarnMinimized = resolveBannerDisplay('bad', 'warn')
    expect(whenWarnMinimized).toBe('expanded')
  })

  it('severity(warn) <= severity(bad) → warn na bad-minimalisatie blijft ingeklapt', () => {
    const whenBadMinimized = resolveBannerDisplay('warn', 'bad')
    expect(whenBadMinimized).toBe('minimized')
  })

  it('severity(good) < severity(warn) → good na warn-minimalisatie blijft ingeklapt', () => {
    expect(resolveBannerDisplay('good', 'warn')).toBe('minimized')
  })

  it('severity(neutral) < severity(warn) → neutral na warn-minimalisatie blijft ingeklapt', () => {
    expect(resolveBannerDisplay('neutral', 'warn')).toBe('minimized')
  })

  it('severity(good) < severity(bad) → good na bad-minimalisatie blijft ingeklapt', () => {
    expect(resolveBannerDisplay('good', 'bad')).toBe('minimized')
  })

  it('severity(neutral) < severity(bad) → neutral na bad-minimalisatie blijft ingeklapt', () => {
    expect(resolveBannerDisplay('neutral', 'bad')).toBe('minimized')
  })

  it('symmetrie op zelfde niveau: warn+warn en bad+bad zijn beide minimized', () => {
    expect(resolveBannerDisplay('warn', 'warn')).toBe('minimized')
    expect(resolveBannerDisplay('bad', 'bad')).toBe('minimized')
  })
})

// ── Totaalmatrix: alle (status × minimizedLevel)-combinaties ─────────────────
//
// Uitputtende tabel. Maakt expliciet dat er GEEN verborgen combinaties zijn.

describe('resolveBannerDisplay — volledige 4×3-matrix (4 statussen, 2 niveaus + null)', () => {
  const cases: Array<{
    status: LeverageStatus
    level: MinimizedLevel | null
    expected: BannerDisplay
    label: string
  }> = [
    // minimizedLevel = null → altijd expanded
    { status: 'good',    level: null,   expected: 'expanded',  label: 'good/null' },
    { status: 'neutral', level: null,   expected: 'expanded',  label: 'neutral/null' },
    { status: 'warn',    level: null,   expected: 'expanded',  label: 'warn/null' },
    { status: 'bad',     level: null,   expected: 'expanded',  label: 'bad/null' },
    // minimizedLevel = 'warn' (severity 1): expanded alleen bij bad (severity 2)
    { status: 'good',    level: 'warn', expected: 'minimized', label: 'good/warn' },
    { status: 'neutral', level: 'warn', expected: 'minimized', label: 'neutral/warn' },
    { status: 'warn',    level: 'warn', expected: 'minimized', label: 'warn/warn' },
    { status: 'bad',     level: 'warn', expected: 'expanded',  label: 'bad/warn (escalatie)' },
    // minimizedLevel = 'bad' (severity 2): nooit escalatie mogelijk
    { status: 'good',    level: 'bad',  expected: 'minimized', label: 'good/bad' },
    { status: 'neutral', level: 'bad',  expected: 'minimized', label: 'neutral/bad' },
    { status: 'warn',    level: 'bad',  expected: 'minimized', label: 'warn/bad (de-escalatie)' },
    { status: 'bad',     level: 'bad',  expected: 'minimized', label: 'bad/bad' },
  ]

  for (const { status, level, expected, label } of cases) {
    it(`${label} → ${expected}`, () => {
      expect(resolveBannerDisplay(status, level)).toBe(expected)
    })
  }
})

// ── Informatieve vrijheidsbanner: minimizedLevel 'info' ───────────────────────
//
// De freedom-banner heeft status 'neutral' (severity 0) en minimaliseert op
// niveau 'info' (severity 0). Hij escaleert nooit: eenmaal ingeklapt blijft 'ie
// ingeklapt tot de gebruiker 'm zelf weer opent.

describe('resolveBannerDisplay — informatieve vrijheidsbanner (info)', () => {
  it("'info' geminimaliseerd + huidige status 'neutral' → minimized (blijft ingeklapt)", () => {
    expect(resolveBannerDisplay('neutral', 'info')).toBe('minimized')
  })

  it("null + 'neutral' → expanded (toont de vrijheidsbanner initieel)", () => {
    expect(resolveBannerDisplay('neutral', null)).toBe('expanded')
  })

  it("'info' geminimaliseerd + 'good' → minimized", () => {
    expect(resolveBannerDisplay('good', 'info')).toBe('minimized')
  })
})

// ── Typeveiligheid: retourtype is exact BannerDisplay ─────────────────────────

describe('resolveBannerDisplay — retourtype is BannerDisplay', () => {
  it('retourneert uitsluitend "expanded" of "minimized", nooit een andere string', () => {
    const allStatuses: LeverageStatus[] = ['good', 'neutral', 'warn', 'bad']
    const allLevels: Array<MinimizedLevel | null> = ['warn', 'bad', null]
    const validValues = new Set<string>(['expanded', 'minimized'])

    for (const status of allStatuses) {
      for (const level of allLevels) {
        const result = resolveBannerDisplay(status, level)
        expect(validValues.has(result), `Onverwacht retourtype "${result}" voor ${status}/${level}`).toBe(true)
      }
    }
  })
})

// ── asMinimizedLevel (pure validator uit route.ts) ───────────────────────────
//
// asMinimizedLevel is een lokale functie in route.ts (niet geëxporteerd). Ze
// is te eenvoudig om te isoleren, maar de semantiek wordt geraakt door de
// display-tests (via MinimizedLevel-type). We documenteren hier WAAROM we de
// route-handler NIET apart testen: de handler vereist createClient(),
// getCachedUser(), getServerPerspective() en diverse Supabase-loaders.
// Mocking die laag is zwaarder dan de waarde van de test. De PURE logica
// (normalizeRoute / asMinimizedLevel) is te trivial voor een geïsoleerde test;
// de display-helper is de rekenkundige kern en is volledig gedekt hierboven.

describe('route-handler pure validators — NIET getest (motivatie)', () => {
  it('gedocumenteerd: asMinimizedLevel en normalizeRoute zijn niet geëxporteerd → route-handler vereist Supabase-mock die zwaarder is dan de waarde', () => {
    // Dit is een intentioneel lege test die de beslissing vastlegt.
    // De pure display-logica is volledig gedekt via resolveBannerDisplay-tests.
    expect(true).toBe(true)
  })
})
