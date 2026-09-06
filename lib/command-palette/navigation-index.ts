// Statische index van canoniek-bezochte pagina's voor het command-palette.
// Bron: lib/nav-config.ts (Overzicht / Toekomst / Mijn) + deep-tool-routes.
// Laaggebruikte routes zoals /test-* ontbreken bewust — die voegen ruis toe.
// Beheer-routes alleen als `role === 'superadmin'` (filter in de provider, niet hier).

import {
  Home, Wallet, Coins, Banknote, Building2, Car, GraduationCap,
  CreditCard, RefreshCw, PiggyBank, Receipt, Calendar, History,
  TrendingUp, Calculator, Sparkles, FileText, Newspaper, Settings, User, Bell,
  BookOpen, Compass, Telescope, Activity, ListChecks, Cog, Plug,
  Goal, LineChart, MessageSquare, type LucideIcon,
} from 'lucide-react'
import type { ModuleId } from '@/lib/module-registry'
import { BEHEER_GROUPS } from '@/lib/beheer-sections'
import { OVERVIEW_APP_SUBROUTES } from '@/lib/nav-config'
import type { CommandItem } from './types'

type StaticPage = Omit<CommandItem, 'kind' | 'id'> & {
  href: string
  icon: LucideIcon
}

// ── Kern ─────────────────────────────────────────────────────────────────────

