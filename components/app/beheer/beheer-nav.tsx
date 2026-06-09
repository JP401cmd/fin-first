'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'AI Instellingen', href: '/beheer/ai' },
  { label: 'Prompts', href: '/beheer/prompts' },
  { label: 'Briefing', href: '/beheer/briefing' },
  { label: 'Testdata', href: '/beheer/testdata' },
  { label: 'Release Notes', href: '/beheer/releases' },
  { label: 'Meldingen', href: '/beheer/meldingen' },
  { label: 'Rekenhulp-meldingen', href: '/beheer/calculator-reports', activeClass: 'border-violet-500 text-violet-700' },
  { label: 'Coach', href: '/beheer/coach', activeClass: 'border-wil-500 text-wil-700' },
  { label: 'Welkomstgids', href: '/beheer/welkom', activeClass: 'border-kern-500 text-kern-700' },
  { label: 'Toegang', href: '/beheer/toegang', activeClass: 'border-[var(--ink)] text-[var(--ink)]' },
  { label: 'Database', href: '/beheer/migration' },
  { label: 'Mobile Preview', href: '/beheer/testdata#mobile-preview' },
  { label: 'Bank Connect', href: '/beheer/bank-connect' },
  { label: 'Nieuws', href: '/beheer/nieuws' },
  { label: 'Extractie Test', href: '/beheer/extractie-test', activeClass: 'border-sky-500 text-sky-700' },
  { label: 'AI Features', href: '/beheer/ai-features' },
  { label: 'Widgets', href: '/beheer/widgets-test' },
  { label: 'Widget Audit', href: '/beheer/widget-audit', activeClass: 'border-emerald-500 text-emerald-700' },
  { label: 'Widget Presets', href: '/beheer/widget-presets' },
  { label: 'Propositie', href: '/beheer/propositie' },
  { label: 'AOW-leeftijd', href: '/beheer/aow-leeftijd' },
  { label: 'Will Avatar', href: '/beheer/will-avatar' },
  { label: 'Roadmap', href: '/beheer/roadmap', activeClass: 'border-[var(--horizon-500)] text-[var(--horizon-500)]' },
  { label: 'Regressietest', href: '/beheer/regressietest', activeClass: 'border-emerald-500 text-emerald-700' },
  { label: 'Vragenlijsten', href: '/beheer/vragenlijsten', activeClass: 'border-wil-500 text-wil-700' },
  { label: 'Doelen', href: '/beheer/doelen' },
  { label: 'Blueprints', href: '/beheer/blueprints', activeClass: 'border-[var(--color-horizon-500)] text-[var(--color-horizon-700)]' },
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
