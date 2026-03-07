'use client'

import { TrendingUp, Newspaper } from 'lucide-react'

// ── Mock news items ─────────────────────────────────────────────────

const MOCK_NEWS = [
  {
    id: 'news-2026-03-07-1',
    headline: 'ECB verlaagt rente met 0,25% naar historisch laag niveau van 2,5%',
    summary: 'De Europese Centrale Bank heeft vandaag besloten de basisrente te verlagen met 25 basispunten. Dit heeft directe gevolgen voor spaarrentes, hypotheekrentes en de waarde van obligaties in beleggingsportefeuilles.',
    personalImpact: 'Met jouw hypotheek van circa 280.000 kan dit je maandelijks 45 besparen bij herfinanciering. Dat zijn 1,2 extra vrijheidsdagen per jaar. Je spaarrente daalt naar verwachting met 0,15%.',
    category: 'rente',
    date: '2026-03-07',
    sourceContext: 'ECB persconferentie maart 2026',
  },
  {
    id: 'news-2026-03-07-2',
    headline: 'Box 3 tarief stijgt naar 36% per 2027',
    summary: 'Het kabinet heeft aangekondigd het box 3 tarief te verhogen van 34% naar 36% als onderdeel van het Belastingplan 2027. Dit raakt met name beleggers met een vermogen boven het heffingsvrije bedrag.',
    personalImpact: 'Op basis van je huidige vermogen stijgt je box 3 belasting met circa 180 per jaar. Dat is 4,6 vrijheidsdagen die je verliest.',
    category: 'fiscaal',
    date: '2026-03-06',
    sourceContext: 'Belastingplan 2027',
  },
  {
    id: 'news-2026-03-07-3',
    headline: 'Huizenprijzen stijgen 5,2% in februari, hoogste groei in 3 jaar',
    summary: 'De gemiddelde woningprijs in Nederland is gestegen naar 438.000. Met name in de Randstad zijn prijzen fors toegenomen door krapte op de markt.',
    personalImpact: 'De waardestijging van je woning draagt bij aan je netto vermogen, maar levert geen direct inkomen op. Focus op liquide beleggingen voor je FIRE-doelstelling.',
    category: 'woningmarkt',
    date: '2026-03-05',
    sourceContext: 'CBS/Kadaster woningprijsindex',
  },
  {
    id: 'news-2026-03-07-4',
    headline: 'AEX bereikt nieuw record: 950 punten doorbroken',
    summary: 'De Amsterdamse beurs heeft voor het eerst de 950 puntengrens doorbroken, gedreven door sterke kwartaalcijfers van ASML en Shell.',
    personalImpact: 'Je beleggingsportefeuille profiteert mee. Op basis van je asset allocatie heeft dit je netto vermogen met circa 1.200 verhoogd, oftewel 31 extra vrijheidsdagen.',
    category: 'beleggingen',
    date: '2026-03-04',
  },
  {
    id: 'news-2026-03-07-5',
    headline: 'Pensioenfondsen boeken gemiddeld 8,3% rendement in 2025',
    summary: 'De grote pensioenfondsen hebben een sterk beleggingsjaar achter de rug. ABP en PFZW rapporteren rendementen boven de 8%.',
    personalImpact: 'Je opgebouwde pensioenrechten groeien mee. Dit verlaagt indirect de druk op je eigen FIRE-vermogen met een geschatte 15.000 over je pensioenperiode.',
    category: 'pensioen',
    date: '2026-03-03',
    sourceContext: 'DNB Pensioenmonitor Q4 2025',
  },
]

// ── Category config ─────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  fiscaal: { label: 'Fiscaal', color: 'bg-kern-50 text-kern-700 border-kern-200', dotColor: 'bg-kern-400' },
  rente: { label: 'Rente', color: 'bg-blue-50 text-blue-700 border-blue-200', dotColor: 'bg-blue-400' },
  woningmarkt: { label: 'Woningmarkt', color: 'bg-purple-50 text-purple-700 border-purple-200', dotColor: 'bg-purple-400' },
  beleggingen: { label: 'Beleggingen', color: 'bg-wil-50 text-wil-700 border-wil-200', dotColor: 'bg-wil-400' },
  pensioen: { label: 'Pensioen', color: 'bg-horizon-50 text-horizon-700 border-horizon-200', dotColor: 'bg-horizon-400' },
  macro: { label: 'Macro', color: 'bg-zinc-100 text-zinc-700 border-zinc-200', dotColor: 'bg-zinc-400' },
}

