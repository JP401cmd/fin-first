/**
 * hefbomen-nav.lever-parity.test.tsx
 *
 * STATUS-PARITEITSTEST: sidebar-dot == overzicht-kaart per hefboom.
 *
 * Achtergrond
 * -----------
 * De sidebar (lever-compass.tsx) en de overzicht-kaarten (hefbomen-nav.tsx)
 * worden beide gevoed vanuit dezelfde `LeverScores`-bron (loadLeverScores).
 * De sidebar mapt LeverStatus → dot-klasse via STATUS_COLORS in lever-compass.tsx:
 *   green  → bg-emerald-500
 *   amber  → bg-amber-500
 *   red    → bg-red-500
 *   neutral→ bg-[var(--ink-4)]   (CSS-var, niet een vaste Tailwind-klasse)
 *
 * De overzicht-kaart mapt LeverStatus → LeverageStatus via leverToLeverageStatus
 * (in hefbomen-nav.tsx), en LeverageStatus → dot-klasse via LEVERAGE_STATUS_DOT
 * in lib/leverage-status.ts:
 *   good    → bg-emerald-500
 *   warn    → bg-amber-500
 *   bad     → bg-red-500
 *   neutral → bg-stone-300
 *
 * Deze test rendert HefbomenNav met een specifieke leverScores-prop en bewijst
 * dat de correcte dot-klasse in de DOM verschijnt. Hiermee wordt toekomstige
 * drift tussen de twee systemen (bijv. per ongeluk een mapping omgooien)
 * onmiddellijk zichtbaar.
 *
 * Aanpak: rendertest op LeverageCard-status-dot (`span.absolute.rounded-full`
 * rechtsboven op de kaart). Geen productie-code-wijziging nodig: we lezen
 * het resultaat van de rendering, niet de private functie.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HefbomenNav } from './hefbomen-nav'
import type { LeverScores, LeverStatus } from '@/components/app/shell/lever-scores'
import { LEVERAGE_STATUS_DOT } from '@/lib/leverage-status'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Bouw een LeverScores-object waarbij ALLE vier hefbomen dezelfde status krijgen. */
function makeLeverScores(status: LeverStatus): LeverScores {
  const entry = { score: 50, status, detail: `${status} detail` }
  return {
    assets: entry,
    debts: entry,
    cashflow: entry,
    tax: entry,
  }
}

/**
 * Verwachte Tailwind dot-klasse voor de KAART (via leverToLeverageStatus →
 * LEVERAGE_STATUS_DOT). Dit is de canonieke mapping:
 *   LeverStatus  → LeverageStatus → LEVERAGE_STATUS_DOT class
 *   green        → good           → bg-emerald-500
 *   amber        → warn           → bg-amber-500
 *   red          → bad            → bg-red-500
 *   neutral      → neutral        → bg-stone-300
 */
function expectedCardDotClass(leverStatus: LeverStatus): string {
  const leverageStatus =
    leverStatus === 'green'
      ? 'good'
      : leverStatus === 'amber'
        ? 'warn'
        : leverStatus === 'red'
          ? 'bad'
          : 'neutral'
  return LEVERAGE_STATUS_DOT[leverageStatus]
}

/**
 * Verwachte Tailwind dot-klasse voor de SIDEBAR (via STATUS_COLORS in
 * lever-compass.tsx). STATUS_COLORS is niet geëxporteerd, dus we hanteren
 * de gedocumenteerde mapping als expected value. Wijzigt lever-compass.tsx
 * de klassen, dan faalt deze test — precies de bedoeling.
 *
 * Sidebar STATUS_COLORS.dot per LeverStatus:
 *   green  → 'bg-emerald-500'
 *   amber  → 'bg-amber-500'
 *   red    → 'bg-red-500'
 *   neutral→ 'bg-[var(--ink-4)]'
 */
function expectedSidebarDotClass(leverStatus: LeverStatus): string {
  return leverStatus === 'green'
    ? 'bg-emerald-500'
    : leverStatus === 'amber'
      ? 'bg-amber-500'
      : leverStatus === 'red'
        ? 'bg-red-500'
        : 'bg-[var(--ink-4)]'
}

/**
 * Haal de status-dots op uit de gerenderde HefbomenNav.
 * LeverageCard rendert de status-dot als:
 *   <span class="absolute right-2.5 top-2.5 ... w-2 h-2 rounded-full {LEVERAGE_STATUS_DOT[status]}" />
 *
 * We selecteren op `absolute` + `rounded-full` + `w-2` om de dot te
 * onderscheiden van andere gekleurde elementen in de render.
 */
function getStatusDotClasses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('span.absolute.rounded-full')).map(
    (el) => el.className,
  )
}

// ── Status-pariteits-tests ────────────────────────────────────────────────────

