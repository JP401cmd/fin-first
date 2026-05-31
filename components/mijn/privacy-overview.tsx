import Link from 'next/link'
import {
  User,
  Wallet,
  CreditCard,
  Banknote,
  Target,
  MessageSquare,
  Sparkles,
  Lock,
  Download,
  Trash2,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'

/**
 * PrivacyOverview — transparantie-anker op /mijn/privacy. Plan §3.4
 * (NL-context, Wealthfolio-leerles 2.13.1): "één transparantie-pagina
 * die per data-categorie laat zien waar het wordt opgeslagen en waarom,
 * plus een prominente 'data-export & verwijdering'-actie. Niet als
 * juridische verplichting, als merkpijler."
 *
 * TriFinity is cloud-first (Supabase) — bewust, omdat partner-sharing,
 * briefing-engine en multi-device synchronisatie dat vereisen. Deze
 * pagina maakt dat verschil met Wealthfolio (local-first) expliciet en
 * geeft de gebruiker controle in plaats van mistige FAQ-tekst.
 */

type DataCategory = {
  Icon: LucideIcon
  iconTint: string
  label: string
  what: string
  /** Waar wordt het opgeslagen ('Supabase NL/EU', 'localStorage', etc). */
  where: string
  why: string
  /** Toggle/actie-link voor de gebruiker. */
  action?: { label: string; href: string }
}

const CATEGORIES: DataCategory[] = [
  {
    Icon: User,
    iconTint: 'text-stone-700 bg-stone-100',
    label: 'Profiel',
    what: 'Naam, geboortejaar, eventuele partner en huishouden-info.',
    where: 'Supabase (EU-regio, encrypted at rest)',
    why: 'Nodig om leeftijds-projecties te berekenen en de juiste fiscale regels (AOW-leeftijd, hypotheekrenteaftrek) toe te passen.',
    action: { label: 'Profiel openen', href: '/mijn/profiel' },
  },
  {
    Icon: Wallet,
    iconTint: 'text-emerald-700 bg-emerald-50',
    label: 'Bezittingen',
    what: 'Saldi en samenstelling van cash, beleggen, eigen huis en pensioen — bedragen + asset_type, geen rekening-/IBAN-gegevens tenzij je expliciet koppelt.',
    where: 'Supabase (EU-regio, encrypted at rest)',
    why: 'Basis voor netto-vermogen, diversificatie-pillar en de Beleggen-tegel.',
    action: { label: 'Bezittingen openen', href: '/overzicht/bezittingen' },
  },
  {
    Icon: CreditCard,
    iconTint: 'text-amber-700 bg-amber-50',
    label: 'Schulden',
    what: 'Saldo, rente en aflossings-structuur — geen kredietbeoordeling, geen externe rapportage.',
    where: 'Supabase (EU-regio, encrypted at rest)',
    why: 'Drijft de schulden-pillar, hypotheek-strategie en het bruto/netto-vermogen.',
    action: { label: 'Schulden openen', href: '/overzicht/schulden' },
  },
  {
    Icon: Banknote,
    iconTint: 'text-sky-700 bg-sky-50',
    label: 'Cashflow & transacties',
    what: 'Inkomsten, uitgaven en categorieën. Alleen aanwezig als je transacties handmatig invoert of een PSD2-bank koppelt.',
    where: 'Supabase (EU-regio); PSD2-data nooit gedeeld met derden.',
    why: 'Voor je cashflow-pillar, vaste-lasten-overzicht en de Will-briefing.',
    action: { label: 'Koppelingen beheren', href: '/mijn/koppelingen' },
  },
  {
    Icon: Target,
    iconTint: 'text-violet-700 bg-violet-50',
    label: 'Doelen',
    what: 'Naam, doelbedrag, streefdatum en voortgang.',
    where: 'Supabase (EU-regio, encrypted at rest)',
    why: 'Voortgang-bars, Wealthfolio-status-flags, briefing-mijlpalen.',
    action: { label: 'Doelen openen', href: '/toekomst?tab=doelen' },
  },
  {
    Icon: MessageSquare,
    iconTint: 'text-rose-700 bg-rose-50',
    label: 'Will-chat & AI-context',
    what: 'Berichten die je naar Will stuurt plus de samenvatting van je financiële context die als prompt wordt meegegeven.',
    where: 'Verwerking via Anthropic / OpenAI (afhankelijk van model-config). Géén model-training op je data.',
    why: 'Zonder context kan Will geen relevante antwoorden geven. Chat-historie blijft van jou.',
    action: { label: 'AI-instellingen', href: '/mijn/privacy' },
  },
  {
    Icon: Sparkles,
    iconTint: 'text-fuchsia-700 bg-fuchsia-50',
    label: 'Wekelijkse briefing',
    what: 'Je wekelijkse briefing-kaartjes (vermogen, budget, doelen, vrijheid) — per week vastgezet.',
    where: 'Server-side opgeslagen in je profiel (briefing_snapshot).',
    why: 'Zo blijft je briefing de hele week stabiel en kun je hem 1× per dag handmatig verversen.',
    action: { label: 'Briefing openen', href: '/overzicht' },
  },
]

export function PrivacyOverview() {
  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-12">
      <header className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Mijn — privacy & transparantie
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl text-[var(--ink)] mt-1">
          Wat we opslaan, waar, en waarom
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-2)] leading-relaxed">
          TriFinity is cloud-first — bewust, omdat partner-delen, de wekelijkse
          briefing en multi-device synchronisatie dat vereisen. Hieronder per
          data-categorie wat we bewaren en waar het leeft, plus directe acties
          om je data te exporteren of te verwijderen.
        </p>
      </header>

      <ol className="space-y-3">
        {CATEGORIES.map((cat) => (
          <li
            key={cat.label}
            className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5"
          >
            <header className="flex items-start gap-3 mb-2">
              <span
                className={`inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0 ${cat.iconTint}`}
              >
                <cat.Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="font-serif text-base font-semibold text-[var(--ink)]">
                  {cat.label}
                </h2>
                <p className="text-xs text-[var(--ink-2)] leading-snug mt-0.5">
                  {cat.what}
                </p>
              </div>
            </header>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
              <div>
                <dt className="font-semibold text-[var(--ink-3)] uppercase tracking-[0.06em] text-[10px]">
                  Opslag
                </dt>
                <dd className="text-[var(--ink-2)] leading-snug mt-0.5">
                  {cat.where}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--ink-3)] uppercase tracking-[0.06em] text-[10px]">
                  Waarom
                </dt>
                <dd className="text-[var(--ink-2)] leading-snug mt-0.5">
                  {cat.why}
                </dd>
              </div>
            </dl>
            {cat.action && (
              <div className="mt-3">
                <Link
                  href={cat.action.href}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline"
                >
                  {cat.action.label}
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              </div>
            )}
          </li>
        ))}
      </ol>

      <section
        aria-label="Data-rechten"
        className="mt-8 rounded-2xl border border-[var(--border-ed)] bg-gradient-to-br from-stone-50 to-violet-50/40 p-5 sm:p-6"
      >
        <header className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-violet-700" aria-hidden="true" />
          <h2 className="font-serif text-lg text-[var(--ink)]">Jouw data, jouw keuze</h2>
        </header>
        <p className="text-xs text-[var(--ink-2)] leading-relaxed mb-4">
          AVG-rechten zijn niet alleen tekst onderaan een policy-pagina — hieronder
          direct uitvoerbaar.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Link
            href="/mijn/geavanceerd#export"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Data exporteren (JSON)
          </Link>
          <Link
            href="/mijn/geavanceerd"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-2.5 text-sm font-semibold hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Account verwijderen
          </Link>
        </div>
        <p className="mt-3 text-[11px] italic text-[var(--ink-3)] leading-snug">
          Account verwijderen wist al je data uit Supabase binnen 24 uur en
          stopt alle koppelingen. Onomkeerbaar — exporteer eerst als je een
          back-up wilt.
        </p>
      </section>
    </section>
  )
}
