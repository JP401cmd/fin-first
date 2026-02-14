'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'AI Instellingen', href: '/beheer/ai' },
  { label: 'Testdata', href: '/beheer/testdata' },
  { label: 'Release Notes', href: '/beheer/releases' },
  { label: 'Meldingen', href: '/beheer/meldingen' },
  { label: 'Features', href: '/beheer/features' },
  { label: 'Mobile Preview', href: '/beheer/testdata#mobile-preview' },
] as const

export function BeheerNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200">
      {tabs.map((tab) => {
        const basePath = tab.href.split('#')[0]
        const isActive = tab.href.includes('#') ? false : pathname === basePath
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
