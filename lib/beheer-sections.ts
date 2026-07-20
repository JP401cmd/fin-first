// Single source of truth voor de indeling van het beheerscherm (/beheer).
// Geconsumeerd door: de hub-startpagina, BeheerNav, het command-palette en
// de regressietest-suite beheer-layout. Nieuwe beheer-pagina's horen hier
// in precies één groep te landen.

import {
  AlertOctagon,
  BarChart3,
  BookOpen,
  Bot,
  Cable,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  FlaskConical,
  FunctionSquare,
  Gauge,
  GitBranch,
  GitCompareArrows,
  Goal,
  History,
  Images,
  Inbox,
  Landmark,
  LayoutGrid,
  LayoutTemplate,
  LineChart,
  ListChecks,
  Mail,
  MailCheck,
  MessageSquare,
  MessageCircle,
  Milestone,
  Network,
  Newspaper,
  Activity,
  Timer,
  ScrollText,
  ShieldAlert,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export type BeheerGroupId = 'technisch' | 'functioneel' | 'test' | 'info'

export interface BeheerTool {
  label: string
  href: string
  description: string
  icon: LucideIcon
}

export interface BeheerGroup {
  id: BeheerGroupId
  label: string
  description: string
  /** Actieve-tab kleur (border + tekst) voor de groepsnav. */
  accentClass: string
  /** Kicker-streep kleur (achtergrond) voor de hub-secties. */
  stripeClass: string
  tools: BeheerTool[]
}

export const BEHEER_GROUPS: BeheerGroup[] = [
  {
    id: 'technisch',
    label: 'Technisch beheer',
    description: 'Systeemconfiguratie en koppelingen — voor de technisch beheerder.',
    accentClass: 'border-[var(--ink)] text-[var(--ink)]',
    stripeClass: 'bg-[var(--ink)]',
    tools: [
      {
        label: 'AI Instellingen',
        href: '/beheer/ai',
        description: 'Provider, model, API-keys en systeemprompt-override.',
        icon: Bot,
      },
      {
        label: 'Prompts',
        href: '/beheer/prompts',
        description: 'Alle systeem-prompts per domein, alleen-lezen.',
        icon: ScrollText,
      },
      {
        label: 'AI Features',
        href: '/beheer/ai-features',
        description: 'Limieten voor AI-functies, zoals nieuws-verversingen.',
        icon: SlidersHorizontal,
      },
      {
        label: 'Bank Connect',
        href: '/beheer/bank-connect',
        description: 'TrueLayer-koppeling: omgeving, credentials en verbindingstest.',
        icon: Landmark,
      },
      {
        label: 'Achtergrondtaken',
        href: '/beheer/jobs',
        description: 'Laatste uitvoering, status en duur van de geplande crons.',
        icon: Activity,
      },
      {
        label: 'Integraties',
        href: '/beheer/integraties',
        description: 'Externe koppelingen en uploads: inventaris, liveness en contractbewaking.',
        icon: Cable,
      },
      {
        label: 'Platform-status',
        href: '/beheer/platform',
        description: 'Onderhoudsmodus, aankondiging en globale kill-switches.',
        icon: ShieldAlert,
      },
      {
        label: 'Foutmeldingen',
        href: '/beheer/errors',
        description: 'Ongevangen client-fouten die gebruikers raakten.',
        icon: AlertOctagon,
      },
      {
        label: 'E-mail',
        href: '/beheer/email',
        description: 'Providerstatus en recente transactionele e-mailpogingen.',
        icon: Mail,
      },
    ],
  },
  {
    id: 'functioneel',
    label: 'Functioneel beheer',
    description: 'Inhoud, regels en autorisaties — voor de functioneel beheerder.',
    accentClass: 'border-amber-500 text-amber-700',
    stripeClass: 'bg-amber-500',
    tools: [
      {
        label: 'Gebruikers',
        href: '/beheer/gebruikers',
        description: 'Zoek een gebruiker en ken AI- of Connected-abonnementen toe.',
        icon: Users,
      },
      {
        label: 'Registratie-toegang',
        href: '/beheer/allowlist',
        description:
          'Wie mag zich registreren tijdens de besloten testfase — de e-mail-uitnodigingslijst.',
        icon: MailCheck,
      },
      {
        label: 'Welkomstgids',
        href: '/beheer/welkom',
        description: 'Schermen en stappen van de welkomstgids op het overzicht.',
        icon: Sparkles,
      },
      {
        label: 'Coach',
        href: '/beheer/coach',
        description: 'Suggestieregels, timing en kopregel van Fin.',
        icon: MessageCircle,
      },
      {
        label: 'Kennisbank lokale AI',
        href: '/beheer/kennisbank',
        description: 'Uitleg-items (begrippen, geen cijfers) voor de systeemprompt van de lokale Fin-chat.',
        icon: BookOpen,
      },
      {
        label: 'Briefing',
        href: '/beheer/briefing',
        description: 'Temporele en functionele redactieregels voor de briefing.',
        icon: CalendarClock,
      },
      {
        label: 'Doelen',
        href: '/beheer/doelen',
        description: 'Doelgids-stappen die Fin per doel volgt.',
        icon: Goal,
      },
      {
        label: 'Nieuws',
        href: '/beheer/nieuws',
        description: 'Bronnen, RSS-feeds, ingest en artikelendatabase.',
        icon: Newspaper,
      },
      {
        label: 'Vragenlijsten',
        href: '/beheer/vragenlijsten',
        description: 'Vragenlijsten opstellen en respons bekijken.',
        icon: ClipboardList,
      },
      {
        label: 'AOW-leeftijd',
        href: '/beheer/aow-leeftijd',
        description: 'Opzoektabel AOW-leeftijd per geboortecohort.',
        icon: CalendarDays,
      },
      {
        label: 'Fiscale kerngetallen',
        href: '/beheer/fiscale-kerngetallen',
        description: 'Inventaris van jaargebonden fiscale constanten: waarden per jaar, bron, jaar-checklist en drift-punten.',
        icon: Sigma,
      },
      {
        label: 'Widget Presets',
        href: '/beheer/widget-presets',
        description: 'Dashboard-voorinstellingen samenstellen en ordenen.',
        icon: LayoutGrid,
      },
      {
        label: 'Rekenhulp-meldingen',
        href: '/beheer/calculator-reports',
        description: 'Moderatie-inbox voor feedback op rekenhulpen.',
        icon: Inbox,
      },
      {
        label: 'Feedback',
        href: '/beheer/feedback',
        description: 'Wat gebruikers insturen: bugs, ideeën en vragen.',
        icon: MessageSquare,
      },
    ],
  },
  {
    id: 'test',
    label: 'Test & ontwikkeling',
    description: 'Hulpmiddelen voor testen en ontwikkelen.',
    accentClass: 'border-emerald-500 text-emerald-700',
    stripeClass: 'bg-emerald-500',
    tools: [
      {
        label: 'UAT-procesplaat',
        href: '/beheer/uat',
        description: 'Procesplaat van de UAT: succesrate, dekking en status per zone.',
        icon: ClipboardCheck,
      },
      {
        label: 'Testdata',
        href: '/beheer/testdata',
        description: "Persona's seeden, onboarding-reset en mobile preview.",
        icon: FlaskConical,
      },
      {
        label: 'Versie & git',
        href: '/beheer/versie',
        description:
          'Git-, deploy- en migratie-staat in één blik: waar staat localhost t.o.v. master en prod, ongecommit/ongepusht werk, worktrees en migratiedrift — plus een spiekbrief.',
        icon: GitBranch,
      },
      {
        label: 'Regressietest',
        href: '/beheer/regressietest',
        description: 'Regressiesuite draaien met live resultaten per module.',
        icon: ListChecks,
      },
      {
        label: 'Horizon-strategietest',
        href: '/beheer/horizon-strategie',
        description: 'Regressietest: horizon-grafiek × strategie-combinaties (huisvesting/eind/onttrekking) op de complete persona, met FIRE- en doelbedrag-marges.',
        icon: GitCompareArrows,
      },
      {
        label: 'Extractie Test',
        href: '/beheer/extractie-test',
        description: 'AI-extractie van vrije tekst testen zonder op te slaan.',
        icon: FileSearch,
      },
      {
        label: 'Roadmap functionaliteiten',
        href: '/beheer/roadmap',
        description: 'Gap-analyse uit marktonderzoek: gewenste functies per belofte-pijler.',
        icon: Milestone,
      },
      {
        label: 'Grafiek-werking (tijdelijk)',
        href: '/beheer/grafiek-werking',
        description: 'Functionele referentie van de FIRE-grafiek: fases, voorkeuren, strategieën en het beperkingenregister.',
        icon: LineChart,
      },
      {
        label: 'Horizon-tabellen (mijn data)',
        href: '/beheer/horizon-tabellen-mij',
        description: 'De grootboek-engine v2 op je eigen account: tabellen A–H, opbouw per onderdeel en de v1↔v2-vergelijking.',
        icon: UserCheck,
      },
      {
        label: 'Horizon-kernel (transparantie)',
        href: '/beheer/horizon-kernel',
        description: 'De héle rekenkern van invoer tot FIRE-leeftijd navolgbaar: uitgangspunten, geresolvede invoer, alle maandtabellen, technisch rapport en de Excel-oracle-verificatie.',
        icon: FunctionSquare,
      },
      {
        label: 'Widget-galerij',
        href: '/beheer/widget-galerij',
        description: 'Alle widgets in elke grootte op je eigen data — gating omzeild. De dashboard-data wordt pas na een klik geladen om egress te sparen.',
        icon: Images,
      },
    ],
  },
  {
    id: 'info',
    label: 'Ter info',
    description: 'Naslag en documentatie — alleen-lezen.',
    accentClass: 'border-[var(--color-horizon-500)] text-[var(--color-horizon-700)]',
    stripeClass: 'bg-[var(--color-horizon-500)]',
    tools: [
      {
        label: 'Kerngetallen',
        href: '/beheer/kpi',
        description: 'Platform-KPI’s: gebruikers, tiers, verbruik en fouten deze maand.',
        icon: BarChart3,
      },
      {
        label: 'AI-verbruik',
        href: '/beheer/ai-verbruik',
        description: 'Werkelijk tokenverbruik per functie en per account.',
        icon: Gauge,
      },
      {
        label: 'Webprestaties',
        href: '/beheer/webprestaties',
        description: 'Core Web Vitals (p75) per route en device — echte gebruikersmetingen.',
        icon: Timer,
      },
      {
        label: 'Architectuur',
        href: '/beheer/architectuur',
        description: 'Interactieve ArchiMate-plaat van de applicatie.',
        icon: Network,
      },
      {
        label: 'Development',
        href: '/beheer/development',
        description: 'Het agent-team en de skill-pijplijnen waarmee TriFinity gebouwd wordt.',
        icon: Workflow,
      },
      {
        label: 'Audit-trail',
        href: '/beheer/audit',
        description: 'Logboek van beheeracties: abonnement, rol, blokkade, config.',
        icon: ScrollText,
      },
      {
        label: 'Release Notes',
        href: '/beheer/releases',
        description: 'Wat er per versie veranderd is.',
        icon: History,
      },
      {
        label: 'Widget Audit',
        href: '/beheer/widget-audit',
        description: 'Reviewlog en classificatie van alle widgets.',
        icon: ClipboardCheck,
      },
      {
        label: 'Blueprints',
        href: '/beheer/blueprints',
        description: 'Tien pagina-archetypen als ontwerpreferentie.',
        icon: LayoutTemplate,
      },
    ],
  },
]

/**
 * Boundary-veilige match: exact pad of een subpad met '/'-grens.
 * Voorkomt dat '/beheer/ai' ook '/beheer/ai-features' claimt, terwijl
 * '/beheer/blueprints/[type]' wél onder Blueprints valt.
 */
export function isBeheerToolActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** De groep waar het huidige pad onder valt, of null (bv. op /beheer zelf). */
export function findBeheerGroup(pathname: string): BeheerGroup | null {
  return (
    BEHEER_GROUPS.find((group) =>
      group.tools.some((tool) => isBeheerToolActive(pathname, tool.href)),
    ) ?? null
  )
}
