// Statische index van canoniek-bezochte pagina's voor het command-palette.
// Bron: docs/routing-inventarisatie.md (per 2026-05-04). Laaggebruikte routes
// zoals beheer/* en /test-* ontbreken bewust — die voegen ruis toe. Beheer-
// routes alleen als `role === 'admin'` (filter in de provider, niet hier).

import {
  Home, Wallet, Coins, Banknote, Building2, Car, GraduationCap,
  CreditCard, RefreshCw, PiggyBank, Receipt, Calendar, History, Link as LinkIcon,
  TrendingUp, Calculator, Sparkles, FileText, Newspaper, Settings, User, Bell,
  BookOpen, Compass, Telescope, Activity, ListChecks, Cog, Plug,
  Goal, LineChart, type LucideIcon,
} from 'lucide-react'
import type { ModuleId } from '@/lib/module-registry'
import type { CommandItem } from './types'

type StaticPage = Omit<CommandItem, 'kind' | 'id'> & {
  href: string
  icon: LucideIcon
}

// ── Kern ─────────────────────────────────────────────────────────────────────

const KERN_PAGES: StaticPage[] = [
  { label: 'Overzicht',                   sublabel: 'Bezittingen en schulden',           href: '/core',                                  icon: Home,        module: 'kern' },
  { label: 'Bezittingen',               sublabel: 'Alle activa per categorie',          href: '/core/assets',                           icon: Wallet,      module: 'kern' },
  { label: 'Schulden',                  sublabel: 'Hypotheken en leningen',             href: '/core/debts',                            icon: CreditCard,  module: 'kern' },

  { label: 'Cash',                      sublabel: 'Bank- en spaarrekeningen',           href: '/overzicht/cashflow',                    icon: Banknote,    module: 'kern' },
  { label: 'Beleggingen',               sublabel: 'Aandelen en fondsen',                href: '/core/assets/investment',                icon: TrendingUp,  module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Crypto',                    sublabel: 'Crypto-portefeuille',                href: '/core/assets/crypto',                    icon: Coins,       module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Eigen huis',                sublabel: 'Woning en WOZ',                      href: '/core/assets/eigen_huis',                icon: Building2,   module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Vastgoed',                  sublabel: 'Verhuurd vastgoed',                  href: '/core/assets/real_estate',               icon: Building2,   module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Vorderingen',               sublabel: 'Geld dat aan jou verschuldigd is',   href: '/core/assets/vordering',                 icon: Receipt,     module: 'kern',  requiredModule: 'vermogensregistratie' },

  { label: 'Holdings',                  sublabel: 'Posities aandelen + crypto',         href: '/core/assets/holdings',                  icon: LineChart,   module: 'kern',  requiredModule: 'aandelenregistratie' },
  { label: 'Holdings importeren',       sublabel: 'CSV: Degiro, IBKR, Binance',         href: '/core/assets/holdings/import',           icon: FileText,    module: 'kern',  requiredModule: 'aandelenregistratie' },
  { label: 'Bulk herwaarderen',         sublabel: 'Meerdere assets tegelijk',           href: '/core/assets/revalue',                   icon: RefreshCw,   module: 'kern' },

  { label: 'Hypotheek',                 sublabel: 'Mortgage-overzicht',                 href: '/core/debts/mortgage',                   icon: Building2,   module: 'kern' },
  { label: 'Persoonlijke lening',       sublabel: 'Personal loan',                      href: '/core/debts/personal_loan',              icon: Banknote,    module: 'kern' },
  { label: 'Studieschuld',              sublabel: 'Student loan',                       href: '/core/debts/student_loan',               icon: GraduationCap, module: 'kern' },
  { label: 'Autolening',                sublabel: 'Car loan',                           href: '/core/debts/car_loan',                   icon: Car,         module: 'kern' },
  { label: 'Creditcard',                sublabel: 'Credit card',                        href: '/core/debts/credit_card',                icon: CreditCard,  module: 'kern' },
  { label: 'Revolverend krediet',       sublabel: 'Revolving credit',                   href: '/core/debts/revolving_credit',           icon: CreditCard,  module: 'kern' },

  { label: 'Budgetten',                 sublabel: 'Inkomsten, uitgaven, sparen',        href: '/core/budgets',                          icon: PiggyBank,   module: 'kern',  requiredModule: 'budgetteren' },
  { label: 'Nieuw budget',              sublabel: 'Een nieuw budget aanmaken',          href: '/core/budgets/new',                      icon: PiggyBank,   module: 'kern',  requiredModule: 'budgetteren' },
  { label: 'Belasting (Box 3 + Box 2)', sublabel: 'Vermogensheffing en partner-verdeling', href: '/core/belasting',                     icon: Calculator,  module: 'kern',  requiredModule: 'vermogensregistratie' },
  { label: 'Maandelijkse check-in',     sublabel: '7-stap reflectie en snapshot',       href: '/core/checkin',                          icon: Calendar,    module: 'kern' },
  { label: 'Check-in historie',         sublabel: 'Eerdere check-ins met trendline',    href: '/core/checkin/historie',                 icon: History,     module: 'kern' },
  { label: 'Bank koppelen',             sublabel: 'Open Banking (Tink/Yodlee/Nordigen)', href: '/core/cash/connect',                    icon: LinkIcon,    module: 'kern' },
  { label: 'Cashflow',                  sublabel: 'Budget, transacties, vaste lasten, forecast', href: '/overzicht/cashflow',              icon: Banknote,    module: 'kern' },
  { label: 'Budget',                    sublabel: 'Maandbudgetten plannen en volgen',   href: '/overzicht/cashflow/budget',             icon: PiggyBank,   module: 'kern',  requiredModule: 'budgetteren' },
  { label: 'Transacties',               sublabel: 'Inkomsten en uitgaven deze maand',   href: '/overzicht/cashflow/transacties',        icon: Receipt,     module: 'kern' },
  { label: 'Vaste lasten',              sublabel: 'Abonnementen en terugkerende kosten', href: '/overzicht/cashflow/vaste-lasten',      icon: RefreshCw,   module: 'kern' },
  { label: 'Forecast',                  sublabel: 'Spaarquote, netto, trend + 6-maands-vooruitblik', href: '/overzicht/cashflow/forecast', icon: LineChart,   module: 'kern' },
]

