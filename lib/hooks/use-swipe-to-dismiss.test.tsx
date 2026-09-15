import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { useRef, useState } from 'react'
import { useSwipeToDismiss } from './use-swipe-to-dismiss'

/**
 * Regressietests voor twee bevindingen uit de code-review op de
 * BottomSheet/ChatPanel-extractie (aug 2026): de hook moet zichzelf
 * beschermen tegen (1) een dubbele overlappende dismiss en (2) `enabled` dat
 * halverwege een actieve sleep uitgaat — zonder dat een consumer daar zelf
 * iets extra's voor hoeft te doen (`onDismissStart` blijft optioneel).
 */

function swipe(el: HTMLElement, fromY: number, toY: number) {
  fireEvent.touchStart(el, { touches: [{ clientY: fromY }] })
  fireEvent.touchMove(el, { touches: [{ clientY: toY }] })
  fireEvent.touchEnd(el)
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

function mockSheetHeight(px: number) {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: px })
}

afterEach(() => {
  cleanup()
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
  }
})

describe('useSwipeToDismiss — robuustheid', () => {
  it('roept onDismiss maar één keer aan bij een tweede sleep die start terwijl de eerste dismiss nog animeert', async () => {
    mockSheetHeight(800)
    const onDismiss = vi.fn()

    function Harness() {
      const sheetRef = useRef<HTMLDivElement>(null)
      const { handleSheetTouchStart } = useSwipeToDismiss({
        sheetRef,
        onDismiss,
      })
      return <div ref={sheetRef} data-testid="sheet" onTouchStart={handleSheetTouchStart} />
    }

    const { getByTestId } = render(<Harness />)
    const sheet = getByTestId('sheet')

    // Eerste sleep: ruim voorbij de 30%-drempel → start de dismiss-animatie.
    swipe(sheet, 100, 600)
    // Tweede sleep start onmiddellijk, terwijl de eerste nog bezig is.
    swipe(sheet, 100, 600)

    // Ruim langer dan de langste dismiss-duur (350ms + marge).
    await new Promise((r) => setTimeout(r, 450))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('veert de sheet terug (geen vastzittende transform) als enabled halverwege een actieve sleep uitgaat', () => {
    mockSheetHeight(800)
    const onDismiss = vi.fn()

    function ToggleHarness() {
      const [enabled, setEnabled] = useState(true)
      const sheetRef = useRef<HTMLDivElement>(null)
      const { handleSheetTouchStart } = useSwipeToDismiss({
        sheetRef,
        onDismiss,
        enabled,
      })
      return (
        <div>
          <div ref={sheetRef} data-testid="sheet" onTouchStart={handleSheetTouchStart} />
          <button data-testid="disable" onClick={() => setEnabled(false)}>uit</button>
        </div>
      )
    }

    const { getByTestId } = render(<ToggleHarness />)
    const sheet = getByTestId('sheet')

    // Korte sleep — drag is actief (60px), maar géén touchend: de vinger
    // "hangt" nog op het scherm wanneer enabled uitgaat.
    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(sheet, { touches: [{ clientY: 160 }] })
    expect(sheet.style.transform).not.toBe('')

    fireEvent.click(getByTestId('disable'))

    expect(sheet.style.transform).toBe('')
    expect(onDismiss).not.toHaveBeenCalled()
  })
})

/**
 * Regressietests voor het pull-to-refresh-lek (aug 2026). Drie eigenschappen
 * die samen de oorzaak afdekken:
 *  1. `touchmove` hangt NIET-PASSIEF aan document — via een React-prop
 *     registreert React 19 'm hard als passive en is `preventDefault()` een
 *     no-op, waardoor de browser het veeggebaar als "ververs de pagina" pakte.
 *  2. Een neerwaartse sleep annuleert het event ook echt.
 *  3. Is de beslissing "scroll", dan blijft de browser juist ongemoeid — anders
 *     zou scrollen binnen de modal breken.
 */
describe('useSwipeToDismiss — native pull-to-refresh tegenhouden', () => {
  function ContentHarness({ onDismiss }: { onDismiss: () => void }) {
    const sheetRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const { handleSheetTouchStart } = useSwipeToDismiss({ sheetRef, contentRef, onDismiss })
    return (
      <div ref={sheetRef} data-testid="sheet" onTouchStart={handleSheetTouchStart}>
        <div data-testid="header">kop</div>
        <div ref={contentRef} data-testid="content">inhoud</div>
      </div>
    )
  }

  it('registreert touchmove niet-passief (anders is preventDefault een no-op)', () => {
    mockSheetHeight(800)
    const addSpy = vi.spyOn(document, 'addEventListener')
    const { getByTestId } = render(<ContentHarness onDismiss={vi.fn()} />)

    fireEvent.touchStart(getByTestId('header'), { touches: [{ clientY: 100, clientX: 10 }] })

    const call = addSpy.mock.calls.find(([type]) => type === 'touchmove')
    expect(call).toBeDefined()
    expect(call![2]).toEqual({ passive: false })
    addSpy.mockRestore()
  })

  it('annuleert het touchmove-event tijdens een actieve sleep', () => {
    mockSheetHeight(800)
    const { getByTestId } = render(<ContentHarness onDismiss={vi.fn()} />)
    const header = getByTestId('header')

    fireEvent.touchStart(header, { touches: [{ clientY: 100, clientX: 10 }] })
    // fireEvent geeft `false` terug zodra preventDefault op een annuleerbaar
    // event is aangeroepen — dát is het bewijs dat de browser stilstaat.
    const nietGeannuleerd = fireEvent.touchMove(header, { touches: [{ clientY: 180, clientX: 10 }] })
    expect(nietGeannuleerd).toBe(false)
    fireEvent.touchEnd(header)
  })

  it('laat native scroll met rust wanneer de content niet bovenaan staat', () => {
    mockSheetHeight(800)
    const { getByTestId } = render(<ContentHarness onDismiss={vi.fn()} />)
    const content = getByTestId('content')
    Object.defineProperty(content, 'scrollTop', { configurable: true, value: 120 })

    fireEvent.touchStart(content, { touches: [{ clientY: 100, clientX: 10 }] })
    const nietGeannuleerd = fireEvent.touchMove(content, { touches: [{ clientY: 180, clientX: 10 }] })
    expect(nietGeannuleerd).toBe(true)
    fireEvent.touchEnd(content)
  })

  it('sleept ook vanaf een gebied buiten het greepje (het hele paneel is greep)', async () => {
    mockSheetHeight(800)
    const onDismiss = vi.fn()
    const { getByTestId } = render(<ContentHarness onDismiss={onDismiss} />)
    const header = getByTestId('header')

    // De header droeg vroeger geen enkele handler — precies de dode strook
    // "net onder het horizontale lijntje".
    fireEvent.touchStart(header, { touches: [{ clientY: 100, clientX: 10 }] })
    fireEvent.touchMove(header, { touches: [{ clientY: 600, clientX: 10 }] })
    fireEvent.touchEnd(header)

    await new Promise((r) => setTimeout(r, 450))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('ruimt de document-listeners op zodra het gebaar eindigt', () => {
    mockSheetHeight(800)
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { getByTestId } = render(<ContentHarness onDismiss={vi.fn()} />)
    const header = getByTestId('header')

    fireEvent.touchStart(header, { touches: [{ clientY: 100, clientX: 10 }] })
    fireEvent.touchEnd(header)

    expect(removeSpy.mock.calls.some(([type]) => type === 'touchmove')).toBe(true)
    removeSpy.mockRestore()
  })
})

/**
 * Regressietests voor B-050 (sep 2026): in de vragenlijst-, meld- en gidsmodus
 * van de chat bestaat de `contentRef` (de gespreksscroll) niet, dus gold élke
 * aanraking als greep — scrollen of een antwoord rangschikken sleepte het hele
 * paneel mee omlaag en omhoog. Norm: een scrollbaar vlak binnen het paneel
 * krijgt dezelfde scroll-vs-sleep-beslissing als de `contentRef`, en een vlak
 * met `data-sheet-gesture="none"` (sleeplijsten) start helemaal geen gebaar.
 */
describe('useSwipeToDismiss — ander scrollvlak en sleeplijsten (B-050)', () => {
  function ModusHarness({ onDismiss }: { onDismiss: () => void }) {
    const sheetRef = useRef<HTMLDivElement>(null)
    // De contentRef wijst — zoals in ChatPanel buiten de chatmodus — naar niets.
    const contentRef = useRef<HTMLDivElement>(null)
    const { handleSheetTouchStart } = useSwipeToDismiss({ sheetRef, contentRef, onDismiss })
    return (
      <div ref={sheetRef} data-testid="sheet" onTouchStart={handleSheetTouchStart}>
        <div data-testid="header">kop</div>
        <div data-testid="scrollvlak" style={{ overflowY: 'auto' }}>
          <p data-testid="scrollkind">vraag</p>
        </div>
        <ol data-testid="sleeplijst" data-sheet-gesture="none">
          <li data-testid="sleeprij">optie</li>
        </ol>
      </div>
    )
  }

  it('Given een scrollvlak buiten de contentRef dat niet bovenaan staat, When je omlaag veegt, Then scrolt het native en blijft het paneel staan', () => {
    mockSheetHeight(800)
    const { getByTestId } = render(<ModusHarness onDismiss={vi.fn()} />)
    Object.defineProperty(getByTestId('scrollvlak'), 'scrollTop', { configurable: true, value: 120 })
    const kind = getByTestId('scrollkind')

    fireEvent.touchStart(kind, { touches: [{ clientY: 100, clientX: 10 }] })
    const nietGeannuleerd = fireEvent.touchMove(kind, { touches: [{ clientY: 180, clientX: 10 }] })
    expect(nietGeannuleerd).toBe(true)
    expect(getByTestId('sheet').style.transform).toBe('')
    fireEvent.touchEnd(kind)
  })

  it('Given een scrollvlak buiten de contentRef, When je omhoog veegt, Then volgt het paneel de vinger niet', () => {
    mockSheetHeight(800)
    const { getByTestId } = render(<ModusHarness onDismiss={vi.fn()} />)
    const kind = getByTestId('scrollkind')

    fireEvent.touchStart(kind, { touches: [{ clientY: 300, clientX: 10 }] })
    fireEvent.touchMove(kind, { touches: [{ clientY: 200, clientX: 10 }] })
    expect(getByTestId('sheet').style.transform).toBe('')
    fireEvent.touchEnd(kind)
  })

  it('Given een scrollvlak buiten de contentRef dat bovenaan staat, When je ver omlaag veegt, Then sluit het paneel nog steeds', async () => {
    mockSheetHeight(800)
    const onDismiss = vi.fn()
    const { getByTestId } = render(<ModusHarness onDismiss={onDismiss} />)
    const kind = getByTestId('scrollkind')

    fireEvent.touchStart(kind, { touches: [{ clientY: 100, clientX: 10 }] })
    fireEvent.touchMove(kind, { touches: [{ clientY: 110, clientX: 10 }] })
    fireEvent.touchMove(kind, { touches: [{ clientY: 700, clientX: 10 }] })
    fireEvent.touchEnd(kind)

    await new Promise((r) => setTimeout(r, 450))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('Given een sleeplijst met data-sheet-gesture="none", When je een rij omlaag en omhoog sleept, Then beweegt het paneel niet en blijft het event van de lijst', () => {
    mockSheetHeight(800)
    const onDismiss = vi.fn()
    const { getByTestId } = render(<ModusHarness onDismiss={onDismiss} />)
    const rij = getByTestId('sleeprij')

    fireEvent.touchStart(rij, { touches: [{ clientY: 100, clientX: 10 }] })
    expect(fireEvent.touchMove(rij, { touches: [{ clientY: 300, clientX: 10 }] })).toBe(true)
    expect(getByTestId('sheet').style.transform).toBe('')
    fireEvent.touchMove(rij, { touches: [{ clientY: 20, clientX: 10 }] })
    expect(getByTestId('sheet').style.transform).toBe('')
    fireEvent.touchEnd(rij)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('Given de header buiten elk scrollvlak, When je omlaag sleept, Then blijft die gewoon greep', () => {
    mockSheetHeight(800)
    const { getByTestId } = render(<ModusHarness onDismiss={vi.fn()} />)
    const header = getByTestId('header')

    fireEvent.touchStart(header, { touches: [{ clientY: 100, clientX: 10 }] })
    fireEvent.touchMove(header, { touches: [{ clientY: 180, clientX: 10 }] })
    expect(getByTestId('sheet').style.transform).not.toBe('')
    fireEvent.touchEnd(header)
  })
})
