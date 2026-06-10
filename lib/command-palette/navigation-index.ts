// Statische index van canoniek-bezochte pagina's voor het command-palette.
// Bron: lib/nav-config.ts (Overzicht / Toekomst / Mijn) + deep-tool-routes.
// Laaggebruikte routes zoals /test-* ontbreken bewust — die voegen ruis toe.
// Beheer-routes alleen als `role === 'superadmin'` (filter in de provider, niet hier).

import {
  Home, Wallet, Coins, Banknote, Building2, Car, GraduationCap,
  CreditCard, RefreshCw, PiggyBank, Receipt, Calendar, History, Link as LinkIcon,
  TrendingUp, Calculator, Sparkles, FileText, Newspaper, Settings, User, Bell,
  BookOpen, Compass, Telescope, Activity, ListChecks, Cog, Plug,
  Goal, LineChart, MessageSquare, type LucideIcon,
} from 'lucide-react'
import type { ModuleId } from '@/lib/module-registry'
import { BEHEER_GROUPS } from '@/lib/beheer-sections'
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

  { label: 'Holdings',                  sublabel: 'Posities aandelen + crypto',         href: '/overzicht/bezittingen/investment?tab=aandelen-holdings', icon: LineChart, module: 'kern', requiredModule: 'aandelenregistratie' },
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
  { label: 'Bank koppelen',             sublabel: 'Banken, brokers, exchanges',         href: '/mijn/koppelingen',                      icon: LinkIcon,    module: 'kern' },
  { label: 'Cashflow',                  sublabel: 'Budget, transacties, vaste lasten, forecast', href: '/overzicht/cashflow',              icon: Banknote,    module: 'kern' },
  { label: 'Budget',                    sublabel: 'Maandbudgetten plannen en volgen',   href: '/overzicht/cashflow/budget',             icon: PiggyBank,   module: 'kern',  requiredModule: 'budgetteren' },
  { label: 'Transacties',               sublabel: 'Inkomsten en uitgaven deze maand',   href: '/overzicht/cashflow/transacties',        icon: Receipt,     module: 'kern' },
  { label: 'Vaste lasten',              sublabel: 'Abonnementen en terugkerende kosten', href: '/overzicht/cashflow/vaste-lasten',      icon: RefreshCw,   module: 'kern' },
  { label: 'Forecast',                  sublabel: 'Spaarquote, netto, trend + 6-maands-vooruitblik', href: '/overzicht/cashflow/forecast', icon: LineChart,   module: 'kern' },
]

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
  { label: 'Uiterlijk',                 sublabel: 'Kleurpalet, typografie en widgets',  href: '/mijn/uiterlijk',                        icon: Settings,    module: 'globaal' },
  { label: 'Privacy',                   sublabel: 'Maskeren en gegevensbeheer',         href: '/mijn/privacy',                          icon: Settings,    module: 'globaal' },
  { label: 'Geavanceerd',               sublabel: 'Gegevens en geavanceerde opties',    href: '/mijn/geavanceerd',                      icon: Cog,         module: 'globaal' },
  { label: 'Koppelingen',               sublabel: 'Banken, brokers, exchanges',         href: '/mijn/koppelingen',                      icon: Plug,        module: 'globaal' },
]

// ── Globaal ──────────────────────────────────────────────────────────────────

const GLOBAL_PAGES: StaticPage[] = [
  { label: 'Berichten',                 sublabel: 'Al je meldingen op één plek',        href: '/berichten',                             icon: Bell,        module: 'globaal' },
  { label: 'Nieuws',                    sublabel: 'Financieel marktnieuws',             href: '/nieuws',                                icon: Newspaper,   module: 'globaal',  requiredModule: 'nieuws' },
  { label: 'Rapportages',               sublabel: 'Maand- / kwartaal- / jaarrapport',   href: '/rapportages',                           icon: FileText,    module: 'globaal' },
  { label: 'Feedback',                  sublabel: 'Bug, idee of vraag insturen',        href: '/mijn/feedback',                         icon: MessageSquare, module: 'globaal' },
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
