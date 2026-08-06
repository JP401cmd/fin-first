import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import archData from '@/docs/architecture/architecture.json'
import { selectClaudeTeam } from '@/lib/architecture/facts'
import { buildDevelopmentModel } from '@/lib/architecture/development-model'
import { DevelopmentShell } from './development-shell'

// Rendert met het ÉCHTE model (gecureerd op de echte JSON-feiten), zodat de
// smoke-test ook drift in de snapshot zou opvangen.
const model = buildDevelopmentModel(selectClaudeTeam(archData))

function renderShell() {
  window.history.replaceState(null, '', '/beheer/development')
  return render(<DevelopmentShell model={model} />)
}

describe('DevelopmentShell — view-switcher', () => {
  it('toont twee tabs met Skills als default', () => {
    renderShell()
    expect(screen.getByRole('tab', { name: /Skills/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Ons team/ })).toHaveAttribute('aria-selected', 'false')
    // Skills-view default: een pijplijn-kop is zichtbaar.
    expect(screen.getByRole('heading', { name: /^Pijplijnen$/ })).toBeInTheDocument()
  })

  it('toont de gescande counts', () => {
    renderShell()
    expect(model.counts.agents).toBeGreaterThan(0)
    expect(model.counts.skills).toBeGreaterThan(0)
    // De counts-regel bevat skills · pijplijnen / agents als één paragraaf.
    const line = screen.getByText(
      (_, node) =>
        node?.tagName === 'P' &&
        /skills/i.test(node.textContent ?? '') &&
        /pijplijnen/i.test(node.textContent ?? '') &&
        /agents/i.test(node.textContent ?? ''),
    )
    // Assert op de tekst mét label: losse getByText(String(count))-queries
    // worden dubbelzinnig zodra twee counts toevallig gelijk zijn (bv. 19
    // agents én 19 skills).
    const text = (line.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain(`${model.counts.skills} skills`)
    expect(text).toContain(`${model.counts.pijplijnen} pijplijnen`)
    expect(text).toContain(`${model.counts.agents} agents`)
  })

  it('klik op "Ons team" toont de teamgroepen', () => {
    renderShell()
    fireEvent.click(screen.getByRole('tab', { name: /Ons team/ }))
    expect(screen.getByRole('tab', { name: /Ons team/ })).toHaveAttribute('aria-selected', 'true')
    expect(window.location.search).toContain('view=agents')

    // Minstens één gecureerde teamgroep-kop is zichtbaar.
    const groupLabels = model.groups.filter((g) => g.agents.length > 0).map((g) => g.label)
    expect(groupLabels.length).toBeGreaterThan(0)
    for (const label of groupLabels) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    }
  })

  it('?view=agents opent direct het team', () => {
    window.history.replaceState(null, '', '/beheer/development?view=agents')
    render(<DevelopmentShell model={model} />)
    expect(screen.getByRole('tab', { name: /Ons team/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('rendert een pijplijn-kaart met genummerde stappen en agent-chips', () => {
    renderShell()
    const pijplijn = model.skills.find((s) => s.kind === 'pijplijn' && s.steps.length > 0)
    expect(pijplijn).toBeDefined()
    if (!pijplijn) return
    const card = screen.getByRole('heading', { name: pijplijn.name }).closest('article')
    expect(card).not.toBeNull()
    const scoped = within(card as HTMLElement)
    // Eerste stapnummer + titel zichtbaar.
    expect(scoped.getByText(String(pijplijn.steps[0].index))).toBeInTheDocument()
    expect(scoped.getByText(pijplijn.steps[0].title)).toBeInTheDocument()
  })
})
