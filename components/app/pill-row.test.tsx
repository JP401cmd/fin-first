/**
 * Component-tests voor `PillRow` — de rij bedieningspillen die nooit op twee
 * regels mag vallen.
 *
 * De belofte heeft twee helften die elkaar aanvullen:
 *  1. `flex-nowrap` maakt wrappen structureel onmogelijk — geldt óók als de
 *     meting nooit draait (SSR, geen ResizeObserver).
 *  2. De meting laat álle labels vallen zodra de rij mét labels breder is dan de
 *     beschikbare ruimte.
 *
 * jsdom doet geen layout en past de CSS uit `app/globals.css` niet toe. We
 * mocken daarom `getBoundingClientRect` en modelleren de enige regel die telt:
 * de inhoud is breder mét labels dan zonder. Zo is de compact-stand van de rij
 * echt een gevolg van de gemeten breedte, niet van een vaste testwaarde.
 *
 * Het daadwerkelijk verbergen van de labels is CSS
 * (`[data-pill-row][data-compact='true'] [data-pill-label]`). Deze tests leggen
 * het contract vast waar die regel op aangrijpt.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PillRow } from './pill-row'

// ── Layout-mock ─────────────────────────────────────────────────────────────

/** Beschikbare rijbreedte + de inhoudsbreedte in beide standen. */
let layout = { rowWidth: 500, withLabels: 300, iconsOnly: 200 }

let originalRect: PropertyDescriptor | undefined

function rect(left: number, right: number): DOMRect {
  const width = right - left
  return {
    left, right, width, top: 0, bottom: width > 0 ? 10 : 0,
    height: width > 0 ? 10 : 0, x: left, y: 0, toJSON: () => ({}),
  } as DOMRect
}

// Installeren in beforeEach, niet op module-niveau: `getBoundingClientRect` op
// Element.prototype overschrijven tijdens de import-fase van het testbestand
// breekt de gedeelde setup (test/setup.ts).
beforeEach(() => {
  layout = { rowWidth: 500, withLabels: 300, iconsOnly: 200 }
  originalRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Element): DOMRect {
      if (this.hasAttribute('data-pill-row')) return rect(0, layout.rowWidth)

      const row = this.parentElement
      if (row?.hasAttribute('data-pill-row')) {
        const kids = Array.from(row.children)
        // Alleen het laatste kind draagt de rechterrand van de inhoud; de rest
        // ligt er per definitie links van.
        if (kids[kids.length - 1] !== this) return rect(0, 1)
        // De kern van het model: mét labels is de rij breder dan zonder.
        // `measure` zet de rij vóór het meten zelf even op labels-aan, dus dit
        // pad levert de NATUURLIJKE breedte — precies wat het besluit stuurt.
        const compact = row.getAttribute('data-compact') === 'true'
        return rect(0, compact ? layout.iconsOnly : layout.withLabels)
      }
      return rect(0, 0)
    },
  })
})

afterEach(() => {
  cleanup()
  if (originalRect) {
    Object.defineProperty(Element.prototype, 'getBoundingClientRect', originalRect)
  }
})

/**
 * Pillenset met een variabel aantal knoppen, maar ALTIJD twee React-children —
 * net als de echte callsite, waar `{voorwaarde && <>…</>}` één slot blijft of de
 * voorwaarde nu waar is of niet.
 */
function Pills({ extra = false }: { extra?: boolean }) {
  return (
    <PillRow ariaLabel="Grafiek-opties">
      {extra && (
        <>
          <button type="button" title="Doorgaan">
            <span data-pill-label>Doorgaan</span>
          </button>
          <button type="button" title="Stop op AOW">
            <span data-pill-label>Stop op AOW</span>
          </button>
        </>
      )}
      <button type="button" title="Levensgebeurtenissen">
        <span data-pill-label>Levensgebeurtenissen</span>
      </button>
    </PillRow>
  )
}

