'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronDown, Filter, Check } from 'lucide-react'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'

/**
 * BezittingenFilter — compacte dropdown-filter op /overzicht/bezittingen.
 * Vervangt de eerdere segmented-control (die te beperkt was met 5 hoofd-
 * types — 13 ASSET_TYPE_LABELS in totaal). Selectie navigeert naar
 * /overzicht/bezittingen/[type] (bestaande re-export van /core/assets/[type]).
 *
 * "Alle bezittingen"-keuze brengt user terug naar /overzicht/bezittingen
 * (AssetsClient toont alle types).
 */
export function BezittingenFilter() {
  const router = useRouter()
  const pathname = usePathname() ?? '/overzicht/bezittingen'
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const activeType: AssetType | null = (() => {
    const match = pathname.match(/^\/overzicht\/bezittingen\/([^/]+)/)
    if (!match) return null
    const type = match[1] as AssetType
    return type in ASSET_TYPE_LABELS ? type : null
  })()
  const activeLabel = activeType ? ASSET_TYPE_LABELS[activeType] : 'Alle bezittingen'

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function selectType(type: AssetType | null) {
    setOpen(false)
    const href = type ? `/overzicht/bezittingen/${type}` : '/overzicht/bezittingen'
    router.push(href)
  }

  const entries = Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][]

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)] transition-colors"
      >
        <Filter className="w-4 h-4 text-[var(--ink-3)]" aria-hidden="true" />
        <span>{activeLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--ink-3)] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 z-20 min-w-[240px] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-lg overflow-hidden"
        >
          <FilterOption
            label="Alle bezittingen"
            isActive={activeType === null}
            onSelect={() => selectType(null)}
            isFirst
          />
          <div className="border-t border-[var(--border-ed)]" aria-hidden="true" />
          {entries.map(([type, label]) => (
            <FilterOption
              key={type}
              label={label}
              isActive={activeType === type}
              onSelect={() => selectType(type)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterOption({
  label,
  isActive,
  onSelect,
  isFirst,
}: {
  label: string
  isActive: boolean
  onSelect: () => void
  isFirst?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
      className={[
        'flex items-center justify-between w-full min-h-[44px] px-3 py-2 text-sm text-left transition-colors',
        isActive
          ? 'bg-[var(--subtle)] text-[var(--ink)] font-semibold'
          : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]/50',
        isFirst ? 'rounded-t-xl' : '',
      ].join(' ')}
    >
      <span>{label}</span>
      {isActive && <Check className="w-4 h-4 text-[var(--ink-2)]" aria-hidden="true" />}
    </button>
  )
}
