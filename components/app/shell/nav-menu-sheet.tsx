'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, RotateCw } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { TapTarget } from '@/components/editorial/tap-target'
import {
  mainNav,
  navGroups,
  globalNav,
  OVERVIEW_APP_SUBROUTES,
  SIMPLE_HIDDEN_NAV_HREFS,
  type NavColor,
  type NavItem,
} from '@/lib/nav-config'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import {
  useLeverScores,
  useActiveAppKeys,
} from '@/components/app/shell/shell-contexts'
import type { LeverStatus } from '@/components/app/shell/lever-compass'

const statusDotClass: Record<LeverStatus, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  // green/amber/red = stoplicht-semantiek (bewust eigen systeem); neutral =
  // "geen meting" → neutrale ink-token i.p.v. een module-/stone-kleur.
  neutral: 'bg-[var(--ink-4)]',
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
  if (href.startsWith('/overzicht/budget')) return scores.cashflow.status
  if (href.startsWith('/overzicht/belasting')) return scores.tax.status
  return null
}

// `stripe` = kleur van het streepje vóór de "apps"-kicker; spiegelt de
// desktop-AppTagStrip, maar leest de kleur van de módule zelf (de sheet
// rendert álle modules tegelijk, dus --module-active-* zou hier de kleur
// van de huidige route lenen i.p.v. die van de sectie).
const colorClasses: Record<NavColor, { active: string; idle: string; icon: string; subActive: string; subIdle: string; stripe: string }> = {
  amber:  { active: 'bg-kern-50 text-kern-900 border-kern-300',     idle: 'hover:bg-kern-50/40',     icon: 'text-kern-700',    subActive: 'bg-kern-100 text-kern-900',    subIdle: 'hover:bg-kern-50/40 text-[var(--ink-2)]', stripe: 'var(--color-kern-500)' },
  purple: { active: 'bg-horizon-50 text-horizon-900 border-horizon-300', idle: 'hover:bg-horizon-50/40', icon: 'text-horizon-700', subActive: 'bg-horizon-100 text-horizon-900', subIdle: 'hover:bg-horizon-50/40 text-[var(--ink-2)]', stripe: 'var(--color-horizon-500)' },
  teal:   { active: 'bg-wil-50 text-wil-900 border-wil-300',         idle: 'hover:bg-wil-50/40',     icon: 'text-wil-700',     subActive: 'bg-wil-100 text-wil-900',      subIdle: 'hover:bg-wil-50/40 text-[var(--ink-2)]', stripe: 'var(--color-wil-500)' },
  stone:  { active: 'bg-[var(--subtle)] text-[var(--ink)] border-[var(--border-md)]', idle: 'hover:bg-[var(--subtle)]', icon: 'text-[var(--ink-2)]', subActive: 'bg-[var(--subtle)] text-[var(--ink)]', subIdle: 'hover:bg-[var(--subtle)] text-[var(--ink-2)]', stripe: 'var(--rule-soft, var(--border-ed))' },
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
 *
 * ELKE TAK IS UITKLAPBAAR (melding B-048, 12-09-2026). NAV-2 liet in
 * Eenvoudig alleen de ACTIEVE hoofdpagina zijn sub-items tonen; de andere
 * takken waren daarmee een doodlopend eind — je moest eerst naar de
 * hoofdpagina navigeren om te zien wat eronder hing. De chevron naast elke
 * hoofdpagina klapt die tak nu open zónder te navigeren. Wat NIET verandert
 * is de begintoestand: in Eenvoudig staat alleen de actieve tak open, in
 * Volledig staan ze alle open — precies zoals NAV-2 het liet. De chevron
 * voegt een uitgang toe, hij herschikt de rustvorm niet.
 */
export function NavMenuSheet({ open, onClose, onAction }: NavMenuSheetProps) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  // Toetsenbord-/schermlezer-tegenhanger van het pull-to-refresh-gebaar. In de
  // PWA (`display: standalone`) is er geen browser-chrome, dus zónder deze knop
  // zou verversen alleen met een veeg kunnen — en dat is voor een deel van de
  // gebruikers geen weg. Zelfde actie, zelfde transition-semantiek als de
  // indicator in de shell.
  const [refreshPending, startRefresh] = useTransition()
  const leverScores = useLeverScores()
  const activeAppKeys = useActiveAppKeys()
  const { mode: displayMode } = useDisplayMode()
  // Handmatig open/dicht gezette takken, per hoofdpagina-href. Leeg = volg de
  // begintoestand (zie `expandedFor` hieronder). Bewust géén localStorage: dit
  // is een kijkje-nemen binnen één sessie, geen voorkeur die een apparaat moet
  // onthouden — en de begintoestand is al afgestemd op de weergavemodus.
  const [branchOverride, setBranchOverride] = useState<Record<string, boolean>>({})

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  // Per main-nav-item bijbehorende sub-routes lookuppen. Voor Overzicht
  // voegen we dynamisch de actieve deep-app-tools toe (gefilterd op
  // activeAppKeys — alleen apps waarvan ten minste één asset/debt de
  // tracking-flag heeft staan).
  //
  // Hoofdonderdelen (`base`) en apps blijven BEWUST gescheiden — samengeplakt
  // in één array las de gebruiker ze als één ongedeelde lijst. Desktop doet
  // dit al zo (SubTagStrip vs. AppTagStrip in sidebar.tsx); dit spiegelt dat.
  const subRoutesFor = (parentHref: string): { base: NavItem[]; apps: NavItem[] } => {
    const group = navGroups.find((g) => g.parent.href === parentHref)
    let base = group?.items ?? []
    let apps: NavItem[] =
      parentHref === '/overzicht'
        ? OVERVIEW_APP_SUBROUTES.filter((a) => activeAppKeys.includes(a.appKey))
        : []
    // Eenvoudig-weergave: verberg de aangewezen menu-ingangen (Rekenhulp).
    // Filtert ALLEEN de sheet-ingang — de pagina's blijven via deeplink + Volledig
    // bereikbaar, en navGroups/resolveRouteTitle blijven ongemoeid. Geldt voor
    // beide groepen, zodat een toekomstige app-href op die lijst ook valt.
    if (displayMode === 'simple') {
      base = base.filter((item) => !SIMPLE_HIDDEN_NAV_HREFS.includes(item.href))
      apps = apps.filter((item) => !SIMPLE_HIDDEN_NAV_HREFS.includes(item.href))
    }
    return { base, apps }
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
          // NAV-2 bepaalt nog steeds de BEGINtoestand: in Eenvoudig staat
          // alleen de actieve tak open, in Volledig staan ze alle open (één
          // blik op de hele boom). Sinds B-048 kan de gebruiker elke tak zelf
          // open- of dichtklappen met de chevron; die keuze wint dan van de
          // begintoestand.
          const allSubs = subRoutesFor(item.href)
          const hasSubs = allSubs.base.length > 0 || allSubs.apps.length > 0
          const expandedByDefault = displayMode !== 'simple' || active
          const expanded = branchOverride[item.href] ?? expandedByDefault
          const subs: { base: NavItem[]; apps: NavItem[] } = expanded
            ? allSubs
            : { base: [], apps: [] }
          const branchId = `nav-sheet-branch-${item.href.replace(/\//g, '-')}`
          const appsHeadingId = `nav-sheet-apps-${item.href.replace(/\//g, '-')}`
          // Eén renderer voor beide groepen — hoofdonderdelen en apps zijn
          // dezelfde soort rij; alleen de groepering eromheen verschilt.
          const renderSub = (sub: NavItem) => {
            const subActive = isActive(sub.href)
            const status = statusForHref(sub.href, leverScores)
            // Geneste box-subpagina's: alleen tonen wanneer de gebruiker
            // op dit sub-item (of een kind) staat — contextueel 3e niveau.
            const showChildren = sub.children && sub.children.length > 0 && subActive
            return (
              <div key={sub.href}>
                <Link
                  href={sub.href}
                  onClick={onClose}
                  aria-current={subActive ? 'page' : undefined}
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
          }
          return (
            <section key={item.href}>
              {/* De rand/achtergrond van de hoofdregel zit op de wrapper, niet
                  meer op de link zelf: de chevron is een eigen knop en mag dus
                  niet ín het anker staan (genest interactief element). */}
              <div
                className={`flex items-stretch rounded-xl border-2 transition-colors ${
                  active ? c.active : `border-transparent ${c.idle}`
                }`}
              >
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="flex flex-1 min-w-0 items-start gap-3 px-3 py-3"
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
                {hasSubs && (
                  <TapTarget
                    label={
                      expanded
                        ? `Verberg de onderdelen van ${item.label}`
                        : `Toon de onderdelen van ${item.label}`
                    }
                    hit="extend"
                    aria-expanded={expanded}
                    // Alleen verwijzen zolang het paneel er ook daadwerkelijk
                    // staat; dicht is het uit de DOM, niet verborgen.
                    aria-controls={expanded ? branchId : undefined}
                    onClick={() =>
                      setBranchOverride((prev) => ({ ...prev, [item.href]: !expanded }))
                    }
                    className={`shrink-0 self-stretch px-3 ${c.icon}`}
                  >
                    <ChevronDown
                      size={18}
                      className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </TapTarget>
                )}
              </div>

              {(subs.base.length > 0 || subs.apps.length > 0) && (
                <div id={branchId} className="mt-1 ml-3 pl-3 border-l border-[var(--border-ed)]">
                  {subs.base.length > 0 && (
                    <div className="grid grid-cols-1 gap-0.5">{subs.base.map(renderSub)}</div>
                  )}
                  {/* Apps-groep — alleen bij >=1 actieve app. Eigen kicker +
                      scheidingsregel, zoals de AppTagStrip op desktop, zodat
                      hoofdonderdelen en apps niet als één lijst lezen. */}
                  {subs.apps.length > 0 && (
                    <div
                      role="group"
                      aria-labelledby={appsHeadingId}
                      className={`${subs.base.length > 0 ? 'mt-2 pt-2 border-t border-[var(--border-ed)]' : ''}`}
                    >
                      <h3
                        id={appsHeadingId}
                        className="flex items-center gap-1.5 mb-1 px-3 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--ink-3)]"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block w-4 h-px"
                          style={{ background: c.stripe }}
                        />
                        apps
                      </h3>
                      <div className="grid grid-cols-1 gap-0.5">{subs.apps.map(renderSub)}</div>
                    </div>
                  )}
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
                      active ? 'bg-[var(--subtle)] text-[var(--ink)]' : 'hover:bg-[var(--subtle)]/60'
                    }`}
                  >
                    <Icon size={16} className="text-[var(--ink-2)]" />
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
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-[var(--subtle)]/60 transition-colors text-left"
                >
                  <Icon size={16} className="text-[var(--ink-2)]" />
                  <span className="font-medium text-[13px]">{item.label}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              startRefresh(() => {
                router.refresh()
              })
            }}
            disabled={refreshPending}
            className="mt-1.5 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)]/60 disabled:opacity-60"
          >
            <RotateCw size={16} className="text-[var(--ink-2)]" />
            <span className="text-[13px] font-medium">
              {refreshPending ? 'Bijwerken…' : 'Ververs pagina'}
            </span>
          </button>
        </section>
      </div>
    </BottomSheet>
  )
}
