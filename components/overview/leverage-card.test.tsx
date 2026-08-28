import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Wallet } from 'lucide-react'
import { LeverageCard, type LeverageCardVariant } from './leverage-card'
import { LEVERAGE_STATUS_LABEL, type LeverageStatus } from '@/lib/leverage-status'

/**
 * Contracttests voor de gedeelde `LeverageCard`-shell (S1).
 *
 * Dit is de shell die /overzicht, /overzicht/cashflow, /overzicht/belasting en
 * /toekomst delen, en waarop de kaarten S2, S4 en S17 verder bouwen. De regel
 * die hier hard vastligt:
 *
 *   **Een status draagt altijd een woord; kleur is nooit de enige drager —
 *     en precies ÉÉN drager, nooit twee.**
 *
 * Een tweede drager is net zo fout als geen enkele: dan hoort een screenreader
 * de status dubbel. Beide kanten worden hieronder getoetst.
 */

const ALL_STATUSES: LeverageStatus[] = ['good', 'warn', 'bad', 'neutral']

function renderCard(props: Partial<Parameters<typeof LeverageCard>[0]> = {}) {
  return render(
    <LeverageCard
      Icon={Wallet}
      tint="text-emerald-700 bg-emerald-50"
      label="Bezittingen"
      kpi="€ 250.000"
      status="good"
      href="/overzicht/bezittingen"
      {...props}
    />,
  )
}

/** De status-dot, zoals de andere suites hem ook selecteren. */
function dot(container: HTMLElement): HTMLElement | null {
  return container.querySelector('span.absolute.rounded-full')
}

// ── Varianten ─────────────────────────────────────────────────────────────

describe('LeverageCard — varianten', () => {
  it('rendert default als `full` (bedrag primair in serif, oordeel klein eronder)', () => {
    const { container } = renderCard({ subText: 'Goed gespreid' })
    const kpiEl = Array.from(container.querySelectorAll('div')).find((d) =>
      d.textContent === '€ 250.000',
    )
    expect(kpiEl?.className).toContain('font-serif')
    const verdictEl = screen.getByText('Goed gespreid')
    expect(verdictEl.className).toContain('text-[11px]')
  })

  it('draait de hiërarchie om in `verdict`: oordeel primair, bedrag gedempt', () => {
    const { container } = renderCard({ variant: 'verdict', subText: 'Goed gespreid' })
    const verdictEl = screen.getByText('Goed gespreid')
    // Oordeel op de regel die de KPI in `full` had — géén 11px meer.
    expect(verdictEl.className).toContain('sm:text-base')
    expect(verdictEl.className).not.toContain('text-[11px]')
    // Bedrag zakt naar de gedempte regel.
    const kpiEl = Array.from(container.querySelectorAll('div')).find((d) =>
      d.textContent === '€ 250.000',
    )
    expect(kpiEl?.className).toContain('text-[11px]')
    expect(kpiEl?.className).toContain('var(--ink-3)')
    expect(kpiEl?.className).not.toContain('font-serif')
  })

  it('toont in `compact` alleen icoon + label — geen KPI, oordeel of status-dot', () => {
    const { container } = renderCard({
      variant: 'compact',
      subText: 'Goed gespreid',
    })
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(container.textContent).not.toContain('€ 250.000')
    expect(screen.queryByText('Goed gespreid')).toBeNull()
    expect(dot(container)).toBeNull()
  })

  it('rendert `subAmount` in `full` maar NIET in `verdict` (grondslag is geen oordeel)', () => {
    const grondslag = 'excl. eigen woning · € 50.000'
    renderCard({ subAmount: grondslag, subText: 'Goed gespreid' })
    expect(screen.getByText(grondslag)).toBeTruthy()

    renderCard({ variant: 'verdict', subAmount: grondslag, subText: 'Goed gespreid' })
    // Nog steeds precies één voorkomen — dat van de `full`-render hierboven.
    expect(screen.getAllByText(grondslag).length).toBe(1)
  })

  it('zet `kpiWindow` in `verdict` achter het bedrag op dezelfde regel (S4-haak)', () => {
    const { container } = renderCard({
      variant: 'verdict',
      kpi: '€ 1.240',
      kpiWindow: 'in augustus tot nu toe',
      subText: 'Boven budget',
    })
    const line = Array.from(container.querySelectorAll('div')).find((d) =>
      d.textContent?.startsWith('€ 1.240 · in augustus'),
    )
    expect(line).toBeTruthy()
    expect(line?.className).toContain('text-[11px]')
  })
})

