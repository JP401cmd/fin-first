'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs: { label: string; href: string; disabled?: boolean }[] = [
  { label: 'Opbouw', href: '/horizon/doorrekening-test/opbouw' },
  { label: 'Afbouw', href: '/horizon/doorrekening-test/afbouw' },
]

export default function DoorrekenigTestLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Page header */}
      <h1 className="text-2xl font-bold text-[var(--ink)]">Doorrekening Test</h1>
      <p className="mt-1 text-sm text-[var(--ink-3)]">
        Gedetailleerd overzicht van je financiële projectie per categorie
      </p>

      {/* Sub-navigation tabs */}
      <div className="mt-6 border-b border-[var(--border-ed)]">
        <nav className="-mb-px flex gap-1" aria-label="Doorrekening navigatie">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.disabled ? '#' : tab.href}
                aria-disabled={tab.disabled}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                  active
                    ? 'border-horizon-500 text-horizon-700'
                    : tab.disabled
                      ? 'cursor-not-allowed border-transparent text-[var(--ink-4)]'
                      : 'border-transparent text-[var(--ink-3)] hover:border-horizon-300 hover:text-horizon-600'
                }`}
                onClick={tab.disabled ? (e) => e.preventDefault() : undefined}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="mt-6">
        {children}
      </div>
    </div>
  )
}
