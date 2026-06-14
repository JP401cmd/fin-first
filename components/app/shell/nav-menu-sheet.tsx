'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BottomSheet } from '@/components/app/bottom-sheet'
import {
  mainNav,
  navGroups,
  globalNav,
  OVERVIEW_APP_SUBROUTES,
  type NavColor,
  type NavItem,
} from '@/lib/nav-config'
import {
  useLeverScores,
  useActiveAppKeys,
} from '@/components/app/shell/responsive-shell'
import type { LeverStatus } from '@/components/app/shell/lever-compass'

const statusDotClass: Record<LeverStatus, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  neutral: 'bg-stone-300',
}

const statusTitle: Record<LeverStatus, string> = {
  green: 'Op koers',
  amber: 'Aandacht nodig',
  red: 'Actie vereist',
  neutral: 'Geen meting',
}

/**
 * Map sub-route href → LeverScore-key. Wanneer een sub-route geen
 * direct-mapping heeft, toont de dot zich niet. Pad-prefix-match zodat
 * deep-routes (bv. /overzicht/bezittingen/cash) dezelfde indicator
 * krijgen als de parent.
 */
function statusForHref(
  href: string,
  scores: ReturnType<typeof useLeverScores>,
): LeverStatus | null {
  if (href.startsWith('/overzicht/bezittingen')) return scores.assets.status
  if (href.startsWith('/overzicht/schulden')) return scores.debts.status
  if (href.startsWith('/overzicht/cashflow')) return scores.cashflow.status
  if (href.startsWith('/overzicht/belasting')) return scores.tax.status
  return null
}

const colorClasses: Record<NavColor, { active: string; idle: string; icon: string; subActive: string; subIdle: string }> = {
  amber:  { active: 'bg-kern-50 text-kern-900 border-kern-300',     idle: 'hover:bg-kern-50/40',     icon: 'text-kern-700',    subActive: 'bg-kern-100 text-kern-900',    subIdle: 'hover:bg-kern-50/40 text-[var(--ink-2)]' },
  purple: { active: 'bg-horizon-50 text-horizon-900 border-horizon-300', idle: 'hover:bg-horizon-50/40', icon: 'text-horizon-700', subActive: 'bg-horizon-100 text-horizon-900', subIdle: 'hover:bg-horizon-50/40 text-[var(--ink-2)]' },
  teal:   { active: 'bg-wil-50 text-wil-900 border-wil-300',         idle: 'hover:bg-wil-50/40',     icon: 'text-wil-700',     subActive: 'bg-wil-100 text-wil-900',      subIdle: 'hover:bg-wil-50/40 text-[var(--ink-2)]' },
  stone:  { active: 'bg-stone-100 text-stone-900 border-stone-300', idle: 'hover:bg-stone-100',     icon: 'text-stone-700',   subActive: 'bg-stone-200 text-stone-900',  subIdle: 'hover:bg-stone-100 text-[var(--ink-2)]' },
}

type NavMenuSheetProps = {
  open: boolean
  onClose: () => void
  onAction?: (action: 'open-chat' | 'open-account' | 'open-search') => void
}

/**
 * NavMenuSheet — mobiele navigatie-sheet. Hoofdpagina's krijgen elk hun
 * sub-routes DIRECT eronder (zelfde sectie) zodat er geen dubbel menu
 * ontstaat — gebruiker scrollt één lijst i.p.v. context-switchen tussen
 * "Hoofd" en "Onder [naam]". Globale items (Krant, Berichten, Account)
 * blijven in eigen footer-sectie onderaan.
 */
export function NavMenuSheet({ open, onClose, onAction }: NavMenuSheetProps) {
  const pathname = usePathname() ?? '/'
  const leverScores = useLeverScores()
  const activeAppKeys = useActiveAppKeys()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  // Per main-nav-item bijbehorende sub-routes lookuppen. Voor Overzicht
  // voegen we dynamisch de actieve deep-app-tools toe (gefilterd op
  // activeAppKeys — alleen apps waarvan ten minste één asset/debt de
  // tracking-flag heeft staan).
  const subRoutesFor = (parentHref: string): NavItem[] => {
    const group = navGroups.find((g) => g.parent.href === parentHref)
    const base = group?.items ?? []
    if (parentHref === '/overzicht') {
      const activeApps = OVERVIEW_APP_SUBROUTES.filter((a) =>
        activeAppKeys.includes(a.appKey),
      )
      return [...base, ...activeApps]
    }
    return base
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Navigatie"
      size="md"
      initialMobileHeight="80vh"
      // Deze sheet wordt door de floating-pill ge(de)opend, dus de pill moet
      // er BOVENOP blijven (anders kun je 'm niet meer dichttikken). Enige
      // BottomSheet die bewust ONDER de pill rendert — vandaar de pb-24 hieronder.
      belowFloatingNav
    >
      {/* pb-24 binnen de sheet zelf zodat de floating-pill (die BOVEN de
          sheet zit) de laatste "Overal beschikbaar"-knoppen niet bedekt. */}
      <div className="space-y-5 pb-24">
        {/* Hoofdpagina's + hun sub-routes als één gestapelde lijst */}
        {mainNav.map((item) => {
          const Icon = item.icon!
          const active = isActive(item.href)
          const c = colorClasses[item.color]
          const subs = subRoutesFor(item.href)
          return (
            <section key={item.href}>
              <Link
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
                  <div className="font-semibold text-[15px] leading-tight">{item.label}</div>
                  {item.description && (
                    <div className="text-[12px] text-[var(--ink-3)] leading-snug mt-0.5">
                      {item.description}
                    </div>
                  )}
                </div>
              </Link>

              {subs.length > 0 && (
                <div className="mt-1 ml-3 pl-3 border-l border-[var(--border-ed)] grid grid-cols-1 gap-0.5">
                  {subs.map((sub) => {
                    const subActive = isActive(sub.href)
                    const status = statusForHref(sub.href, leverScores)
                    // Geneste box-subpagina's: alleen tonen wanneer de gebruiker
                    // op dit sub-item (of een kind) staat — contextueel 3e niveau.
                    const showChildren =
                      sub.children && sub.children.length > 0 && subActive
                    return (
                      <div key={sub.href}>
                        <Link
                          href={sub.href}
                          onClick={onClose}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors ${
                            subActive ? c.subActive : c.subIdle
                          }`}
                        >
                          <span className="text-[13px] font-medium">{sub.label}</span>
                          {status && (
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass[status]}`}
                              aria-hidden="true"
                              title={statusTitle[status]}
                            />
                          )}
                        </Link>
                        {showChildren && (
                          <div className="mt-0.5 ml-3 pl-3 border-l border-[var(--border-ed)] grid grid-cols-1 gap-0.5">
                            {sub.children!.map((child) => {
                              const childActive = isActive(child.href)
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={onClose}
                                  aria-current={childActive ? 'page' : undefined}
                                  className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${
                                    childActive ? c.subActive : c.subIdle
                                  }`}
                                >
                                  {child.label}
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}

        {/* Globale items — overal-beschikbaar (krant/berichten/account) */}
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
