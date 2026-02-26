'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'AI Instellingen', href: '/beheer/ai' },
  { label: 'Testdata', href: '/beheer/testdata' },
  { label: 'Release Notes', href: '/beheer/releases' },
  { label: 'Meldingen', href: '/beheer/meldingen' },
  { label: 'Features', href: '/beheer/features' },
  { label: 'Database', href: '/beheer/migration' },
  { label: 'Mobile Preview', href: '/beheer/testdata#mobile-preview' },
  { label: 'GoCardless', href: '/beheer/gocardless' },
  { label: 'Tiers', href: '/beheer/tiers', activeClass: 'border-[var(--ink)] text-[var(--ink)]' },
] as const

export function BeheerNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border-ed)]">
      {tabs.map((tab) => {
        const basePath = tab.href.split('#')[0]
        const isActive = tab.href.includes('#') ? false : pathname === basePath
        const activeClass = 'activeClass' in tab ? tab.activeClass : 'border-amber-500 text-amber-700'
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? activeClass
                : 'border-transparent text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
