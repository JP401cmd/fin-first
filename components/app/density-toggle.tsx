'use client'

import { useCallback, useEffect, useState } from 'react'
import { Rows2, Rows3 } from 'lucide-react'

/**
 * Gedeelde ruim/compact-dichtheidsschakelaar voor lange transactielijsten
 * (M-08, besluit 15 uit docs/ux-review-jul2026.md). Eén patroon, hergebruikt
 * op de transactie-feed, de kasrekening-lijst en het beleggings-transactielog.
 *
 * `useListDensity(listKey)` bewaart de keuze per lijst in localStorage. Default
 * is 'ruim' — exact het bestaande uiterlijk, zodat het geen regressie is. De
 * keuze leeft op het apparaat zelf (geen server-sync nodig): "ik wil deze lijst
 * compacter zien" is een per-apparaat weergavevoorkeur, net als
 * use-insight-visibility.
 *
 * SSR-veilig: server + eerste client-render tonen altijd 'ruim'; pas ná mount
 * leest de hook localStorage (voorkomt hydration-mismatch). `mounted` is
 * beschikbaar voor consumers die de toggle pas willen tonen na hydratie.
 */

export type ListDensity = 'ruim' | 'compact'

const STORAGE_PREFIX = 'tf-list-density:'
const EVENT = 'tf-list-density-change'

function storageKey(listKey: string): string {
  return `${STORAGE_PREFIX}${listKey}`
}

function readStored(listKey: string): ListDensity {
  if (typeof window === 'undefined') return 'ruim'
  try {
    return window.localStorage.getItem(storageKey(listKey)) === 'compact' ? 'compact' : 'ruim'
  } catch {
    return 'ruim'
  }
}

function writeStored(listKey: string, value: ListDensity): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(listKey), value)
  } catch {
    /* quota of disabled storage — stille fallback, state blijft in-memory */
  }
  window.dispatchEvent(
    new CustomEvent<{ listKey: string; value: ListDensity }>(EVENT, {
      detail: { listKey, value },
    }),
  )
}

/**
 * Per-lijst dichtheidsvoorkeur. `density` is 'ruim' totdat het mount-effect de
 * opgeslagen keuze inleest; `setDensity`/`toggle` persisteren en synchroniseren
 * andere instanties met dezelfde `listKey`.
 */
export function useListDensity(listKey: string): {
  density: ListDensity
  mounted: boolean
  setDensity: (value: ListDensity) => void
  toggle: () => void
} {
  const [density, setDensityState] = useState<ListDensity>('ruim')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDensityState(readStored(listKey))
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ listKey: string; value: ListDensity }>).detail
      // 'storage'-events dragen geen detail → altijd herlezen; custom events
      // alleen wanneer ze deze lijst betreffen.
      if (!detail || detail.listKey === listKey) setDensityState(readStored(listKey))
    }
    window.addEventListener(EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [listKey])

  const setDensity = useCallback(
    (value: ListDensity) => {
      writeStored(listKey, value)
      setDensityState(value)
    },
    [listKey],
  )

  const toggle = useCallback(() => {
    setDensity(readStored(listKey) === 'compact' ? 'ruim' : 'compact')
  }, [listKey, setDensity])

  return { density, mounted, setDensity, toggle }
}

const OPTIONS: { value: ListDensity; label: string; Icon: typeof Rows2 }[] = [
  { value: 'ruim', label: 'Ruim', Icon: Rows3 },
  { value: 'compact', label: 'Compact', Icon: Rows2 },
]

/**
 * Compacte, krant-stijl segmented control (twee mono-labels + icoon). Harde
 * ink-borders, geen afronding — één visuele familie met de overige lijst-
 * controls. Wrapper is ≥44px hoog voor de touch-target.
 */
export function DensityToggle({
  density,
  onChange,
  className,
}: {
  density: ListDensity
  onChange: (value: ListDensity) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Weergavedichtheid"
      className={[
        'inline-flex min-h-11 items-center gap-0.5 border border-[var(--border-ed)] bg-[var(--paper)] p-0.5',
        className ?? '',
      ].join(' ')}
      data-testid="density-toggle"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = density === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            title={`Weergave: ${label}`}
            className={[
              'inline-flex min-h-9 items-center gap-1.5 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ink)]',
              active
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
            ].join(' ')}
            data-testid={`density-option-${value}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )
}