const KERN_PAGES: StaticPage[] = [
  { label: 'Overzicht',                 sublabel: 'Kompas, bezittingen en schulden',    href: '/overzicht',                             icon: Home,        module: 'kern' },
  { label: 'Bezittingen',               sublabel: 'Alle activa per categorie',          href: '/overzicht/bezittingen',                 icon: Wallet,      module: 'kern' },
  { label: 'Schulden',                  sublabel: 'Hypotheken en leningen',             href: '/overzicht/schulden',                    icon: CreditCard,  module: 'kern' },

  { label: 'Beleggingen',               sublabel: 'Aandelen en fondsen',                href: '/overzicht/bezittingen/investment',      icon: TrendingUp,  module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Crypto',                    sublabel: 'Crypto-portefeuille',                href: '/overzicht/bezittingen/crypto',          icon: Coins,       module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Eigen huis',                sublabel: 'Woning en WOZ',                      href: '/overzicht/bezittingen/eigen_huis',      icon: Building2,   module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Vastgoed',                  sublabel: 'Verhuurd vastgoed',                  href: '/overzicht/bezittingen/real_estate',     icon: Building2,   module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Vorderingen',               sublabel: 'Geld dat aan jou verschuldigd is',   href: '/overzicht/bezittingen/vordering',       icon: Receipt,     module: 'kern',  requiredModule: 'vermogensregistratie' },

  // NB: de deep-app-tegels (Holdings, Budget, Crypto holdings, …) staan
  // bewust NIET hier maar in APP_PAGES verderop — zie de toelichting daar.
  { label: 'Holdings importeren',       sublabel: 'CSV: Degiro, IBKR, Binance',         href: '/core/assets/holdings/import',           icon: FileText,    module: 'kern',  requiredModule: 'aandelenregistratie' },
  { label: 'Bulk herwaarderen',         sublabel: 'Meerdere assets tegelijk',           href: '/core/assets/revalue',                   icon: RefreshCw,   module: 'kern' },

  { label: 'Hypotheek',                 sublabel: 'Mortgage-overzicht',                 href: '/overzicht/schulden/mortgage',           icon: Building2,   module: 'kern' },
  { label: 'Persoonlijke lening',       sublabel: 'Personal loan',                      href: '/overzicht/schulden/personal_loan',      icon: Banknote,    module: 'kern' },
  { label: 'Studieschuld',              sublabel: 'Student loan',                       href: '/overzicht/schulden/student_loan',       icon: GraduationCap, module: 'kern' },
  { label: 'Autolening',                sublabel: 'Car loan',                           href: '/overzicht/schulden/car_loan',           icon: Car,         module: 'kern' },
  { label: 'Creditcard',                sublabel: 'Credit card',                        href: '/overzicht/schulden/credit_card',        icon: CreditCard,  module: 'kern' },
  { label: 'Revolverend krediet',       sublabel: 'Revolving credit',                   href: '/overzicht/schulden/revolving_credit',   icon: CreditCard,  module: 'kern' },

  { label: 'Belasting',                 sublabel: 'Box 1, 2 en 3',                      href: '/overzicht/belasting',                   icon: Calculator,  module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Maandelijkse check-in',     sublabel: '7-stap reflectie en snapshot',       href: '/core/checkin',                          icon: Calendar,    module: 'kern' },
  { label: 'Check-in historie',         sublabel: 'Eerdere check-ins met trendline',    href: '/mijn/checkins',                         icon: History,     module: 'kern' },
  { label: 'Jaaroverzicht',            sublabel: 'Jouw jaar in vrijheid',              href: '/mijn/jaaroverzicht',                    icon: History,     module: 'wil' },
  { label: 'Mijlpalen',                sublabel: 'Dit heb je bereikt — de tijdlijn',   href: '/mijn/mijlpalen',                        icon: History,     module: 'wil' },
  // NB: `/mijn/koppelingen` stond hier tot bevinding M10 een tweede keer, als
  // "Bank koppelen" naast "Koppelingen" in IDENTITY_PAGES. Eén route, twee
  // namen, twee treffers — én twee items met dezelfde `page:<href>`-id.
  // Behouden is de canonieke naam ("Koppelingen", = navGroups + de
  // NavStackMeta-titel van de pagina); "bank" blijft vindbaar via het sublabel
  // van dat item, dat de ranker meeneemt.
  { label: 'Budget',                    sublabel: 'Budgetten, transacties, vaste lasten, forecast', href: '/overzicht/budget',              icon: Banknote,    module: 'kern' },
  { label: 'Transacties',               sublabel: 'Inkomsten en uitgaven deze maand',   href: '/overzicht/budget/transacties',        icon: Receipt,     module: 'kern' },
  { label: 'Vaste lasten',              sublabel: 'Abonnementen en terugkerende kosten', href: '/overzicht/budget/vaste-lasten',      icon: RefreshCw,   module: 'kern' },
  // Bankafschrift-import. Spiegelt bewust 'Holdings importeren' hierboven: ook
  // een /core/**-backing-route die alleen hier wordt ontsloten (niet in
  // nav-config — dat zou de legacy-allowlist in nav-config.route-coverage.test.ts
  // doorbreken). Label = de NavStackMeta-titel van de pagina zelf. Geen
  // requiredModule: transacties importeren is niet module-gated.
  { label: 'Transacties importeren',    sublabel: 'Bankafschrift: CSV, MT940, OFX',     href: '/core/cash/import',                      icon: FileText,    module: 'kern' },
  { label: 'Forecast',                  sublabel: 'Spaarquote, netto, trend + 6-maands-vooruitblik', href: '/overzicht/budget/forecast', icon: LineChart,   module: 'kern' },
]

// ── Apps (deep-tools) ────────────────────────────────────────────────────────
//
// Bevinding M10: de zijbalk en de mobiele nav-sheet tonen de app-tegels bewust
// CONTEXTUEEL — alleen op de rij van de actieve module, en alleen wanneer een
// gekoppeld bezit/schuld de bijbehorende tracking-vlag draagt. Dat blijft zo
// (optie B, besluit 26-08): een rustige zijbalk is een bewuste keuze uit
// docs/navigatie-redesign-plan.md §3.3.
//
// De keerzijde daarvan was dat een app die je nog niet hebt geactiveerd
// NERGENS te zien is — je kunt dus niet ontdekken dát Crypto holdings of
// Verhuurrendement bestaan. Dit blok is de permanente tegenhanger: ⌘K toont
// álle apps, altijd, ongeacht tracking-vlag of module-status. Vandaar bewust
// GEEN `requiredModule` — een app-pagina waarvan de module uit staat rendert
// een uitleg-strip die vertelt hoe je 'm aanzet (`tipStripCopy` in
// lib/category-deepening-keys.ts), en dat is precies wat de gebruiker hier
// zoekt.
//
// Het `App · `-voorvoegsel (zelfde vorm als `Beheer · ` hieronder) maakt van
// "app" één zoekterm die de hele lijst opent — de "Alle apps"-ingang uit het
// besluit — en groepeert ze zichtbaar in de resultatenlijst.
//
// Bron is `OVERVIEW_APP_SUBROUTES` uit lib/nav-config.ts, dezelfde lijst die
// de sidebar en de nav-sheet voeden. Zo kan het palet niet uit de pas lopen
// met de zijbalk; `navigation-index.apps.test.ts` bewaakt dat elke appKey
// hier een icoon en sublabel heeft.
const APP_META: Record<string, { icon: LucideIcon; sublabel: string }> = {
  'budgetteren': { icon: PiggyBank, sublabel: 'Maandbudgetten plannen en volgen — op een bankrekening' },
  'aandelen-holdings': { icon: LineChart, sublabel: 'Posities, koersen en dagrendement — op een belegging' },
  'crypto-holdings': { icon: Coins, sublabel: 'Coins per exchange of wallet — op een crypto-bezit' },
  'hypotheekplanner': { icon: Building2, sublabel: "Equity, oversluiten en scenario's — op een hypotheek" },
  'verhuurrendement': { icon: Building2, sublabel: 'Netto rendement, cashflow en bezetting — op verhuurd vastgoed' },
}

// `tabHref ?? href`: sinds M41 draagt de nav-lijst de kále categorie-route
// (zodat een zijbalk-klik in Eenvoudig niet meteen in de verdiepingstab landt)
// en staat de `?tab=`-deeplink apart in `tabHref`. Het palet gebruikt bewust wél
// de deeplink — je tikt hier de app expliciet bij naam aan — en houdt daarmee
// ook de unieke-href-eis van M10 overeind: de kale routes bestaan hierboven al
// als gewone categoriepagina's.
const APP_PAGES: StaticPage[] = OVERVIEW_APP_SUBROUTES.map((app) => {
  const meta = APP_META[app.appKey]
  return {
    label: `App · ${app.label}`,
    sublabel: meta?.sublabel ?? 'Verdiepende app op een bezit of schuld',
    href: app.tabHref ?? app.href,
    icon: meta?.icon ?? Sparkles,
    module: 'kern' as const,
  }
})

// ── Wil ──────────────────────────────────────────────────────────────────────

const WIL_PAGES: StaticPage[] = [
  { label: 'Tips & acties',             sublabel: 'Aanbevelingen en acties',            href: '/overzicht/tips',                        icon: Goal,        module: 'wil' },
]

// ── Horizon ──────────────────────────────────────────────────────────────────

const HORIZON_PAGES: StaticPage[] = [
  { label: 'Toekomst',                  sublabel: 'Tijdas, FIRE-projectie en scenario\'s', href: '/toekomst',                           icon: Telescope,   module: 'horizon', requiredModule: 'toekomstplannen' },
  { label: 'Doelen',                    sublabel: 'Financiële doelen en voortgang',     href: '/toekomst/doelen',                       icon: Goal,        module: 'horizon', requiredModule: 'toekomstplannen' },
  { label: 'Gebeurtenissen',            sublabel: 'Levensgebeurtenissen plannen',       href: '/toekomst/gebeurtenissen',               icon: Calendar,    module: 'horizon', requiredModule: 'toekomstplannen' },
  { label: 'Voorkeuren',                sublabel: 'Rendement, inflatie en regels',      href: '/toekomst/voorkeuren',                   icon: Settings,    module: 'horizon', requiredModule: 'toekomstplannen' },
  { label: 'Rekenhulp',                 sublabel: 'AI-rekenhulpen en bibliotheek',      href: '/toekomst/rekenhulp',                    icon: Calculator,  module: 'horizon', requiredModule: 'toekomstplannen' },
  { label: 'Wat-als',                   sublabel: 'Scenario builder met sliders',       href: '/toekomst/whatif',                       icon: Compass,     module: 'horizon', requiredModule: 'toekomstplannen' },
]

// ── Mijn ─────────────────────────────────────────────────────────────────────

const IDENTITY_PAGES: StaticPage[] = [
  { label: 'Mijn',                      sublabel: 'Profiel, partner, voorkeuren',       href: '/mijn',                                  icon: User,        module: 'globaal' },
  { label: 'Profiel',                   sublabel: 'Persoonlijke gegevens en huishouden', href: '/mijn/profiel',                         icon: User,        module: 'globaal' },
  { label: 'Account',                   sublabel: 'Abonnement en accountbeheer',        href: '/mijn/account',                          icon: Settings,    module: 'globaal' },
  { label: 'Notificaties',              sublabel: 'Meldingsvoorkeuren',                 href: '/mijn/notificaties',                     icon: Bell,        module: 'globaal' },
  { label: 'Weergave en uiterlijk',     sublabel: 'Eenvoudig of volledig, je startscherm, kleuren en letters', href: '/mijn/uiterlijk', icon: Settings,    module: 'globaal' },
  { label: 'Privacy',                   sublabel: 'Maskeren en gegevensbeheer',         href: '/mijn/privacy',                          icon: Settings,    module: 'globaal' },
  { label: 'Geavanceerd',               sublabel: 'Gegevens en geavanceerde opties',    href: '/mijn/geavanceerd',                      icon: Cog,         module: 'globaal' },
  { label: 'Koppelingen',               sublabel: 'Banken, brokers, exchanges',         href: '/mijn/koppelingen',                      icon: Plug,        module: 'globaal' },
]

// ── Globaal ──────────────────────────────────────────────────────────────────

const GLOBAL_PAGES: StaticPage[] = [
  { label: 'Berichten',                 sublabel: 'Al je meldingen op één plek',        href: '/berichten',                             icon: Bell,        module: 'globaal' },
  // "Krant", niet "Nieuws" — bevinding M14 (één naam per concept). De
  // canonieke bron is `globalNav` in lib/nav-config.ts; de pagina zelf zet
  // `<NavStackMeta title="Krant">`. Het palet was hier de derde nav-bron die
  // nog de oude naam droeg.
  { label: 'Krant',                     sublabel: 'Financieel marktnieuws',             href: '/nieuws',                                icon: Newspaper,   module: 'globaal',  requiredModule: 'nieuws' },
  { label: 'Rapportages',               sublabel: 'Maand- / kwartaal- / jaarrapport',   href: '/rapportages',                           icon: FileText,    module: 'globaal' },
  // ADR 0096: het formulier is weg — deze route is een verwijspagina naar de
  // meldmodus in de chat. Sublabel benoemt dat, zodat ⌘K geen inzendformulier
  // meer belooft dat er niet is.
  { label: 'Melden',                    sublabel: 'Melden gaat via je gesprek met Fin', href: '/mijn/feedback',                         icon: MessageSquare, module: 'globaal' },
  { label: 'FIRE-simulatie',            sublabel: 'Standalone tool met sliders',        href: '/tools/fire-sim',                        icon: Calculator,  module: 'globaal' },
]

// ── Beheer (alleen als role === 'admin') ─────────────────────────────────────

// Afgeleid uit lib/beheer-sections.ts — de single source of truth voor de
// beheer-indeling. Nieuwe beheer-tools verschijnen hier automatisch.
const BEHEER_PAGES: StaticPage[] = [
  { label: 'Beheer', sublabel: 'Startpagina beheer', href: '/beheer', icon: Cog, module: 'beheer' },
  ...BEHEER_GROUPS.flatMap((group) =>
    group.tools.map((tool) => ({
      label: `Beheer · ${tool.label}`,
      sublabel: tool.description.replace(/\.$/, ''),
      href: tool.href,
      icon: tool.icon,
      module: 'beheer' as const,
    })),
  ),
]

// ── Public API ───────────────────────────────────────────────────────────────

/** Alle pagina's geconverteerd naar CommandItem (excl. beheer — die zijn role-gated). */
export function getAllPageItems(): CommandItem[] {
  const all: StaticPage[] = [
    ...KERN_PAGES,
    ...APP_PAGES,
    ...WIL_PAGES,
    ...HORIZON_PAGES,
    ...IDENTITY_PAGES,
    ...GLOBAL_PAGES,
  ]
  return all.map((p) => ({
    id: `page:${p.href}`,
    kind: 'page',
    label: p.label,
    sublabel: p.sublabel,
    icon: p.icon,
    module: p.module,
    requiredModule: p.requiredModule,
    href: p.href,
  }))
}

/** Beheer-pages — alleen include als de gebruiker admin is. */
export function getAdminPageItems(): CommandItem[] {
  return BEHEER_PAGES.map((p) => ({
    id: `page:${p.href}`,
    kind: 'page',
    label: p.label,
    sublabel: p.sublabel,
    icon: p.icon,
    module: p.module,
    href: p.href,
  }))
}

/** Filter pages op actieve modules. Items zonder `requiredModule` blijven altijd staan. */
export function filterPagesByModules(
  pages: CommandItem[],
  activeModules: ReadonlyArray<ModuleId>,
): CommandItem[] {
  return pages.filter((p) => !p.requiredModule || activeModules.includes(p.requiredModule))
}
