import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LabOpslaanBalk, LabIndicatieRegel } from './lab-opslaan-balk'

/**
 * De opslaan-balk (ADR 0170) vervangt de "Je draait aan je doel"-banner én de losse
 * actieknoppen in de katernkop. Deze test pint per toestand de tekst én de knoppenset:
 * juist die combinatie was voorheen over twee plekken verdeeld.
 */

function renderBalk(over: Partial<React.ComponentProps<typeof LabOpslaanBalk>> = {}) {
  const props: React.ComponentProps<typeof LabOpslaanBalk> = {
    toestand: 'rust',
    onVastleggen: vi.fn(),
    onHerstel: vi.fn(),
    onLoslaten: vi.fn(),
    onReset: vi.fn(),
    ...over,
  }
  render(<LabOpslaanBalk {...props} />)
  const knoppen = screen.queryAllByRole('button').map((b) => b.textContent)
  return { props, tekst: screen.getByTestId('lab-opslaan-balk').textContent ?? '', knoppen }
}

describe('LabOpslaanBalk — vier standen plus de nu-anker-uitzondering', () => {
  it('rust: nodigt uit om te verschuiven, zonder knoppen', () => {
    const { tekst, knoppen } = renderBalk({ toestand: 'rust' })
    expect(tekst).toContain('Verschuif een knop om een doel te maken.')
    expect(knoppen).toEqual([])
  })

  it('nieuw: "Maak dit mijn doel" + "Terug naar basis"', () => {
    const { tekst, knoppen } = renderBalk({ toestand: 'nieuw' })
    expect(tekst).toContain('Nog niet opgeslagen.')
    expect(knoppen).toEqual(['Maak dit mijn doel', 'Terug naar basis'])
  })

  it('nieuw zónder vastleg-gate: geen knop naar een leeg venster, maar de reden', () => {
    // ADR 0145 D4 — een kale stopkeuze onder een vast anker is geen doelstand; de sheet zou
    // dan 0 rijen tonen. Zeg dát in plaats van een primaire knop aan te bieden.
    const { tekst, knoppen } = renderBalk({ toestand: 'nieuw', vastleggenMogelijk: false })
    expect(tekst).toContain('een stopmoment alleen legt nog geen doel vast')
    expect(knoppen).toEqual(['Terug naar basis'])
  })

  it('opgeslagen: noemt de datum en laat alleen loslaten over', () => {
    const { tekst, knoppen } = renderBalk({ toestand: 'opgeslagen', gezetOp: '2026-09-19T10:00:00.000Z' })
    expect(tekst).toContain('Opgeslagen als je doel op 19 september.')
    expect(knoppen).toEqual(['Doel loslaten'])
  })

  it('opgeslagen zonder geldige datum: geen "Invalid Date" op het scherm', () => {
    const { tekst } = renderBalk({ toestand: 'opgeslagen', gezetOp: 'rommel' })
    expect(tekst).not.toContain('Invalid')
    expect(tekst).toContain('Nog niet opgeslagen.')
  })

  it('gewijzigd: bijwerken, herstellen én loslaten', () => {
    const { tekst, knoppen } = renderBalk({ toestand: 'gewijzigd' })
    expect(tekst).toContain('Gewijzigd ten opzichte van je doel.')
    expect(knoppen).toEqual(['Doel bijwerken', 'Herstel mijn doel', 'Doel loslaten'])
  })

  it('gewijzigd zonder bijwerk-mogelijkheid: geen primaire knop, wél de uitleg waarom', () => {
    const { tekst, knoppen } = renderBalk({ toestand: 'gewijzigd', bijwerkenMogelijk: false })
    expect(tekst).toContain('wacht tot de doorrekening klaar is')
    expect(knoppen).toEqual(['Herstel mijn doel', 'Doel loslaten'])
  })

  it('nu-anker: zegt dat er geen doel uit komt (ADR 0145 D6) en biedt alleen reset', () => {
    const { tekst, knoppen } = renderBalk({ toestand: 'nu-anker' })
    expect(tekst).toContain('daar legt het lab geen doel van vast')
    expect(knoppen).toEqual(['Terug naar basis'])
  })

  it('busy blokkeert elke knop tegen dubbelklik', () => {
    renderBalk({ toestand: 'gewijzigd', busy: true })
    for (const b of screen.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
  })

  it('is een live-regio: de stand wordt aangekondigd zonder de focus te stelen', () => {
    renderBalk({ toestand: 'nieuw' })
    const balk = screen.getByTestId('lab-opslaan-balk')
    expect(balk.getAttribute('role')).toBe('status')
    expect(balk.getAttribute('aria-live')).toBe('polite')
  })
})

describe('LabIndicatieRegel', () => {
  it('draagt de compliance-conventie: rekenuitkomst, geen advies', () => {
    render(<LabIndicatieRegel />)
    const tekst = screen.getByTestId('lab-indicatie').textContent ?? ''
    expect(tekst).toContain('Indicatie, geen advies')
    // Geen aansporing en geen belofte over stoppen (toon-invarianten van anker-copy).
    expect(tekst).not.toMatch(/je moet|je kunt stoppen/i)
  })
})