const row = (c: HTMLElement) => c.querySelector('[data-pill-row]')!

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PillRow', () => {
  it('kan structureel niet wrappen: de rij staat altijd op flex-nowrap', () => {
    const { container } = render(<Pills />)
    // Onafhankelijk van de meting — dit is de garantie die overeind blijft als
    // de meting nooit draait.
    expect(row(container).className).toContain('flex-nowrap')
  })

  it('is geen scroll-container, zodat popovers ín de rij niet geknipt worden', () => {
    // `overflow-x: auto` laat `overflow-y` meecomputeren naar `auto` (CSS
    // Overflow L3): de ~30px hoge rij wordt dan in béíde richtingen een clipbox
    // en de scenario-picker + ChartTips-popover verdwijnen tot een sliver.
    expect(row(render(<Pills />).container).className).not.toContain('overflow')
  })

  it('houdt de labels wanneer de rij mét labels op één regel past', () => {
    layout = { rowWidth: 500, withLabels: 300, iconsOnly: 200 }
    const { container } = render(<Pills />)
    expect(row(container).getAttribute('data-compact')).toBe('false')
  })

  it('laat de labels vallen zodra de rij mét labels breder is dan de ruimte', () => {
    layout = { rowWidth: 500, withLabels: 900, iconsOnly: 400 }
    const { container } = render(<Pills />)
    expect(row(container).getAttribute('data-compact')).toBe('true')
  })

  it('negeert een verschil van één pixel (sub-pixel-afronding bij zoom)', () => {
    layout = { rowWidth: 500, withLabels: 501, iconsOnly: 400 }
    const { container } = render(<Pills />)
    expect(row(container).getAttribute('data-compact')).toBe('false')
  })

  // ── De regressie die de eerste versie liet passeren ───────────────────────
  //
  // De meting hing eerst aan `Children.count`. Dat getal verandert op de echte
  // callsite NOOIT — `{voorwaarde && <>…vier knoppen…</>}` is één slot, waar of
  // niet. De rij her-mat daardoor niet bij een modus-wissel, en niet als een pil
  // een telbadge of percentage kreeg. Deze twee tests rijden die overgang.

  it('meet opnieuw als de inhoud breder wordt zonder dat het aantal React-children verandert', () => {
    layout = { rowWidth: 500, withLabels: 300, iconsOnly: 200 }
    const { container, rerender } = render(<Pills />)
    expect(row(container).getAttribute('data-compact')).toBe('false')

    // Pillen erbij (zelfde aantal slots) én een bredere inhoud — bv. de
    // Marktcheck-pil die er een percentage bij krijgt.
    layout = { rowWidth: 500, withLabels: 900, iconsOnly: 400 }
    rerender(<Pills extra />)
    expect(row(container).getAttribute('data-compact')).toBe('true')
  })

  it('geeft de labels terug als de inhoud weer past', () => {
    layout = { rowWidth: 500, withLabels: 900, iconsOnly: 400 }
    const { container, rerender } = render(<Pills extra />)
    expect(row(container).getAttribute('data-compact')).toBe('true')

    // Wissel naar een modus waarin pillen verdwijnen: de labels horen terug.
    layout = { rowWidth: 500, withLabels: 300, iconsOnly: 200 }
    rerender(<Pills />)
    expect(row(container).getAttribute('data-compact')).toBe('false')
  })

  // ── Derde stand: tight ────────────────────────────────────────────────────
  //
  // Op smal mobiel scherm zijn de labels sowieso al weg (`hidden sm:inline`),
  // maar kan zelfs de iconen-only-rij breder zijn dan het scherm. Dan zet de
  // rij `data-tight="true"` en vallen ook de databadges weg (CSS-regel op
  // `data-pill-badge` in app/globals.css).

  it('blijft uit tight zolang de iconen-only-stand past', () => {
    layout = { rowWidth: 500, withLabels: 900, iconsOnly: 400 }
    const { container } = render(<Pills />)
    expect(row(container).getAttribute('data-compact')).toBe('true')
    expect(row(container).getAttribute('data-tight')).toBe('false')
  })

  it('gaat naar tight zodra zelfs de iconen-only-rij niet past', () => {
    layout = { rowWidth: 300, withLabels: 900, iconsOnly: 400 }
    const { container } = render(<Pills extra />)
    expect(row(container).getAttribute('data-compact')).toBe('true')
    expect(row(container).getAttribute('data-tight')).toBe('true')
  })

  it('verlaat tight weer als de inhoud smaller wordt', () => {
    layout = { rowWidth: 300, withLabels: 900, iconsOnly: 400 }
    const { container, rerender } = render(<Pills extra />)
    expect(row(container).getAttribute('data-tight')).toBe('true')

    layout = { rowWidth: 300, withLabels: 900, iconsOnly: 250 }
    rerender(<Pills />)
    expect(row(container).getAttribute('data-compact')).toBe('true')
    expect(row(container).getAttribute('data-tight')).toBe('false')
  })

  it('draagt het CSS-aangrijpingspunt: data-pill-row op de rij, data-pill-label op elk label', () => {
    const { container } = render(<Pills extra />)
    expect(row(container).hasAttribute('data-pill-row')).toBe(true)
    expect(container.querySelectorAll('[data-pill-label]').length).toBe(3)
  })
})
