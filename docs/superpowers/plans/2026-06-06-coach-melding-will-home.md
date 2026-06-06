# Editorial coach-melding + één morphende Will-home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang de losse `CoachBubble` + chat-FAB door één `WillHome`-oppervlak rechtsonder: een editorial typemachine-melding (richting A) die zichzelf typt, met één Will-avatar die praat tijdens typen en luistert erna, en die morpht bubbel → melding → (klik) chat — terwijl de melding altijd zelfstandig sluitbaar blijft.

**Architecture:** Vier nieuwe units (`useTypewriter`, `useCoachSuggestion`, `CoachMelding`, `WillHome`) + twee integratie-edits (`ChatPanel` FAB verwijderen, `layout.tsx` mount wisselen). `WillHome` rendert exact één `<WillDots>` en wisselt tussen bubbel- en melding-stand met CSS-transities; de chat blijft `ChatPanel` (alleen het open-paneel), die `WillHome` via `useChatContext()` opent. Eén Will tegelijk gegarandeerd doordat `WillHome` `null` rendert zodra de chat open is. De selectie-logica in `lib/coach-suggestions.ts` blijft ongewijzigd.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind v4, `WillDots` (bestaand), Vitest + `@testing-library/react` (jsdom), `next/navigation`.

---

## Bestand-structuur

| Bestand | Soort | Verantwoordelijkheid |
|---|---|---|
| `lib/hooks/use-typewriter.ts` | nieuw | Tekst teken-voor-teken onthullen; reduced-motion → ineens. |
| `lib/hooks/use-typewriter.test.ts` | nieuw | Hook-gedrag. |
| `lib/hooks/use-coach-suggestion.ts` | nieuw | Selectie + delay + dismissed-tracking (geëxtraheerd uit `coach-bubble.tsx`). |
| `lib/hooks/use-coach-suggestion.test.ts` | nieuw | Timing + dismiss-wiring. |
| `components/app/will/coach-melding.tsx` | nieuw | Presentatie typemachine-strook (richting A). Géén eigen avatar. |
| `components/app/will/coach-melding.test.tsx` | nieuw | Render + handlers. |
| `components/app/will/will-home.tsx` | nieuw | Oppervlak-state-machine, één avatar, morph, integratie met chat-context + coach-hook. |
| `components/app/will/will-home.css` | nieuw | Morph-transities + caret-knippering. |
| `components/app/will/will-home.test.tsx` | nieuw | Bubbel↔melding, ×/CTA/auto-dismiss, klik→chat. |
| `components/app/chat/chat-panel.tsx` | wijzig | FAB-tak verwijderen (`!isOpen → null`); corner-origin entree-animatie; ongebruikte postponed-logica weg. |
| `app/(app)/layout.tsx` | wijzig | `<CoachBubble/>` vervangen door `<WillHome/>`. |
| `components/app/coach-bubble.tsx` | verwijderen | Vervangen door `WillHome` (laatste taak). |

---

## Task 1: `useTypewriter` hook

**Files:**
- Create: `lib/hooks/use-typewriter.ts`
- Test: `lib/hooks/use-typewriter.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```ts
// lib/hooks/use-typewriter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTypewriter } from './use-typewriter'

describe('useTypewriter', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('onthult tekst teken-voor-teken en wordt done', () => {
    const { result } = renderHook(() => useTypewriter('abc', { cps: 100 })) // 10ms/teken
    expect(result.current.shown).toBe('')
    expect(result.current.done).toBe(false)
    act(() => { vi.advanceTimersByTime(10) })
    expect(result.current.shown).toBe('a')
    act(() => { vi.advanceTimersByTime(20) })
    expect(result.current.shown).toBe('abc')
    expect(result.current.done).toBe(true)
  })

  it('toont alles ineens bij prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    const { result } = renderHook(() => useTypewriter('hallo'))
    expect(result.current.shown).toBe('hallo')
    expect(result.current.done).toBe(true)
  })

  it('blijft leeg zolang start=false', () => {
    const { result } = renderHook(() => useTypewriter('abc', { start: false }))
    expect(result.current.shown).toBe('')
    expect(result.current.done).toBe(false)
  })
})
```

- [ ] **Step 2: Run test → faalt**

Run: `npx vitest run lib/hooks/use-typewriter.test.ts`
Expected: FAIL ("Failed to resolve import './use-typewriter'").

- [ ] **Step 3: Implementeer de hook**

```ts
// lib/hooks/use-typewriter.ts
'use client'

