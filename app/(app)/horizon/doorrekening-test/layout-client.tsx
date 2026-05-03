'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DoorrekeningSettingsProvider, type DoorrekeningDefaults } from './settings-context'

const tabs: { label: string; href: string; disabled?: boolean }[] = [
  { label: 'Opbouw', href: '/horizon/doorrekening-test/opbouw' },
  { label: 'Afbouw', href: '/horizon/doorrekening-test/afbouw' },
  { label: 'Gebeurtenissen', href: '/horizon/doorrekening-test/gebeurtenissen' },
  { label: 'Overzicht', href: '/horizon/doorrekening-test/overzicht' },
]

export function DoorrekeningLayoutClient({
  children,
  defaults,
}: {
  children: React.ReactNode
  defaults: DoorrekeningDefaults
}) {
  const pathname = usePathname()

  return (
    <DoorrekeningSettingsProvider defaults={defaults}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Editorial header — blueprint Type 7 (Wizard met tabs) */}
        <header className="space-y-2">
          <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
            <span
              aria-hidden
              className="inline-block h-px w-7 shrink-0"
              style={{ background: 'var(--module-active-500)' }}
            />
            Horizon · doorrekening
          </div>
          <h1
            className="font-bold text-2xl sm:text-3xl tracking-[-0.02em]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            Jouw{' '}
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              projectie
            </em>
          </h1>
          <p
            className="italic text-[14px] leading-snug text-[var(--ink-2)] pl-4"
            style={{
              fontFamily: 'var(--font-source-serif, Georgia, serif)',
              borderLeft: '2px solid var(--module-active-500)',
            }}
          >
            Gedetailleerd overzicht van je financiële projectie per categorie.
          </p>
        </header>

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
                      ? 'text-[var(--module-active-700)]'
                      : tab.disabled
                        ? 'cursor-not-allowed border-transparent text-[var(--ink-4)]'
                        : 'border-transparent text-[var(--ink-3)] hover:text-[var(--module-active-700)]'
                  }`}
                  style={
                    active
                      ? { borderColor: 'var(--module-active-500)' }
                      : undefined
                  }
                  onClick={tab.disabled ? (e) => e.preventDefault() : undefined}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </DoorrekeningSettingsProvider>
  )
}
