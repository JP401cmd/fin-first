/**
 * Bron-grendels op de duiding onder het kerngetal (blok E + F) na de verhuizing naar
 * `plan-hero-duiding.tsx` (fase 1, ADR 0179, kaart §5.1):
 * - kpi-gegevensmelding: de duidingszin zwijgt zodra de tegel een melding draagt
 * - vrij-mogelijk-vanaf (drieslag-prop): rekenstand onder een vast anker
 * - nu-stoppen (drieslag): consume-only uit `heroFireAge.anker`
 * - vrijheids-pct-anker (balk): de vulling is `effectiveFreedomPct`, een ratio
 * - euro-view (balk-label): hetzelfde view*-bedrag als de Doelbedrag-KPI
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-hero-duiding.tsx'))

describe('plan-hero-duiding — de duidingszin praat de melding niet tegen', () => {
  it('pending volgt showFireAgeNotice', () => {
    expect(source).toMatch(/pending:[\s\S]{0,200}showFireAgeNotice/)
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
      /width: `\$\{hasPerspectiveHero \? Math\.max\(Math\.min\(perspectiveHero!\.freedomPercentage, 100\), 0\) : effectiveFreedomPct\}%`/,
    )
  })

  it('noemt in het label hetzelfde view*-bedrag als de Doelbedrag-KPI', () => {
    expect(source).toMatch(/formatMaskedApproxCurrency\(viewBalkVrijheidDoel, masked\)\} — volledige vrijheid/)
    expect(source).toMatch(
      /isFixedAnchorMode\s*\?\s*\(simResult != null\s*\?\s*`tot je \$\{Math\.round\(simResult\.displayEndAge\)\}e — einde van je plan`/,
    )
    expect(source).not.toMatch(/— vermogen op AOW/)
    expect(source).not.toMatch(/formatMaskedCurrency\(balkVrijheidDoel, masked\)/)
    expect(source).not.toMatch(/formatMaskedCurrency\(vermogenOpAnker \?\? 0, masked\)/)
  })
})