import { useEffect, useRef, useState } from 'react'

const DEFAULT_CPS = 28
const PUNCT_EXTRA_MS = 90
const PUNCT = '.,—!?:;'

/**
 * Onthult `text` teken-voor-teken (typemachine). Respecteert
 * `prefers-reduced-motion` (tekst meteen volledig). Typt één keer; reset
 * wanneer `text` of `start` wijzigt. Leestekens krijgen een korte extra pauze.
 *
 * @param opts.cps tekens per seconde (default 28)
 * @param opts.start begin pas met typen wanneer true (default true)
 */
export function useTypewriter(
  text: string,
  opts: { cps?: number; start?: boolean } = {},
): { shown: string; done: boolean } {
  const { cps = DEFAULT_CPS, start = true } = opts
  const msPerChar = 1000 / cps
  const [count, setCount] = useState(0)
  const [done, setDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCount(0)
    setDone(false)
    if (!start) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced || text.length === 0) {
      setCount(text.length)
      setDone(true)
      return
    }

    let i = 0
    const step = () => {
      i += 1
      setCount(i)
      if (i >= text.length) {
        setDone(true)
        return
      }
      const prev = text[i - 1]
      const delay = msPerChar + (PUNCT.includes(prev) ? PUNCT_EXTRA_MS : 0)
      timerRef.current = setTimeout(step, delay)
    }
    timerRef.current = setTimeout(step, msPerChar)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text, start, msPerChar])

  return { shown: text.slice(0, count), done }
}
```

- [ ] **Step 4: Run test → slaagt**

Run: `npx vitest run lib/hooks/use-typewriter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-typewriter.ts lib/hooks/use-typewriter.test.ts
git commit -m "feat(will): useTypewriter hook (reduced-motion-aware)"
```

---

## Task 2: `useCoachSuggestion` hook

Extraheert selectie + delay + dismissed-tracking uit `components/app/coach-bubble.tsx` (regels 22–57, 132–181). `lib/coach-suggestions.ts` blijft ongewijzigd.

**Files:**
- Create: `lib/hooks/use-coach-suggestion.ts`
- Test: `lib/hooks/use-coach-suggestion.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```ts
// lib/hooks/use-coach-suggestion.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCoachSuggestion } from './use-coach-suggestion'
import type { CoachDataGaps } from '@/lib/coach-suggestions'

vi.mock('next/navigation', () => ({ usePathname: () => '/overzicht' }))

const fullGaps = (over: Partial<CoachDataGaps> = {}): CoachDataGaps => ({
  hasBank: true, hasAssets: true, hasBudgets: true, hasGoals: true, hasDebts: true,
  hasTransactions: true, hasHoldings: true, hasHoldingsWithIsin: true, hasFireParams: true,
  hasLifeEvents: true, ...over,
})

describe('useCoachSuggestion', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('levert na delayMs de eerste open data-gap', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ dataGaps: fullGaps({ hasBank: false }), delayMs: 1000 }),
    )
    expect(result.current.suggestion).toBeNull()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
  })

  it('dismiss bewaart de key en verbergt de suggestie', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
    act(() => { result.current.dismiss() })
    expect(result.current.suggestion).toBeNull()
    expect(localStorage.getItem('trifinity_coach_dismissed_suggestions')).toContain('gap_bank')
  })
})
```

- [ ] **Step 2: Run test → faalt**

Run: `npx vitest run lib/hooks/use-coach-suggestion.test.ts`
Expected: FAIL ("Failed to resolve import './use-coach-suggestion'").

- [ ] **Step 3: Implementeer de hook**

