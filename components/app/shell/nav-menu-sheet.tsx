'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { mainNav, navGroups, globalNav, type NavColor } from '@/lib/nav-config'

const colorClasses: Record<NavColor, { active: string; idle: string; icon: string }> = {
  amber:  { active: 'bg-kern-50 text-kern-900 border-kern-300',     idle: 'hover:bg-kern-50/40',     icon: 'text-kern-700' },
  purple: { active: 'bg-horizon-50 text-horizon-900 border-horizon-300', idle: 'hover:bg-horizon-50/40', icon: 'text-horizon-700' },
  teal:   { active: 'bg-wil-50 text-wil-900 border-wil-300',         idle: 'hover:bg-wil-50/40',     icon: 'text-wil-700' },
  stone:  { active: 'bg-stone-100 text-stone-900 border-stone-300', idle: 'hover:bg-stone-100',     icon: 'text-stone-700' },
}

type NavMenuSheetProps = {
  open: boolean
  onClose: () => void
  onAction?: (action: 'open-chat' | 'open-account' | 'open-search') => void
}

export function NavMenuSheet({ open, onClose, onAction }: NavMenuSheetProps) {
  const pathname = usePathname() ?? '/'

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Navigatie"
      size="md"
      initialMobileHeight="80vh"
    >
      <div className="space-y-6 pb-4">
        {/* Hoofdpagina's — grote tap-targets */}
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)] mb-2 px-1">
            Hoofdpagina&apos;s
          </h3>
          <div className="grid grid-cols-1 gap-1.5">
            {mainNav.map((item) => {
              const Icon = item.icon!
              const active = isActive(item.href)
              const c = colorClasses[item.color]
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-start gap-3 px-3 py-3 rounded-xl border-2 transition-colors ${
                    active ? c.active : `border-transparent ${c.idle}`
                  }`}
                >
                  <div className={`mt-0.5 ${c.icon}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px] leading-tight">
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-[12px] text-[var(--ink-3)] leading-snug mt-0.5">
                        {item.description}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        {/* Verdiepingen per hoofdpagina */}
        {navGroups
          .filter((g) => g.items.length > 0)
          .map((group) => {
            const c = colorClasses[group.parent.color]
            return (
              <section key={group.parent.href}>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)] mb-2 px-1">
                  Onder {group.parent.label}
                </h3>
                <div className="grid grid-cols-1 gap-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors ${
                          active ? c.active : c.idle
                        }`}
                      >
                        <span className="font-medium text-[14px]">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}

        {/* Globale items */}
        <section className="border-t border-[var(--border-ed)] pt-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)] mb-2 px-1">
            Overal beschikbaar
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {globalNav.map((item) => {
              const Icon = item.icon
              if (item.href) {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors ${
                      active ? 'bg-stone-100 text-stone-900' : 'hover:bg-stone-100/60'
                    }`}
                  >
                    <Icon size={16} className="text-stone-600" />
                    <span className="font-medium text-[13px]">{item.label}</span>
                  </Link>
                )
              }
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    if (item.action && onAction) onAction(item.action)
                    onClose()
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-stone-100/60 transition-colors text-left"
                >
                  <Icon size={16} className="text-stone-600" />
                  <span className="font-medium text-[13px]">{item.label}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </BottomSheet>
  )
}
