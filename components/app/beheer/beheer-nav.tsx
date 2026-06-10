'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  BEHEER_GROUPS,
  findBeheerGroup,
  isBeheerToolActive,
  type BeheerGroupId,
} from '@/lib/beheer-sections'

const INACTIVE_CLASS =
  'border-transparent text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'

export function BeheerNav() {
  const pathname = usePathname()
  const activeGroupId = findBeheerGroup(pathname)?.id ?? null
  const [selectedId, setSelectedId] = useState<BeheerGroupId>(activeGroupId ?? 'technisch')

  // Navigatie naar een andere tool springt de selectie terug naar de groep van de URL.
  useEffect(() => {
    if (activeGroupId) setSelectedId(activeGroupId)
  }, [activeGroupId])

  // De hub ís de navigatie — daar geen tabbalk.
  if (pathname === '/beheer') return null

  const selected = BEHEER_GROUPS.find((group) => group.id === selectedId) ?? BEHEER_GROUPS[0]

  return (
    <nav aria-label="Beheer-navigatie">
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border-ed)]">
        {BEHEER_GROUPS.map((group) => {
          const isSelected = group.id === selected.id
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedId(group.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isSelected ? group.accentClass : INACTIVE_CLASS
              }`}
            >
              {group.label}
            </button>
          )
        })}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border-ed)]">
        {selected.tools.map((tool) => {
          const isActive = isBeheerToolActive(pathname, tool.href)
          return (
            <Link
              key={tool.href}
              href={tool.href}
              aria-current={isActive ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors ${
                isActive ? `${selected.accentClass} font-medium` : INACTIVE_CLASS
              }`}
            >
              {tool.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