// ── De kernregel: altijd een woord, altijd precies één drager ─────────────

describe('LeverageCard — status draagt altijd een woord (WCAG 2.2 §1.4.1)', () => {
  it.each(ALL_STATUSES)(
    '`verdict` valt terug op het generieke statuslabel als de call-site niets meegeeft (%s)',
    (status) => {
      renderCard({ variant: 'verdict', status, subText: null })
      expect(screen.getByText(LEVERAGE_STATUS_LABEL[status])).toBeTruthy()
    },
  )

  it.each(ALL_STATUSES)(
    'de status is voor AT bereikbaar in `verdict` mét eigen oordeel (%s)',
    (status) => {
      const { container } = renderCard({
        variant: 'verdict',
        status,
        subText: 'Sterk geconcentreerd',
      })
      // Zichtbaar oordeel = de drager; geen sr-only-duplicaat.
      expect(screen.getByText('Sterk geconcentreerd')).toBeTruthy()
      expect(container.querySelector('.sr-only')).toBeNull()
    },
  )

  it.each(ALL_STATUSES)(
    'springt met een sr-only-woord bij als er GEEN zichtbaar oordeel is (%s, `full`)',
    (status) => {
      const { container } = renderCard({ status, subText: null })
      const srOnly = container.querySelector('.sr-only')
      expect(srOnly?.textContent).toBe(LEVERAGE_STATUS_LABEL[status])
    },
  )

  it('geeft de sr-only-regel NIET wanneer `full` een zichtbaar oordeel heeft', () => {
    const { container } = renderCard({ subText: 'Goed gespreid' })
    expect(screen.getByText('Goed gespreid')).toBeTruthy()
    expect(container.querySelector('.sr-only')).toBeNull()
  })

  it('houdt de dot altijd decoratief — `title` is hover-affordance, geen a11y-naam', () => {
    for (const variant of ['full', 'verdict'] as LeverageCardVariant[]) {
      const { container } = renderCard({ variant, subText: 'Goed gespreid' })
      const d = dot(container)
      expect(d?.getAttribute('aria-hidden')).toBe('true')
      expect(d?.getAttribute('aria-label')).toBeNull()
      expect(d?.getAttribute('title')).toBe(LEVERAGE_STATUS_LABEL.good)
    }
  })

  it('kondigt de status nooit twee keer aan (exact één drager per kaart)', () => {
    // Zichtbaar oordeel → 1 drager, 0 sr-only.
    const withVerdict = renderCard({ variant: 'verdict', subText: 'Hoge schuldenlast' })
    expect(withVerdict.container.querySelectorAll('.sr-only').length).toBe(0)
    withVerdict.unmount()

    // Geen zichtbaar oordeel → 0 zichtbare, exact 1 sr-only.
    const withoutVerdict = renderCard({ subText: null, showSubRow: false })
    expect(withoutVerdict.container.querySelectorAll('.sr-only').length).toBe(1)
  })
})

// ── Chevron & drill-down (ongewijzigd gedrag, hier vastgepind) ────────────

describe('LeverageCard — chevron & drill-down', () => {
  it('rendert de chevron alleen wanneer `expandable`', () => {
    expect(
      renderCard({ expandable: false }).container.querySelector('button'),
    ).toBeNull()
    expect(
      renderCard({ expandable: true }).container.querySelector('button'),
    ).toBeTruthy()
  })

  it('rendert `children` alleen wanneer `expanded`, buiten de kaart-<Link>', () => {
    const { container } = renderCard({
      expandable: true,
      expanded: true,
      children: <p>Detailpaneel</p>,
    })
    const detail = screen.getByText('Detailpaneel')
    expect(detail.closest('a')).toBeNull()
    expect(container.querySelector('a')).toBeTruthy()
  })
})
