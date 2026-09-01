import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MijlpalenTijdlijn } from './mijlpalen-tijdlijn'
import { buildMilestoneTimeline, type MilestoneGoalRef } from '@/lib/milestones/timeline'
import { buildMilestoneCopy } from '@/lib/milestones/copy'
import type { AchievedMilestoneRow } from '@/lib/milestones/types'
import { formatCurrency } from '@/lib/format'

/**
 * De tijdlijn wordt bewust gevoed via `buildMilestoneTimeline` en niet via
 * met de hand geschreven props: zo pint elke assertie de GERENDERDE tekst
 * tegen de canonieke `buildMilestoneCopy`-uitvoer voor dezelfde rij. Een
 * weergave-drift (verkeerd veld, eigen zin, verkeerde grondslag) valt daarmee
 * om, in plaats van dat de test alleen "er staat iets" bewijst.
 */

const USER = 'user-1'

function row(over: Partial<AchievedMilestoneRow> = {}): AchievedMilestoneRow {
  return {
    id: over.milestone_key ?? 'id-1',
    user_id: USER,
    milestone_key: 'vermogen-100k',
    kind: 'vermogen',
    threshold_value: 100_000,
    observed_value: 103_412,
    achieved_at: '2026-03-12T12:00:00.000Z',
    acknowledged_at: null,
    source: 'detect',
    ...over,
  }
}

function renderTijdlijn(
  rows: AchievedMilestoneRow[],
  goals: MilestoneGoalRef[] = [],
) {
  return render(
    <MijlpalenTijdlijn years={buildMilestoneTimeline(rows, goals, USER, null)} />,
  )
}

afterEach(cleanup)

describe('MijlpalenTijdlijn — bereikte mijlpalen', () => {
  it('rendert per rij de canonieke titel plus de datum, gegroepeerd per jaar', () => {
    const vermogen = row({ achieved_at: '2026-03-12T12:00:00.000Z' })
    const vrijheid = row({
      milestone_key: 'vrijheid-50',
      kind: 'vrijheid',
      threshold_value: 50,
      observed_value: 51.2,
      achieved_at: '2024-11-04T12:00:00.000Z',
    })
    const { container } = renderTijdlijn([vermogen, vrijheid])

    // Jaargroepen: h3 onder de sectie-h2, nieuwste jaar eerst.
    const jaren = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(jaren).toEqual(['2026', '2024'])

    // Titels komen letterlijk uit de canonieke copy. Het bedrag in de
    // vermogens-titel is een los <MaskedAmount>-knooppunt, dus meten we op de
    // samengestelde tekst en niet met getByText.
    const tekst = container.textContent ?? ''
    expect(tekst).toContain(buildMilestoneCopy(vermogen, null).titel.split(' bereikt')[0])
    expect(tekst).toContain(formatCurrency(100_000))
    expect(tekst).toContain(buildMilestoneCopy(vrijheid, null).titel)
    expect(tekst).toContain(buildMilestoneCopy(vrijheid, null).betekenis)

    // Datums in nl-NL, zonder jaartal binnen een jaargroep (de kop draagt dat).
    expect(tekst).toContain('12 maart')
    expect(tekst).toContain('4 november')
  })

  it('zegt "omstreeks" bij een geseede rij — de datering is een benadering', () => {
    const { container } = renderTijdlijn([
      row({ source: 'seed', achieved_at: '2023-06-09T12:00:00.000Z' }),
    ])
    expect(container.textContent).toContain('omstreeks 9 juni')
  })

  it('zet géén "omstreeks" bij een live waargenomen rij', () => {
    const { container } = renderTijdlijn([row({ source: 'detect' })])
    expect(container.textContent).not.toContain('omstreeks')
    expect(container.textContent).toContain('12 maart')
  })

  it('draagt de doelnaam in de rij van een behaald doel', () => {
    const { container } = renderTijdlijn(
      [
        row({
          milestone_key: 'doel-behaald:g1',
          kind: 'doel',
          threshold_value: null,
          observed_value: null,
        }),
      ],
      [{ id: 'g1', name: 'Nieuwe keuken', user_id: USER }],
    )
    expect(container.textContent).toContain('Nieuwe keuken')
  })

  it('rendert een checkpoint compact: titel wel, betekenis-zin niet', () => {
    const checkpoint = row({
      milestone_key: 'doel-checkpoint:g1:50',
      kind: 'doel',
      threshold_value: 50,
      observed_value: 52,
    })
    const goals = [{ id: 'g1', name: 'Nieuwe keuken', user_id: USER }]
    const { container } = renderTijdlijn([checkpoint], goals)

    const copy = buildMilestoneCopy(checkpoint, null, { goalName: 'Nieuwe keuken' })
    expect(container.textContent).toContain(copy.titel)
    expect(container.textContent).not.toContain(copy.betekenis)
  })

  it('houdt de koppenhiërarchie: geen h1, aanhef en sectie op h2', () => {
    renderTijdlijn([row()])
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(h2s[0]).toBe('Dit heb je bereikt')
    expect(h2s).toContain('Bereikt')
  })

  it('wijst vooruit naar /toekomst voor de mijlpalen die nog komen', () => {
    renderTijdlijn([row()])
    const link = screen.getByRole('link', { name: 'Toekomst' })
    expect(link.getAttribute('href')).toBe('/toekomst')
  })
})

describe('MijlpalenTijdlijn — lege staat', () => {
  it('legt uit dat mijlpalen hier verschijnen en wijst naar het overzicht', () => {
    const { container } = renderTijdlijn([])

    expect(container.textContent).toContain(
      'Je eerste mijlpaal staat hier zodra je er een passeert',
    )
    const cta = screen.getByRole('link', { name: 'Bekijk je overzicht' })
    expect(cta.getAttribute('href')).toBe('/overzicht')

    // Geen tijdlijn en geen vooruitblik-noot zolang er niets te tonen is.
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Toekomst' })).toBeNull()
  })

  it('houdt ook leeg de pagina-aanhef overeind', () => {
    renderTijdlijn([])
    const aanhef = screen.getAllByRole('heading', { level: 2 })[0]
    expect(within(aanhef).getByText('bereikt').tagName).toBe('EM')
  })
})

describe('MijlpalenTijdlijn — toon', () => {
  it('bevat geen emoji, in geen enkele soort rij', () => {
    const { container } = renderTijdlijn(
      [
        row({ milestone_key: 'vermogen-100k', achieved_at: '2026-03-12T12:00:00.000Z' }),
        row({
          milestone_key: 'vrijheid-100',
          kind: 'vrijheid',
          threshold_value: 100,
          observed_value: 100,
          achieved_at: '2026-02-02T12:00:00.000Z',
        }),
        row({
          milestone_key: 'schuldenvrij',
          kind: 'schuldenvrij',
          threshold_value: 0,
          observed_value: 0,
          achieved_at: '2025-05-05T12:00:00.000Z',
        }),
        row({
          milestone_key: 'noodfonds-gevuld',
          kind: 'noodfonds',
          threshold_value: 6,
          observed_value: 6.4,
          achieved_at: '2025-04-04T12:00:00.000Z',
          source: 'seed',
        }),
        row({
          milestone_key: 'doel-checkpoint:g1:75',
          kind: 'doel',
          threshold_value: 75,
          observed_value: 76,
          achieved_at: '2025-03-03T12:00:00.000Z',
        }),
      ],
      [{ id: 'g1', name: 'Nieuwe keuken', user_id: USER }],
    )

    // `lib/freedom-milestones.ts` draagt nog 🎉/✓-teksten uit een eerdere
    // generatie; die mogen hier nooit binnenlekken.
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
