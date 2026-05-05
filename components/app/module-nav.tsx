'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleNavConfig, DomainColor } from '@/lib/navigation'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { isFeatureAccessible } from '@/lib/compute-feature-access'
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag'

const colorStyles: Record<DomainColor, { active: string; hover: string; border: string }> = {
  amber: {
    active: 'text-kern-700 border-kern-500',
    hover: 'hover:text-kern-600 hover:border-kern-300',
    border: 'border-b-kern-100',
  },
  teal: {
    active: 'text-wil-700 border-wil-500',
    hover: 'hover:text-wil-600 hover:border-wil-300',
    border: 'border-b-wil-100',
  },
  purple: {
    active: 'text-horizon-700 border-horizon-500',
    hover: 'hover:text-horizon-600 hover:border-horizon-300',
    border: 'border-b-horizon-100',
  },
}

function isActive(pathname: string, href: string, basePath: string): boolean {
  if (href === basePath) {
    return pathname === basePath || pathname === basePath + '/'
  }
  return pathname.startsWith(href)
}

export function ModuleNav({ config }: { config: ModuleNavConfig }) {
  const pathname = usePathname()
  const styles = colorStyles[config.color]
  const { features } = useFeatureAccess()

  // Feature-flag-aware sticky-top: bij oude shell zit de AppHeader bovenop,
  // dus ModuleNav plakt eronder via `var(--header-height)`. Bij nieuwe shell
  // is er geen AppHeader op desktop én geen pagina-bovenrand boven de tray-
  // content op mobile; ModuleNav plakt dan direct aan de top van zijn
  // scroll-container (de viewport op desktop, de tray-main op mobile).
  const [newShell] = useFeatureFlag('new_navigation_shell')
  const stickyTop = newShell ? 'top-0' : 'top-[var(--header-height)]'

  const visibleItems = config.items.filter(
    item => !item.featureId || isFeatureAccessible(features, item.featureId)
  )

  return (
    <div className={`sticky ${stickyTop} z-40 border-b border-[var(--border-ed)] bg-[var(--paper)] ${styles.border}`}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative">
          <nav
            className="scrollbar-none -mb-px flex gap-1 overflow-x-auto scroll-smooth"
            aria-label={`${config.module} navigatie`}
          >
            {visibleItems.map((item) => {
              const active = isActive(pathname, item.href, config.basePath)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap border-b-2 px-3 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                    active
                      ? styles.active
                      : `border-transparent text-[var(--ink-3)] ${styles.hover}`
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-[var(--paper)] md:hidden" />
        </div>
      </div>
    </div>
  )
}
