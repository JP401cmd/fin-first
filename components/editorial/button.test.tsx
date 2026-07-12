import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

describe('editorial/Button', () => {
  it('primary (default): ink-bg + paper-tekst + min-h-11 (md) + scherpe hoeken', () => {
    render(<Button>Opslaan</Button>)
    const btn = screen.getByRole('button', { name: 'Opslaan' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.className).toContain('bg-[var(--ink)]')
    expect(btn.className).toContain('text-[var(--paper)]')
    expect(btn.className).toContain('hover:bg-[var(--ink-2)]')
    expect(btn.className).toContain('min-h-11')
    // Scherpe hoeken: geen enkele rounded-utility.
    expect(btn.className).not.toMatch(/(^|\s)rounded/)
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('moment: module-active-kleur (volgt route-module) + wit', () => {
    render(<Button variant="moment">Activeer</Button>)
    const btn = screen.getByRole('button', { name: 'Activeer' })
    expect(btn.className).toContain('bg-[var(--module-active-600)]')
    expect(btn.className).toContain('hover:bg-[var(--module-active-700)]')
    expect(btn.className).toContain('text-white')
  })

  it('secondary: outline in inkt', () => {
    render(<Button variant="secondary">Annuleer</Button>)
    const btn = screen.getByRole('button', { name: 'Annuleer' })
    expect(btn.className).toContain('border-2')
    expect(btn.className).toContain('border-[var(--ink)]')
    expect(btn.className).toContain('bg-[var(--paper)]')
    expect(btn.className).toContain('text-[var(--ink)]')
  })

  it('size sm → min-h-9 i.p.v. min-h-11', () => {
    render(<Button size="sm">Klein</Button>)
    const btn = screen.getByRole('button', { name: 'Klein' })
    expect(btn.className).toContain('min-h-9')
    expect(btn.className).not.toContain('min-h-11')
  })

  it('href → rendert als next/link <a> met de href en behoudt de variant-look', () => {
    render(<Button href="/toekomst/bibliotheek">Toon alles</Button>)
    const link = screen.getByRole('link', { name: 'Toon alles' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/toekomst/bibliotheek')
    expect(link.className).toContain('bg-[var(--ink)]')
  })

  it('disabled → button krijgt het disabled-attribuut', () => {
    render(<Button disabled>Opslaan</Button>)
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeDisabled()
  })

  it('press-feedback + focus-ring zitten in de base', () => {
    render(<Button>X</Button>)
    const c = screen.getByRole('button', { name: 'X' }).className
    expect(c).toContain('active:scale-[0.98]')
    expect(c).toContain('transition-[background-color,transform]')
    expect(c).toContain('focus-visible:outline-2')
  })

  it('forwardt aria-label en type=submit naar het element', () => {
    render(
      <Button type="submit" aria-label="Verzenden">
        Ok
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Verzenden' })
    expect(btn).toHaveAttribute('type', 'submit')
  })
})