// ── Components (matching berichten/page.tsx) ────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const cat = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.macro
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${cat.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cat.dotColor}`} />
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.06em]">
        {cat.label}
      </span>
    </span>
  )
}

function formatNewsDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function ImpactBlock({ impact }: { impact: string }) {
  return (
    <div className="mt-3 rounded-[var(--r)] border-l-3 border-wil-400 bg-wil-50/60 px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-wil-600" />
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-wil-700">
          Impact voor jou
        </span>
      </div>
      <p className="font-source-serif text-[13px] leading-relaxed text-wil-900">
        {impact}
      </p>
    </div>
  )
}

function HeroNewsArticle({ item }: { item: typeof MOCK_NEWS[0] }) {
  return (
    <article className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <CategoryBadge category={item.category} />
        {item.sourceContext && (
          <span className="font-inter text-[11px] text-[var(--ink-4)]">
            {item.sourceContext}
          </span>
        )}
      </div>
      <h2
        className="font-source-serif text-2xl font-semibold leading-snug text-[var(--ink)] sm:text-3xl"
        style={{ letterSpacing: '-0.02em' }}
      >
        {item.headline}
      </h2>
      <p className="mt-3 font-source-serif text-base leading-relaxed text-[var(--ink-2)] sm:text-lg">
        {item.summary}
      </p>
      <div className="mt-3">
        <span className="font-inter text-[11px] text-[var(--ink-4)]">
          {formatNewsDate(item.date)}
        </span>
      </div>
      <ImpactBlock impact={item.personalImpact} />
      <div className="mt-6 h-px bg-[var(--border-ed)]" />
    </article>
  )
}

function NewsArticle({ item }: { item: typeof MOCK_NEWS[0] }) {
  return (
    <article className="py-4">
      <div className="mb-2 flex items-center gap-3">
        <CategoryBadge category={item.category} />
        {item.sourceContext && (
          <span className="font-inter text-[11px] text-[var(--ink-4)]">
            {item.sourceContext}
          </span>
        )}
      </div>
      <h3 className="font-source-serif text-lg font-semibold leading-snug text-[var(--ink)]">
        {item.headline}
      </h3>
      <p className="mt-1.5 font-source-serif text-sm leading-relaxed text-[var(--ink-2)]">
        {item.summary}
      </p>
      <span className="mt-2 inline-block font-inter text-[11px] text-[var(--ink-4)]">
        {formatNewsDate(item.date)}
      </span>
      <ImpactBlock impact={item.personalImpact} />
    </article>
  )
}

// ── Test page ───────────────────────────────────────────────────────

export default function TestNewsHeroPage() {
  const [hero, ...rest] = MOCK_NEWS

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 md:px-8">
      {/* Masthead */}
      <div className="mb-6">
        <div className="mb-3 h-[3px] bg-[var(--ink)]" />
        <div className="flex items-center justify-between">
          <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Editie 66
          </span>
          <span className="font-source-serif text-[12px] italic text-[var(--ink-3)]">
            Persoonlijk financieel overzicht
          </span>
        </div>
        <h1
          className="mt-2 text-center font-playfair text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl md:text-[2.75rem]"
          style={{ letterSpacing: '-0.03em' }}
        >
          TriFinity Berichten
        </h1>
        <p className="mt-1.5 text-center font-source-serif text-sm italic text-[var(--ink-2)]">
          vrijdag 7 maart 2026
        </p>
        <div className="mt-3 h-[2px] bg-[var(--ink)]" />
        <div className="mt-[3px] h-px bg-[var(--ink)]" />
      </div>

      {/* Section header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Gepersonaliseerd nieuws
        </span>
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
      </div>

      {/* Hero article */}
      <HeroNewsArticle item={hero} />

      {/* Remaining articles */}
      <div className="divide-y divide-[var(--border-ed)]">
        {rest.map((item) => (
          <NewsArticle key={item.id} item={item} />
        ))}
      </div>

      {/* Verification checklist */}
      <div className="mt-12 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-4">
        <h3 className="font-inter text-xs font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Verificatie checklist
        </h3>
        <ul className="mt-2 space-y-1 font-inter text-xs text-[var(--ink-2)]">
          <li>Hero artikel is significant groter (text-2xl/3xl vs text-lg)</li>
          <li>Koppen in Source Serif (font-source-serif, semibold)</li>
          <li>Lead/samenvatting in Source Serif (normaal, --ink-2)</li>
          <li>Datum in Inter (text-[11px], --ink-4)</li>
          <li>Impact voor jou blok met border-l-3 wil-400 accent</li>
          <li>Hero visueel afgescheiden met divider</li>
          <li>Overige artikelen in standaard formaat</li>
        </ul>
      </div>
    </div>
  )
}
