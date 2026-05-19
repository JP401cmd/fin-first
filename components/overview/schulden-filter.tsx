'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronDown, Filter, Check } from 'lucide-react'
import { DEBT_TYPE_LABELS, type DebtType } from '@/lib/debt-data'

/**
 * SchuldenFilter — compacte dropdown-filter op /overzicht/schulden.
 * Vervangt de eerder verwijderde tab-strip (die niet uitputtend was voor
 * de 11 debt-types). Selectie navigeert naar /overzicht/schulden/[type]
 * (re-export naar AssetCategoryPage-equivalent voor debts).
 *
 * "Alle"-keuze brengt user terug naar /overzicht/schulden (lijst van alle
 * schulden via DebtsPage).
 *
 * Dropdown sluit bij klik buiten, Escape-toets, of selectie. Mobile-vriendelijk
 * met min-h-[44px] op alle items.
 */
export function SchuldenFilter() {
  const router = useRouter()
  const pathname = usePathname() ?? '/overzicht/schulden'
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Detect actieve filter uit URL-pad (/overzicht/schulden/[type])
  const activeType: DebtType | null = (() => {
    const match = pathname.match(/^\/overzicht\/schulden\/([^/]+)/)
    if (!match) return null
    const type = match[1] as DebtType
    return type in DEBT_TYPE_LABELS ? type : null
  })()
  const activeLabel = activeType ? DEBT_TYPE_LABELS[activeType] : 'Alle schulden'

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

  function selectType(type: DebtType | null) {
    setOpen(false)
    const href = type ? `/overzicht/schulden/${type}` : '/overzicht/schulden'
    router.push(href)
  }

  const entries = Object.entries(DEBT_TYPE_LABELS) as [DebtType, string][]

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
          className="absolute left-0 top-full mt-1 z-20 min-w-[220px] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-lg overflow-hidden"
        >
          <FilterOption
            label="Alle schulden"
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