```ts
// lib/hooks/use-coach-suggestion.ts
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import {
  getFirstUndismissedSuggestion,
  DEFAULT_COACH_TIMING,
  type CoachSuggestion,
  type CoachDataGaps,
  type DeferredField,
  type CoachOverrides,
} from '@/lib/coach-suggestions'
import type { ModuleId } from '@/lib/module-registry'

const LEGACY_DISMISSED_KEY = 'trifinity_coach_bubble_dismissed'
const DISMISSED_SUGGESTIONS_KEY = 'trifinity_coach_dismissed_suggestions'

function getDismissedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_SUGGESTIONS_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* corrupt — start fresh */ }
  return new Set()
}

function addDismissedKey(key: string): void {
  const dismissed = getDismissedKeys()
  dismissed.add(key)
  localStorage.setItem(DISMISSED_SUGGESTIONS_KEY, JSON.stringify([...dismissed]))
}

function migrateLegacyDismissal(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_DISMISSED_KEY)
    if (legacy) { addDismissedKey('default'); localStorage.removeItem(LEGACY_DISMISSED_KEY) }
  } catch { /* ignore */ }
}

export type UseCoachSuggestionArgs = {
  dataGaps?: CoachDataGaps
  deferredFields?: DeferredField[]
  overrides?: CoachOverrides
  activeModules?: ModuleId[]
  delayMs?: number
}

export function useCoachSuggestion({
  dataGaps, deferredFields, overrides, activeModules,
  delayMs = DEFAULT_COACH_TIMING.delayMs,
}: UseCoachSuggestionArgs): { suggestion: CoachSuggestion | null; dismiss: () => void } {
  const pathname = usePathname()
  const [suggestion, setSuggestion] = useState<CoachSuggestion | null>(null)
  const dismissedThisMount = useRef(false)

  useEffect(() => {
    if (dismissedThisMount.current) return
    migrateLegacyDismissal()
    const dismissed = getDismissedKeys()
    const next = getFirstUndismissedSuggestion(
      dataGaps, pathname, dismissed, deferredFields, overrides, activeModules,
    )
    if (!next) return
    const timer = setTimeout(() => setSuggestion(next), delayMs)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, dataGaps, deferredFields, overrides, activeModules, delayMs])

  const dismiss = useCallback(() => {
    dismissedThisMount.current = true
    setSuggestion((cur) => { if (cur) addDismissedKey(cur.key); return null })
  }, [])

  return { suggestion, dismiss }
}
```

- [ ] **Step 4: Run test → slaagt**

Run: `npx vitest run lib/hooks/use-coach-suggestion.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-coach-suggestion.ts lib/hooks/use-coach-suggestion.test.ts
git commit -m "feat(will): useCoachSuggestion hook (selectie + delay + dismiss)"
```

---

## Task 3: `CoachMelding` presentatie-component (richting A)

Puur presentatie. Rendert **geen** avatar (de platen-kop laat rechts ruimte vrij; `WillHome` legt daar de enige avatar overheen). Body-klik = open chat; × en CTA stoppen propagatie zodat ze niet doorvallen naar de body-klik.

**Files:**
- Create: `components/app/will/coach-melding.tsx`
- Test: `components/app/will/coach-melding.test.tsx`

- [ ] **Step 1: Schrijf de falende test**

```tsx
// components/app/will/coach-melding.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CoachMelding } from './coach-melding'

const base = {
  headerLabel: 'Tip van Will', shown: 'Koppel je bank.', showCursor: false, done: true,
  cta: 'Bank koppelen', ctaHref: '/core/cash/connect',
}

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('CoachMelding', () => {
  it('toont label, getypte tekst en CTA wanneer done', () => {
    render(<CoachMelding {...base} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={vi.fn()} />)
    expect(screen.getByText('Tip van Will')).toBeInTheDocument()
    expect(screen.getByText('Koppel je bank.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bank koppelen/i })).toBeInTheDocument()
  })

  it('verbergt de CTA zolang niet done', () => {
    render(<CoachMelding {...base} done={false} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /Bank koppelen/i })).not.toBeInTheDocument()
  })

  it('× sluit zonder de chat te openen', () => {
    const onClose = vi.fn(); const onOpenChat = vi.fn()
    render(<CoachMelding {...base} onClose={onClose} onCtaActivate={vi.fn()} onOpenChat={onOpenChat} />)
    fireEvent.click(screen.getByRole('button', { name: /Sluiten/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenChat).not.toHaveBeenCalled()
  })

  it('klik op de body opent de chat', () => {
    const onOpenChat = vi.fn()
    render(<CoachMelding {...base} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={onOpenChat} />)
    fireEvent.click(screen.getByTestId('coach-melding-body'))
    expect(onOpenChat).toHaveBeenCalledTimes(1)
  })

  it('CTA-klik activeert CTA en opent niet de chat', () => {
    const onCtaActivate = vi.fn(); const onOpenChat = vi.fn()
    render(<CoachMelding {...base} onClose={vi.fn()} onCtaActivate={onCtaActivate} onOpenChat={onOpenChat} />)
    fireEvent.click(screen.getByRole('link', { name: /Bank koppelen/i }))
    expect(onCtaActivate).toHaveBeenCalledTimes(1)
    expect(onOpenChat).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test → faalt**

Run: `npx vitest run components/app/will/coach-melding.test.tsx`
Expected: FAIL ("Failed to resolve import './coach-melding'").

- [ ] **Step 3: Implementeer de component**

```tsx
// components/app/will/coach-melding.tsx
'use client'