// ── Wil ──────────────────────────────────────────────────────────────────────

const WIL_PAGES: StaticPage[] = [
  { label: 'Overzicht',                    sublabel: 'Doelen, voorstellen en acties',      href: '/will',                                  icon: Goal,        module: 'wil' },
]

// ── Horizon ──────────────────────────────────────────────────────────────────

const HORIZON_PAGES: StaticPage[] = [
  { label: 'Toekomst',                sublabel: 'FIRE-projectie en scenario\'s',      href: '/horizon',                               icon: Telescope,   module: 'horizon', requiredModule: 'toekomstplannen' },
  { label: 'Wat-als',                   sublabel: 'Scenario builder met sliders',       href: '/horizon/whatif',                        icon: Compass,     module: 'horizon', requiredModule: 'toekomstplannen' },
]

// ── Identity ─────────────────────────────────────────────────────────────────

const IDENTITY_PAGES: StaticPage[] = [
  { label: 'Identiteit',                sublabel: 'Profiel en voortgang',               href: '/identity',                              icon: User,        module: 'globaal' },
  { label: 'Profiel',                   sublabel: 'Persoonlijke gegevens en huishouden', href: '/identity/profiel',                     icon: User,        module: 'globaal' },
  { label: 'Instellingen',              sublabel: 'Notificaties, FIRE, weergave, modules', href: '/identity/instellingen',              icon: Settings,    module: 'globaal' },
  { label: 'Koppelingen',               sublabel: 'Banken, brokers, exchanges',         href: '/identity/koppelingen',                  icon: Plug,        module: 'globaal' },
]

// ── Globaal ──────────────────────────────────────────────────────────────────

const GLOBAL_PAGES: StaticPage[] = [
  { label: 'Berichten',                 sublabel: 'Al je meldingen op één plek',        href: '/berichten',                             icon: Bell,        module: 'globaal' },
  { label: 'Nieuws',                    sublabel: 'Financieel marktnieuws',             href: '/nieuws',                                icon: Newspaper,   module: 'globaal',  requiredModule: 'nieuws' },
  { label: 'Rapportages',               sublabel: 'Maand- / kwartaal- / jaarrapport',   href: '/rapportages',                           icon: FileText,    module: 'globaal' },
  { label: 'FIRE-simulatie',            sublabel: 'Standalone tool met sliders',        href: '/tools/fire-sim',                        icon: Calculator,  module: 'globaal' },
]

// ── Beheer (alleen als role === 'admin') ─────────────────────────────────────

const BEHEER_PAGES: StaticPage[] = [
  { label: 'Beheer',                    sublabel: 'Admin-paneel',                       href: '/beheer/ai',                             icon: Cog,         module: 'beheer' },
  { label: 'Beheer · Features',         sublabel: 'Feature-flags',                      href: '/beheer/features',                       icon: Cog,         module: 'beheer' },
  { label: 'Beheer · Blueprints',       sublabel: 'UI-blueprint bibliotheek',           href: '/beheer/blueprints',                     icon: Cog,         module: 'beheer' },
  { label: 'Beheer · Roadmap',          sublabel: 'Roadmap-board',                      href: '/beheer/roadmap',                        icon: Cog,         module: 'beheer' },
  { label: 'Beheer · Releases',         sublabel: 'Release-management',                 href: '/beheer/releases',                       icon: Cog,         module: 'beheer' },
  { label: 'Beheer · Toegang',          sublabel: 'Rollen en accounts',                 href: '/beheer/toegang',                        icon: Cog,         module: 'beheer' },
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
