import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BelastingOverzichtStrip } from './belasting-overzicht-strip'

describe('BelastingOverzichtStrip — render', () => {
  it('rendert drie box-tegels (1 / 2 / 3)', () => {
    render(
      <BelastingOverzichtStrip box1Tax={12000} box2Tax={null} box3Tax={3500} />,
    )
    expect(screen.getByText('Box 1')).toBeTruthy()
    expect(screen.getByText('Box 2')).toBeTruthy()
    expect(screen.getByText('Box 3')).toBeTruthy()
  })

  it('toont label per box', () => {
    render(
      <BelastingOverzichtStrip box1Tax={null} box2Tax={null} box3Tax={null} />,
    )
    expect(screen.getByText('Werk + woning')).toBeTruthy()
    expect(screen.getByText('Aanmerkelijk belang')).toBeTruthy()
    expect(screen.getByText('Sparen + beleggen')).toBeTruthy()
  })

  it('toont waarde wanneer beschikbaar', () => {
    render(
      <BelastingOverzichtStrip box1Tax={12000} box2Tax={null} box3Tax={3500} />,
    )
    expect(screen.getAllByText(/€\s*12\.000.*\/jr/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/€\s*3\.500.*\/jr/).length).toBeGreaterThan(0)
  })

  it('toont placeholder "—" bij null of 0', () => {
    render(
      <BelastingOverzichtStrip box1Tax={null} box2Tax={0} box3Tax={null} />,
    )
    expect(screen.getAllByText('—').length).toBe(3)
  })

  it('toont totale druk-stat wanneer minimaal één box > 0', () => {
    render(
      <BelastingOverzichtStrip box1Tax={12000} box2Tax={null} box3Tax={3500} />,
    )
    expect(screen.getByText('Geschatte druk')).toBeTruthy()
    expect(screen.getByText(/€\s*15\.500.*\/jr/)).toBeTruthy()
  })

  it('verbergt totale druk bij geen data', () => {
    render(
      <BelastingOverzichtStrip box1Tax={null} box2Tax={null} box3Tax={null} />,
    )
    expect(screen.queryByText('Geschatte druk')).toBeNull()
  })

  it('Box 2 toont DGA-disclaimer', () => {
    render(
      <BelastingOverzichtStrip box1Tax={12000} box2Tax={0} box3Tax={3500} />,
    )
    expect(screen.getByText(/DGA-tracking komt later/i)).toBeTruthy()
  })

  it('Box 1 disclaimer noemt "geschat"', () => {
    render(
      <BelastingOverzichtStrip box1Tax={12000} box2Tax={null} box3Tax={null} />,
    )
    expect(screen.getByText(/Geschat o.b.v. inkomen/i)).toBeTruthy()
  })
})