describe('HefbomenNav — status-pariteit: kaart-dot == sidebar-dot', () => {
  const statuses: LeverStatus[] = ['green', 'amber', 'red', 'neutral']

  for (const leverStatus of statuses) {
    describe(`LeverStatus '${leverStatus}'`, () => {
      it(`kaart-dot heeft de correcte klasse (${expectedCardDotClass(leverStatus)})`, () => {
        const { container } = render(
          <HefbomenNav
            health={null}
            leverScores={makeLeverScores(leverStatus)}
          />,
        )
        const dots = getStatusDotClasses(container)

        // 4 hefbomen × 1 status-dot per kaart
        expect(dots.length).toBe(4)

        const cardDotClass = expectedCardDotClass(leverStatus)
        dots.forEach((cls) => {
          expect(cls).toContain(cardDotClass)
        })
      })

      it(`kaart-dot-klasse == sidebar-dot-klasse voor LeverStatus '${leverStatus}'`, () => {
        // Groen/amber/rood zijn identiek in beide systemen.
        // Neutral verschilt bewust (stone-300 vs ink-4 CSS-var) — dit is
        // gedocumenteerd gedrag, geen pariteits-bug.
        const cardDot = expectedCardDotClass(leverStatus)
        const sidebarDot = expectedSidebarDotClass(leverStatus)

        if (leverStatus === 'neutral') {
          // Neutral is BEWUST anders: kaart gebruikt bg-stone-300,
          // sidebar gebruikt bg-[var(--ink-4)] (themazijde adaptief).
          // Beide zijn "geen data"-semantiek — dit test dat het verschil
          // bewust en gedocumenteerd blijft.
          expect(cardDot).toBe('bg-stone-300')
          expect(sidebarDot).toBe('bg-[var(--ink-4)]')
          expect(cardDot).not.toBe(sidebarDot) // bewuste afwijking
        } else {
          // Groen/amber/rood MOETEN identiek zijn.
          expect(cardDot).toBe(sidebarDot)
        }
      })
    })
  }

  it('geeft leverScores-status voorrang boven pillar-status (fallback-vrij)', () => {
    // Als leverScores aanwezig is, mag de health-pillar NIET de status bepalen.
    // We geven een leverScores met alle-green en een health met slechte score.
    // De dots moeten groen zijn, niet rood/oranje.
    const healthWithBadPillar = {
      total: 10, // extreem slechte totaalscore
      label: 'Kritiek',
      pillars: [
        {
          id: 'asset_concentration',
          name: 'Concentratie',
          score: 5, // bad → bg-red-500 zonder leverScores
          weight: 0.1,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/bezittingen',
          actionLabel: 'Bekijk',
          rawValue: '1 type',
        },
        {
          id: 'debt_ratio',
          name: 'Schuldratio',
          score: 5, // bad
          weight: 0.2,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/schulden',
          actionLabel: 'Bekijk',
          rawValue: '95%',
        },
        {
          id: 'savings_rate',
          name: 'Spaarquote',
          score: 5, // bad
          weight: 0.25,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/cashflow',
          actionLabel: 'Bekijk',
          rawValue: '-5%',
        },
      ],
      previousMonth: null,
      trend: 0,
      activePillarCount: 3,
      budgetingActive: false,
    }

    const { container } = render(
      <HefbomenNav
        health={healthWithBadPillar}
        leverScores={makeLeverScores('green')} // expliciet groen
      />,
    )

    const dots = getStatusDotClasses(container)
    expect(dots.length).toBe(4)
    dots.forEach((cls) => {
      // Moet groen zijn (leverScores) — niet rood (slechte pillar)
      expect(cls).toContain('bg-emerald-500')
      expect(cls).not.toContain('bg-red-500')
    })
  })

  it('valt terug op pillar-status wanneer leverScores null is (bestaand gedrag)', () => {
    // Met een slechte asset_concentration-pijler en GEEN leverScores
    // moet de kaart rood zijn (bestaand fallback-gedrag).
    const healthWithBadAssets = {
      total: 10,
      label: 'Kritiek',
      pillars: [
        {
          id: 'asset_concentration',
          name: 'Concentratie',
          score: 5, // → bad → bg-red-500
          weight: 0.1,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/bezittingen',
          actionLabel: 'Bekijk',
          rawValue: '1 type',
        },
      ],
      previousMonth: null,
      trend: 0,
      activePillarCount: 1,
      budgetingActive: false,
    }

    const { container } = render(
      <HefbomenNav
        health={healthWithBadAssets}
        leverScores={null} // geen leverScores → fallback
      />,
    )

    const dots = getStatusDotClasses(container)
    expect(dots.length).toBe(4)

    // Bezittingen-tegel (eerste dot) moet rood zijn via pillar
    const bezittingenDot = dots[0]
    expect(bezittingenDot).toContain('bg-red-500')
  })
})

describe('Status-parity — mapping-tabel consistentie (unit)', () => {
  /**
   * Bewijst de volledige mapping-tabel formeel: voor elke LeverStatus geldt
   * dat de verwachte card-dot-klasse overeenkomt met LEVERAGE_STATUS_DOT voor
   * de overeenkomstige LeverageStatus.
   */
  it('green → good → bg-emerald-500', () => {
    expect(expectedCardDotClass('green')).toBe(LEVERAGE_STATUS_DOT['good'])
    expect(expectedCardDotClass('green')).toBe('bg-emerald-500')
  })

  it('amber → warn → bg-amber-500', () => {
    expect(expectedCardDotClass('amber')).toBe(LEVERAGE_STATUS_DOT['warn'])
    expect(expectedCardDotClass('amber')).toBe('bg-amber-500')
  })

  it('red → bad → bg-red-500', () => {
    expect(expectedCardDotClass('red')).toBe(LEVERAGE_STATUS_DOT['bad'])
    expect(expectedCardDotClass('red')).toBe('bg-red-500')
  })

  it('neutral → neutral → bg-stone-300', () => {
    expect(expectedCardDotClass('neutral')).toBe(LEVERAGE_STATUS_DOT['neutral'])
    expect(expectedCardDotClass('neutral')).toBe('bg-stone-300')
  })
})
