'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleNavConfig, DomainColor } from '@/lib/navigation'
import { useFeatureAccess } from '@/components/app/feature-access-provider'

const colorStyles: Record<DomainColor, { active: string; hover: string; border: string }> = {
  amber: {
    active: 'text-amber-700 border-amber-500',
    hover: 'hover:text-amber-600 hover:border-amber-300',
    border: 'border-b-amber-100',
  },
  teal: {
    active: 'text-teal-700 border-teal-500',
    hover: 'hover:text-teal-600 hover:border-teal-300',
    border: 'border-b-teal-100',
  },
  purple: {
    active: 'text-purple-700 border-purple-500',
    hover: 'hover:text-purple-600 hover:border-purple-300',
    border: 'border-b-purple-100',
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

  const visibleItems = config.items.filter(
    item => !item.featureId || features[item.featureId] !== false
  )

  return (
    <div className={`sticky top-[var(--header-height)] z-40 border-b bg-white ${styles.border}`}>
      <div className="mx-auto max-w-6xl px-6">
        <nav
          className="scrollbar-none -mb-px flex gap-1 overflow-x-auto"
          aria-label={`${config.module} navigatie`}
        >
          {visibleItems.map((item) => {
            const active = isActive(pathname, item.href, config.basePath)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? styles.active
                    : `border-transparent text-zinc-500 ${styles.hover}`
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