import { X, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export type CoachMeldingProps = {
  headerLabel: string
  shown: string
  showCursor: boolean
  done: boolean
  cta: string
  ctaHref?: string
  onClose: () => void
  onCtaActivate: () => void
  onOpenChat: () => void
}

const CTA_CLASS =
  'mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-wil-700 underline underline-offset-4 hover:text-wil-600'

/**
 * Editorial typemachine-strook (richting A). Géén eigen avatar — WillHome legt
 * de enige Will-avatar rechtsboven in de platen-kop. Body-klik opent de chat;
 * × en CTA stoppen propagatie zodat ze niet doorvallen naar de body-klik.
 */
export function CoachMelding({
  headerLabel, shown, showCursor, done, cta, ctaHref, onClose, onCtaActivate, onOpenChat,
}: CoachMeldingProps) {
  return (
    <div
      className="relative w-80 max-w-[calc(100vw-2rem)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s2)]"
      role="complementary"
      aria-label={headerLabel}
    >
      {/* platen-kop: label links, rechts ruimte voor de avatar */}
      <div className="flex min-h-[2.25rem] items-center border-b border-[var(--border-ed)] pl-3.5 pr-12">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          {headerLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Sluiten"
        className="absolute right-2.5 top-2.5 z-10 p-1 text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* body — klikbaar oppervlak → open chat */}
      <div
        data-testid="coach-melding-body"
        onClick={onOpenChat}
        className="cursor-pointer px-3.5 py-3"
      >
        <p className="font-mono text-[12px] leading-relaxed text-[var(--ink-2)]">
          {shown}
          {showCursor && <span aria-hidden className="wh-caret">▮</span>}
        </p>
        <div className="my-2.5 border-t border-dotted border-[var(--border-md)]" />
        {done && (
          ctaHref ? (
            <Link href={ctaHref} onClick={(e) => { e.stopPropagation(); onCtaActivate() }} className={CTA_CLASS}>
              {cta}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCtaActivate() }}
              className={CTA_CLASS}
            >
              {cta}
              <ArrowRight className="h-3 w-3" />
            </button>
          )
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test → slaagt**

Run: `npx vitest run components/app/will/coach-melding.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/app/will/coach-melding.tsx components/app/will/coach-melding.test.tsx
git commit -m "feat(will): CoachMelding typemachine-strook (richting A)"
```

---

## Task 4: `WillHome` — oppervlak, één avatar, morph

`WillHome` rendert **exact één** `<WillDots>` en wisselt tussen `bubble` en `melding`. Zodra de chat open is (`isOpen`) rendert het `null` (dan toont `ChatPanel` het paneel met zijn eigen header-avatar → nooit twee Wills).

**Files:**
- Create: `components/app/will/will-home.css`
- Create: `components/app/will/will-home.tsx`
- Test: `components/app/will/will-home.test.tsx`

- [ ] **Step 1: Schrijf de CSS (morph + caret)**

```css
/* components/app/will/will-home.css */
.willhome {
  position: fixed;
  z-index: 50;
  right: 1rem;
  bottom: calc(var(--bottom-nav-height) + 1.5rem);
  right: calc(1rem + var(--chat-sidebar-width, 0px));
}
@media (min-width: 768px) {
  .willhome { bottom: 1.5rem; right: calc(1.5rem + var(--chat-sidebar-width, 0px)); }
}

/* bubbel = ronde launcher */
.wh-bubble {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  height: 3.5rem; width: 3.5rem; border-radius: 9999px;
  background: color-mix(in srgb, #fff 60%, transparent);
  backdrop-filter: blur(3px);
  box-shadow: var(--s1);
  transition: transform 160ms ease;
}
.wh-bubble:hover { transform: scale(1.05); }
.wh-bubble:active { transform: scale(0.95); }

.wh-badge {
  position: absolute; top: -0.375rem; left: -0.375rem;
  display: flex; align-items: center; justify-content: center;
  min-width: 1.5rem; height: 1.5rem; padding: 0 0.375rem;
  border-radius: 9999px; background: var(--color-wil-600);
  color: #fff; font-size: 11px; font-weight: 600;
  box-shadow: 0 1px 4px rgba(0,0,0,.2); --tw-ring: 2px;
  outline: 2px solid var(--paper);
}
.wh-privacy { position: absolute; top: -0.25rem; right: -0.25rem; }

/* melding groeit uit de hoek */
.wh-melding-face { transform-origin: bottom right; animation: wh-melding-in 280ms cubic-bezier(.2,.8,.2,1); }
@keyframes wh-melding-in { from { opacity: 0; transform: translateY(8px) scale(.94); } to { opacity: 1; transform: none; } }

/* de ENE avatar — reist tussen bubbel-midden en melding-kop */
.wh-avatar {
  position: absolute; right: 0.625rem; bottom: 0.625rem;
  pointer-events: none;
  transition: transform 320ms cubic-bezier(.2,.8,.2,1);
}
.wh-avatar--bubble { transform: translateY(0); }
.wh-avatar--melding { transform: translateY(calc(-1 * var(--wh-rise, 80px))); }

/* knipperende blok-cursor */
.wh-caret { margin-left: 1px; color: var(--ink-3); animation: wh-caret .8s step-end infinite; }
@keyframes wh-caret { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .wh-melding-face, .wh-avatar, .wh-caret { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2: Schrijf de falende test**

```tsx
// components/app/will/will-home.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WillHome } from './will-home'
import type { CoachDataGaps } from '@/lib/coach-suggestions'

const open = vi.fn()
const toggle = vi.fn()
const openWithMessage = vi.fn()
let isOpenValue = false

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ isOpen: isOpenValue, open, toggle, openWithMessage, close: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const gaps = (over: Partial<CoachDataGaps> = {}): CoachDataGaps => ({
  hasBank: true, hasAssets: true, hasBudgets: true, hasGoals: true, hasDebts: true,
  hasTransactions: true, hasHoldings: true, hasHoldingsWithIsin: true, hasFireParams: true,
  hasLifeEvents: true, ...over,
})

beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); isOpenValue = false
  open.mockReset(); toggle.mockReset(); openWithMessage.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) }))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('WillHome', () => {
  it('toont de bubbel-launcher en opent de chat bij klik', () => {
    render(<WillHome dataGaps={gaps()} delayMs={1000} />)
    const launcher = screen.getByRole('button', { name: /Open chat met Will/i })
    fireEvent.click(launcher)
    expect(toggle).toHaveBeenCalled()
  })

  it('toont de melding na delayMs met reduced-motion-tekst', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    render(<WillHome dataGaps={gaps({ hasBank: false })} delayMs={1000} autoDismissMs={999999} />)
    act(() => { vi.advanceTimersByTime(1000 + 400) }) // delay + thinking
    expect(screen.getByText(/Koppel je bank/i)).toBeInTheDocument()
  })

  it('× sluit de melding zonder de chat te openen', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    render(<WillHome dataGaps={gaps({ hasBank: false })} delayMs={0} autoDismissMs={999999} />)
    act(() => { vi.advanceTimersByTime(400) })
    fireEvent.click(screen.getByRole('button', { name: /Sluiten/i }))
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
  })

  it('rendert niets wanneer de chat open is (één Will)', () => {
    isOpenValue = true
    const { container } = render(<WillHome dataGaps={gaps()} delayMs={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 3: Run test → faalt**

Run: `npx vitest run components/app/will/will-home.test.tsx`
Expected: FAIL ("Failed to resolve import './will-home'").

- [ ] **Step 4: Implementeer `WillHome`**

```tsx
// components/app/will/will-home.tsx
'use client'

import './will-home.css'
import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { WillDots } from '@/components/app/will-dots'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { useCoachSuggestion } from '@/lib/hooks/use-coach-suggestion'
import { useTypewriter } from '@/lib/hooks/use-typewriter'
import { CoachMelding } from './coach-melding'
import {
  DEFAULT_COACH_TIMING, DEFAULT_COACH_HEADER,
  type CoachDataGaps, type DeferredField, type CoachOverrides,
} from '@/lib/coach-suggestions'
import type { ModuleId } from '@/lib/module-registry'

const THINK_MS = 400
const POSTPONED_PROMPT =
  'Ik wil opnieuw kijken naar tips die ik eerder heb uitgesteld en waarvan de wachttijd voorbij is. Begin met de belangrijkste.'

export type WillHomeProps = {
  dataGaps?: CoachDataGaps
  deferredFields?: DeferredField[]
  overrides?: CoachOverrides
  activeModules?: ModuleId[]
  delayMs?: number
  autoDismissMs?: number
  headerLabel?: string
}

export function WillHome({
  dataGaps, deferredFields, overrides, activeModules,
  delayMs = DEFAULT_COACH_TIMING.delayMs,
  autoDismissMs = DEFAULT_COACH_TIMING.autoDismissMs,
  headerLabel = DEFAULT_COACH_HEADER,
}: WillHomeProps) {
  const { isOpen, toggle, open, openWithMessage } = useChatContext()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { suggestion, dismiss } = useCoachSuggestion({ dataGaps, deferredFields, overrides, activeModules, delayMs })

  const mode: 'bubble' | 'melding' = suggestion ? 'melding' : 'bubble'

  // "denken"-beat vóór het typen
  const [thinking, setThinking] = useState(false)
  useEffect(() => {
    if (mode !== 'melding') { setThinking(false); return }
    setThinking(true)
    const t = setTimeout(() => setThinking(false), THINK_MS)
    return () => clearTimeout(t)
  }, [mode, suggestion?.key])

  const { shown, done } = useTypewriter(suggestion?.message ?? '', { start: mode === 'melding' && !thinking })

  // auto-dismiss zolang de melding zichtbaar is
  useEffect(() => {
    if (mode !== 'melding') return
    const t = setTimeout(() => dismiss(), autoDismissMs)
    return () => clearTimeout(t)
  }, [mode, suggestion?.key, autoDismissMs, dismiss])

  // meet de strookhoogte → hoe ver de avatar "omhoog reist"
  const strookRef = useRef<HTMLDivElement>(null)
  const [rise, setRise] = useState(80)
  useLayoutEffect(() => {
    if (mode === 'melding' && strookRef.current) {
      setRise(Math.max(0, strookRef.current.offsetHeight - 30))
    }
  }, [mode, suggestion?.key, shown, done])

  // postponed-ready badge (verplaatst van de chat-FAB)
  const [postponedReady, setPostponedReady] = useState(0)
  const fetchPostponedReady = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/recommendations/postponed-ready', { cache: 'no-store' })
      if (!res.ok) return
      const { count } = (await res.json()) as { count: number }
      setPostponedReady(count)
    } catch { /* informatief — stil falen */ }
  }, [])
  useEffect(() => { void fetchPostponedReady() }, [fetchPostponedReady])
  useEffect(() => { if (!isOpen) void fetchPostponedReady() }, [isOpen, fetchPostponedReady])

  const willState = mode === 'bubble' ? 'idle' : thinking ? 'thinking' : done ? 'listening' : 'talking'

  const handleBubbleClick = useCallback(() => {
    if (postponedReady > 0) openWithMessage(POSTPONED_PROMPT)
    else toggle()
  }, [postponedReady, openWithMessage, toggle])

  const handleCta = useCallback(() => {
    dismiss()
    const params = new URLSearchParams(searchParams.toString())
    params.delete('welcome')
    const qs = params.toString()
    router.replace(pathname + (qs ? `?${qs}` : ''), { scroll: false })
  }, [dismiss, searchParams, router, pathname])

  const handleOpenChatFromMelding = useCallback(() => {
    dismiss()
    open()
  }, [dismiss, open])

  // Eén Will: zodra de chat open is toont ChatPanel het paneel (incl. avatar).
  if (isOpen) return null

  const fabAria = postponedReady > 0
    ? `Open chat met Will — ${postponedReady} uitgestelde tip${postponedReady === 1 ? '' : 's'} klaar`
    : 'Open chat met Will'

  return (
    <div className={`willhome willhome--${mode}`} style={{ ['--wh-rise' as string]: `${rise}px` }}>
      {mode === 'melding' && suggestion ? (
        <div ref={strookRef} className="wh-melding-face">
          <CoachMelding
            headerLabel={headerLabel}
            shown={shown}
            showCursor={!done}
            done={done}
            cta={suggestion.cta}
            ctaHref={suggestion.ctaHref}
            onClose={dismiss}
            onCtaActivate={handleCta}
            onOpenChat={handleOpenChatFromMelding}
          />
        </div>
      ) : (
        <button type="button" onClick={handleBubbleClick} className="wh-bubble" aria-label={fabAria}>
          {postponedReady > 0 && (
            <span className="wh-badge" aria-hidden>{postponedReady > 9 ? '9+' : postponedReady}</span>
          )}
        </button>
      )}

      {/* de ENE Will-avatar — altijd één DOM-knoop, reist via transform */}
      <div className={`wh-avatar wh-avatar--${mode}`} aria-hidden>
        <WillDots size={36} state={willState} />
      </div>

      {mode === 'bubble' && <AiPrivacyIndicator size={12} className="wh-privacy" />}
    </div>
  )
}
```

- [ ] **Step 5: Run test → slaagt**

Run: `npx vitest run components/app/will/will-home.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add components/app/will/will-home.tsx components/app/will/will-home.css components/app/will/will-home.test.tsx
git commit -m "feat(will): WillHome oppervlak met morph + één avatar"
```

---

## Task 5: Integratie — FAB uit ChatPanel, entree-animatie, layout-mount

- [ ] **Step 1: Verwijder de FAB-tak uit `ChatPanel`**

In `components/app/chat/chat-panel.tsx`, vervang het volledige `if (!isOpen) { ... }`-blok (regels 821–858, vanaf `const hasPostponedReady` t/m de afsluitende `}` van de `if (!isOpen)`) door:

```tsx
  // De launcher (FAB) leeft nu in WillHome — die toont de bubbel én opent de chat.
  // Wanneer de chat gesloten is, rendert ChatPanel niets.
  if (!isOpen) return null
```

- [ ] **Step 2: Verwijder de nu-ongebruikte postponed-logica uit `ChatPanel`**

Verwijder in `components/app/chat/chat-panel.tsx`:
- de state `const [postponedReady, setPostponedReady] = useState(0)` (regel 422);
- de hele `fetchPostponedReady`-`useCallback` + de twee `useEffect`s die `postponedReady` zetten (regels 596–620).

(Deze voedden alleen de FAB-badge, die naar `WillHome` is verhuisd.)

- [ ] **Step 3: Geef het floating-paneel een corner-origin entree**

In `components/app/chat/chat-panel.tsx`, in de `panelClasses` voor de **niet-pinned** tak (regel 863), voeg toe aan het einde van de class-string:

```
 origin-bottom-right motion-safe:animate-[wh-melding-in_280ms_cubic-bezier(.2,.8,.2,1)]
```

zodat het paneel "uit de hoek groeit" (hergebruikt de `wh-melding-in`-keyframe uit `will-home.css`; importeer die animatie door bovenaan `chat-panel.tsx` toe te voegen: `import '@/components/app/will/will-home.css'`).

- [ ] **Step 4: Wissel de mount in `layout.tsx`**

In `app/(app)/layout.tsx`:
- vervang regel 33 `import { CoachBubble } from '@/components/app/coach-bubble'` door
  `import { WillHome } from '@/components/app/will/will-home'`;
- vervang het `<CoachBubble .../>`-blok (regels 461–471) door:

```tsx
                      <Suspense fallback={null}>
                        <WillHome
                          dataGaps={coachDataGaps}
                          deferredFields={coachDeferredFields}
                          overrides={coachConfig.rules}
                          activeModules={activeModules}
                          delayMs={coachConfig.timing.delayMs}
                          autoDismissMs={coachConfig.timing.autoDismissMs}
                          headerLabel={coachConfig.headerLabel}
                        />
                      </Suspense>
```

- [ ] **Step 5: Typecheck + chat/coach-regressie**

Run: `npx tsc --noEmit`
Expected: geen errors.

Run: `npx vitest run components/app/will components/overview/tips-lijst.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/app/chat/chat-panel.tsx app/(app)/layout.tsx
git commit -m "feat(will): WillHome vervangt CoachBubble + chat-FAB in layout"
```

---

## Task 6: Polish, opruimen & verificatie

- [ ] **Step 1: Verwijder de oude `CoachBubble`**

```bash
git rm components/app/coach-bubble.tsx
```

- [ ] **Step 2: Controleer dat niets de component nog importeert**

Run: `npx tsc --noEmit`
Expected: geen errors (de enige importer — `layout.tsx` — is in Task 5 omgezet). Los eventuele resterende verwijzingen op door ze naar `@/lib/coach-suggestions` (types) of `@/components/app/will/will-home` te wijzen.

- [ ] **Step 3: Voeg een melding-exit + mobiele full-screen-chat-controle toe**

In `components/app/will/will-home.css`, voeg een korte fade toe voor de bubbel-terugkeer en borg reduced-motion (al aanwezig). Verifieer handmatig op mobiel dat de bubbel boven de bottom-nav staat (`bottom: calc(var(--bottom-nav-height)+1.5rem)`) en dat de chat full-screen opent (ongewijzigd `ChatPanel`-gedrag).

- [ ] **Step 4: Volledige test-run + lint**

Run: `npx vitest run`
Expected: PASS (incl. bestaande `lib/coach-suggestions.test.ts` en chat-suites).

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 5: Handmatige checklist (dev server)**

Run: `npm run dev` en controleer:
- bubbel rechtsonder met Will (idle); klik → chat opent "uit de hoek".
- op een pagina met een open data-gap (bv. zonder bank): na ~1,5s groeit de melding; tekst typt zichzelf; Will praat → luistert; CTA verschijnt ná het typen.
- × / CTA / 45s-timeout → terug naar bubbel, géén chat.
- klik op de melding-body → chat opent.
- nooit twee Wills tegelijk.
- `prefers-reduced-motion` aan → tekst ineens, geen morph-animaties.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(will): verwijder oude CoachBubble + polish WillHome"
```

---

## Self-Review (uitgevoerd)

- **Spec-dekking:** richting-A-melding → Task 3; zelf-typen → Task 1+gebruik in Task 4; Will-staten thinking/talking/listening → Task 4 (`willState`); één morphende home bubbel→melding→chat → Task 4 (morph) + Task 5 (chat-entree/handoff); zelfstandig sluitbaar (×/CTA/timeout, niet-dwingend) → Task 3+4 (`onClose`/`handleCta`/auto-dismiss); één Will → Task 4 (`isOpen → null`, één avatar). Coach-config/timing/overrides → ongewijzigd doorgegeven in Task 5. Reduced-motion/a11y/mobiel → Task 1/4/6.
- **Placeholders:** geen TBD/“handle errors”; alle stappen bevatten echte code/commando’s.
- **Type-consistentie:** `useTypewriter → {shown,done}`, `useCoachSuggestion → {suggestion,dismiss}`, `CoachMelding`-props en `WillHome`-props consistent gebruikt over taken.

## Bewust uitgesteld (future)

- Letterlijke één-DOM-container morph van melding → chatvenster (nu een gecoördineerde handoff met corner-origin entree). Volgende iteratie kan `ChatContent` uit `ChatPanel` lichten en in het `WillHome`-oppervlak hosten.
- Pin-modus: chat in zijdebalk snapt (geen morph) — ongewijzigd.
