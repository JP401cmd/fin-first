import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WillCoachFAB } from './will-coach-fab'

describe('WillCoachFAB — render', () => {
  it('rendert FAB met aria-label', () => {
    render(<WillCoachFAB />)
    const fab = screen.getByLabelText('Vraag Will (coach-chat)')
    expect(fab).toBeTruthy()
  })

  it('FAB is fixed gepositioneerd', () => {
    const { container } = render(<WillCoachFAB />)
    const fab = container.querySelector('button')
    expect(fab?.className).toContain('fixed')
  })

  it('FAB heeft print-hidden class', () => {
    const { container } = render(<WillCoachFAB />)
    expect(container.querySelector('.print\\:hidden')).toBeTruthy()
  })

  it('dialog is default gesloten', () => {
    render(<WillCoachFAB />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('WillCoachFAB — dialog-flow', () => {
  it('opent dialog bij FAB-klik', () => {
    render(<WillCoachFAB />)
    fireEvent.click(screen.getByLabelText('Vraag Will (coach-chat)'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('toont "Hoe kan ik helpen?" en Will-badge', () => {
    render(<WillCoachFAB />)
    fireEvent.click(screen.getByLabelText('Vraag Will (coach-chat)'))
    expect(screen.getByText('Hoe kan ik helpen?')).toBeTruthy()
    // Will-badge initial "W"
    expect(screen.getByText('W')).toBeTruthy()
  })

  it('toont placeholder-uitleg + drie deeplinks', () => {
    const { container } = render(<WillCoachFAB />)
    fireEvent.click(screen.getByLabelText('Vraag Will (coach-chat)'))
    expect(screen.getByText(/chat-.*flow is in ontwikkeling/i)).toBeTruthy()
    expect(container.querySelector('a[href="/overzicht"]')).toBeTruthy()
    expect(container.querySelector('a[href="/toekomst"]')).toBeTruthy()
    expect(container.querySelector('a[href="/will"]')).toBeTruthy()
  })

  it('sluit dialog bij X-knop', () => {
    render(<WillCoachFAB />)
    fireEvent.click(screen.getByLabelText('Vraag Will (coach-chat)'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
