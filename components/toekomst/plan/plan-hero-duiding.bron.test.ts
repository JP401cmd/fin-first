/**
 * Bron-grendels op het blok onder de KPI-strip (`plan-hero-duiding.tsx`):
 * - vrij-mogelijk-vanaf (drieslag-prop): rekenstand onder een vast anker
 * - nu-stoppen (drieslag): consume-only uit `heroFireAge.anker`
 * - vrijheids-pct-anker (balk): de vulling is `effectiveFreedomPct`, een ratio
 *
 * Fase 2 (ADR 0179 D2, spec §4.9) — BEWUST VERVALLEN:
 * - de duidingszin (`buildVrijheidsleeftijdZin`, "werken wordt een keuze rond je …") en
 *   daarmee de grendel "pending volgt showFireAgeNotice": er is geen zin meer die de
 *   melding kan tegenspreken. Toets ADR 0129 B10: de drager is `ankerVraag`, niet deze zin.
 * - het bedrag onder de balk ("€ … — volledige vrijheid" / "tot je …e — einde van je plan"):
 *   het doelbedrag staat in KPI 2, het percentage onder een vast anker in de kop.
 *   Nieuw: onder solved noemt de balk "N% van je doelbedrag" (`planSamenvatting`).
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-hero-duiding.tsx'))

describe('plan-hero-duiding — de duidingszin is vervallen (fase 2)', () => {
  it('bouwt geen vrijheidsleeftijd-zin meer', () => {
    expect(source).not.toMatch(/buildVrijheidsleeftijdZin\(|from '@\/lib\/horizon\/vrijheidsleeftijd-zin'/)
    expect(source).not.toContain('data-testid="hero-duiding"')
  })
})

describe('plan-hero-duiding — de drieslag (ADR 0129 D7)', () => {
  it('rendert uit heroFireAge.anker, consume-only', () => {
    expect(source).toContain('<AnkerDrieslag')
    expect(source).toContain('anker={heroFireAge.anker}')
    expect(source).toContain('solvedFireEndAge={solvedRun?.endAge ?? null}')
  })

  it('krijgt de rekenstand: vast anker én nog geen batch-antwoord (vrij-mogelijk-vanaf)', () => {
    expect(source).toContain('solvedPending={isFixedAnchorMode && solvedRun === null}')
  })
})

describe('plan-hero-duiding — voortgangsbalk', () => {
  it('vult met het vrijheids-% (ratio, deflateert nooit)', () => {
    expect(source).toMatch(
      /const vulling = hasPerspectiveHero\s*\?\s*Math\.max\(Math\.min\(perspectiveHero!\.freedomPercentage, 100\), 0\)\s*:\s*effectiveFreedomPct/,
    )
    expect(source).toContain('style={{ width: `${vulling}%` }}')
  })

  it('noemt onder solved het percentage via planSamenvatting, onder een vast anker niets', () => {
    expect(source).toContain("planSamenvatting({ kind: 'solved', doelbedragPct: vulling })")
    expect(source).toMatch(/isFixedAnchorMode && !hasPerspectiveHero\s*\?\s*null/)
  })

  it('toont geen bedrag meer onder de balk (het doelbedrag staat in KPI 2)', () => {
    expect(source).not.toMatch(/formatMasked\w*Currency\(|<MaskedAmount\b|\bview[A-Z]\w*/)
    expect(source).not.toMatch(/volledige vrijheid|einde van je plan/)
  })
})
