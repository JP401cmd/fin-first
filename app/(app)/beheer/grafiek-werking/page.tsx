import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Grafiek-werking — Beheer' }

/**
 * TIJDELIJKE BEHEERPAGINA — functionele referentie van de FIRE-grafiek (/toekomst).
 *
 * Doel: één complete functionele omschrijving van hoe de toekomst-grafiek werkt
 * (fases, snijpunt, weergaves, voorkeuren, gebeurtenissen, strategieën, uitgave
 * na pensioen, inflatie/rendement, belasting, engines) + een beperkingenregister,
 * zodat we daarna een technische analyse per onderdeel kunnen doen om de werking
 * te herzien. Bewust statisch (geen live data) — een werk-/presentatiedocument.
 *
 * Niet bedoeld als blijvende productiepagina. Verwijderen zodra de herziening is
 * verwerkt in de gecureerde Berekeningen-view (/beheer/architectuur?view=berekeningen).
 */

// ── lokale presentatie-helpers (server, geen state) ───────────────────────────

function Sec({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 border-b border-[var(--ink)] pb-2">
        <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-horizon-700)]">
          <span aria-hidden className="inline-block h-px w-7 bg-[var(--color-horizon-500)]" />
          {kicker}
        </div>
        <h2 className="mt-1.5 text-xl font-bold text-[var(--ink)] sm:text-2xl">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">{children}</div>
    </section>
  )
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink)]">{children}</h3>
}

/** Bestandspad-referentie (mono, gedempt). */
function F({ children }: { children: ReactNode }) {
  return <code className="break-all font-mono text-[12px] text-[var(--ink-3)]">{children}</code>
}

/** Inline code / symbool. */
function C({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-[var(--subtle)] px-1 py-0.5 font-mono text-[12px] text-[var(--ink-2)]">{children}</code>
}

/** Inline beperking-callout (rode linkerrand). */
function Gap({ children }: { children: ReactNode }) {
  return (
    <div className="border border-[var(--border-ed)] border-l-[3px] border-l-[var(--negative)] bg-[var(--paper)] p-3 text-[13px] text-[var(--ink-2)]">
      <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--negative)]">beperking</span>
      {children}
    </div>
  )
}

/** Neutrale notitie/uitleg-callout. */
function Note({ children }: { children: ReactNode }) {
  return (
    <div className="border border-[var(--border-ed)] border-l-[3px] border-l-[var(--color-horizon-500)] bg-[var(--paper)] p-3 text-[13px] text-[var(--ink-2)]">
      {children}
    </div>
  )
}

// ── diagrammen ────────────────────────────────────────────────────────────────

function FaseTijdas() {
  return (
    <figure className="my-2">
      <svg viewBox="0 0 640 180" className="w-full" role="img" aria-label="De drie fases op de tijdas: opbouw, overbrugging, onttrekking">
        {/* fase-banden */}
        <rect x="40" y="20" width="260" height="120" fill="var(--color-horizon-500)" opacity="0.10" />
        <rect x="300" y="20" width="130" height="120" fill="var(--color-horizon-500)" opacity="0.04" />
        <rect x="430" y="20" width="170" height="120" fill="var(--color-kern-500)" opacity="0.09" />
        {/* baseline */}
        <line x1="40" y1="140" x2="610" y2="140" stroke="var(--ink-4)" strokeWidth="1" />
        {/* vermogenscurve: stijgend (opbouw) → dalend (afbouw) */}
        <polyline points="40,128 170,92 300,46" fill="none" stroke="var(--color-horizon-600)" strokeWidth="2.5" />
        <polyline points="300,46 430,62 600,112" fill="none" stroke="var(--color-kern-600)" strokeWidth="2.5" />
        <circle cx="300" cy="46" r="4" fill="var(--color-horizon-600)" />
        {/* markers */}
        <line x1="300" y1="20" x2="300" y2="140" stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="4 3" />
        <line x1="430" y1="20" x2="430" y2="140" stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="4 3" />
        {/* fase-labels */}
        <text x="170" y="34" textAnchor="middle" className="fill-[var(--ink-3)]" fontSize="10" fontFamily="monospace" letterSpacing="1.5">OPBOUW</text>
        <text x="365" y="34" textAnchor="middle" className="fill-[var(--ink-3)]" fontSize="9" fontFamily="monospace" letterSpacing="1">OVERBRUGGING</text>
        <text x="515" y="34" textAnchor="middle" className="fill-[var(--ink-3)]" fontSize="10" fontFamily="monospace" letterSpacing="1.5">ONTTREKKING</text>
        {/* as-labels */}
        <text x="40" y="158" textAnchor="middle" className="fill-[var(--ink-4)]" fontSize="10" fontFamily="monospace">nu</text>
        <text x="300" y="158" textAnchor="middle" className="fill-[var(--color-horizon-700)]" fontSize="10" fontFamily="monospace">FIRE</text>
        <text x="430" y="158" textAnchor="middle" className="fill-[var(--ink-4)]" fontSize="10" fontFamily="monospace">AOW</text>
        <text x="605" y="158" textAnchor="end" className="fill-[var(--ink-4)]" fontSize="10" fontFamily="monospace">leeftijd →</text>
      </svg>
      <figcaption className="mt-1 text-center text-[11px] italic text-[var(--ink-3)]">
        Sparen voedt alleen de opbouw; rendement (en Box 3, inflatie, cashflows) werkt in alle drie de fases. Overbrugging en
        onttrekking zijn rekenkundig identiek — alleen het label en het inschakelen van AOW verschilt.
      </figcaption>
    </figure>
  )
}

function Snijpunt() {
  return (
    <figure className="my-2">
      <svg viewBox="0 0 480 190" className="w-full max-w-[520px]" role="img" aria-label="FIRE-snijpunt: netto vermogen kruist het benodigd vermogen">
        <line x1="40" y1="20" x2="40" y2="160" stroke="var(--ink-4)" strokeWidth="1" />
        <line x1="40" y1="160" x2="450" y2="160" stroke="var(--ink-4)" strokeWidth="1" />
        {/* benodigd vermogen (binary search) — DAALT met de leeftijd: kortere te overbruggen periode + AOW/pensioen-bodem */}
        <line x1="40" y1="70" x2="420" y2="120" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="5 3" />
        {/* netto vermogen — stijgt door sparen + rendement */}
        <polyline points="40,165 252,98 420,45" fill="none" stroke="var(--color-horizon-600)" strokeWidth="2.5" />
        {/* snijpunt */}
        <circle cx="252" cy="98" r="4.5" fill="var(--color-horizon-600)" />
        <line x1="252" y1="98" x2="252" y2="160" stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 3" />
        <text x="252" y="174" textAnchor="middle" className="fill-[var(--color-horizon-700)]" fontSize="10" fontFamily="monospace">FIRE</text>
        <text x="424" y="45" className="fill-[var(--color-horizon-700)]" fontSize="10" fontFamily="monospace">netto vermogen</text>
        <text x="424" y="124" className="fill-[var(--ink-3)]" fontSize="10" fontFamily="monospace">benodigd ↓</text>
      </svg>
      <figcaption className="mt-1 text-center text-[11px] italic text-[var(--ink-3)]">
        Geen vaste <C>uitgaven / SWR</C>-lijn: het benodigd vermogen wordt per leeftijd via binary search bepaald en{' '}
        <strong>daalt</strong> met de leeftijd — de te overbruggen periode tot het einddoel wordt korter en AOW/pensioen leggen een
        groeiende inkomensbodem (bij deplete het sterkst; bij perpetual nominaal vrijwel vlak). FIRE = eerste leeftijd waar het
        stijgende netto vermogen het dalende benodigd vermogen snijdt (met fractionele interpolatie binnen het jaar).
      </figcaption>
    </figure>
  )
}

/** Twee kolommen met de exacte volgorde van bewerkingen per simulatiejaar. */
function JaarIteratie() {
  const opbouw = [
    'FIRE-detectie: bereik ik het benodigd vermogen? (binary search)',
    'Marktschok toepassen (eenmalige cashflow met portfolioPct)',
    'Eenmalige cashflows (inkomen verdeeld over beleggingsbuckets; uitgave via waterfall)',
    'Bucket-contributies resetten naar basis',
    'Schuldschema dit jaar (rente + aflossing)',
    'Sparen indexeren met inflatie',
    'Gemarkeerde aflossing aftrekken (dubbeltel-guard)',
    'Surplus → rendement op startwaarde + contributies − Box 3 − afschrijving',
  ]
  const afbouw = [
    'Beginvermogen vastleggen (vóór activiteit)',
    'Alle bucket-contributies op nul (geen sparen meer)',
    'Marktschok toepassen',
    'Eenmalige cashflows',
    'Terugkerende cashflows + AOW/pensioen-inkomen',
    'Uitgaven indexeren met inflatie',
    'Onttrekking bepalen (onttrekkingsstrategie) op netto vermogen',
    'Onttrekken via waterfall over de buckets',
    'Rendement + Box 3 (géén contributies)',
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { t: 'Opbouwjaar (accumulation)', items: opbouw, accent: 'var(--color-horizon-500)' },
        { t: 'Onttrekkingsjaar (transition + withdrawal)', items: afbouw, accent: 'var(--color-kern-500)' },
      ].map((col) => (
        <div key={col.t} className="border border-[var(--border-ed)] bg-[var(--paper)] p-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--ink)]">
            <span aria-hidden className="inline-block h-3 w-1" style={{ background: col.accent }} />
            {col.t}
          </div>
          <ol className="space-y-1 text-[12px] text-[var(--ink-2)]">
            {col.items.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 font-mono text-[var(--ink-4)]">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

/** Databedrading: van DB naar grafiek. */
function DataStroom() {
  const chain = [
    { t: 'DB-tabellen', d: 'assets · debts · budgets · transactions · life_events · profiles · bank_accounts' },
    { t: 'Loaders (server)', d: 'horizon-data-loader.ts · dashboard-data-loader.ts → spaarquote, uitgaven, FIRE-params, huis-events' },
    { t: 'Client-hook', d: 'useHorizonFireSim — bouwt UnifiedProjectionInput, regenereert huis-events met live params' },
    { t: 'Engine', d: 'runUnifiedProjection (puur, geen Supabase)' },
    { t: 'Grafiek', d: 'SimChart (lijn) · WealthCompositionChart (bar) · IncomeExpenseChart (in/uit)' },
  ]
  return (
    <div className="flex flex-col gap-2">
      {chain.map((node, i) => (
        <div key={node.t} className="flex items-start gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-horizon-500)] font-mono text-[10px] font-bold text-white">
              {i + 1}
            </span>
            {i < chain.length - 1 && <span aria-hidden className="my-0.5 h-5 w-px bg-[var(--ink-4)]" />}
          </div>
          <div className="pb-1">
            <div className="text-[13px] font-semibold text-[var(--ink)]">{node.t}</div>
            <div className="text-[12px] text-[var(--ink-3)]">{node.d}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── bijdrage-per-fase-matrix (1d) ──────────────────────────────────────────────

const MATRIX: { onderdeel: string; opbouw: string; overbrugging: string; onttrekking: string; hoe: string }[] = [
  { onderdeel: 'Sparen / spaarquote', opbouw: '✓', overbrugging: '—', onttrekking: '—', hoe: 'jaarlijks geïndexeerd, alleen naar investable buckets' },
  { onderdeel: 'Rendement', opbouw: '✓', overbrugging: '✓', onttrekking: '✓', hoe: 'per-asset annualReturn op startwaarde' },
  { onderdeel: 'Inflatie', opbouw: '✓', overbrugging: '✓', onttrekking: '✓', hoe: 'indexeert sparen + uitgaven + cashflows; NIET het rendement (nominaal)' },
  { onderdeel: 'Life-event cashflows', opbouw: '✓', overbrugging: '✓', onttrekking: '✓', hoe: 'elk jaar geëvalueerd; recurring + eenmalig (begin van het jaar)' },
  { onderdeel: 'AOW / pensioen', opbouw: '(✓)', overbrugging: '✓', onttrekking: '✓', hoe: 'recurring inkomen-cashflow vanaf ingangsleeftijd; verlaagt de onttrekking' },
  { onderdeel: 'Onttrekking / uitgaven', opbouw: '—', overbrugging: '✓', onttrekking: '✓', hoe: 'onttrekkingsstrategie → waterfall over de buckets' },
  { onderdeel: 'Box 3', opbouw: '✓', overbrugging: '✓', onttrekking: '✓', hoe: 'jaarlijkse forfait-drag per asset (36% × forfait), na heffingsvrij' },
]

// ── beperkingenregister ────────────────────────────────────────────────────────

type Ernst = 'hoog' | 'midden' | 'laag'
const GAPS: { titel: string; onderdeel: string; impact: string; ernst: Ernst; files: string }[] = [
  { titel: 'Pot-regels niet aangesloten op de engine', onderdeel: 'Voorkeuren', ernst: 'hoog', impact: 'Onttrekkingsvolgorde, verdeling-bij-toename en onttrekking-bij-afname worden opgeslagen, gevalideerd én getekend, maar bereiken runUnifiedProjection nooit. expandGroupsToAssetTypes heeft 0 importers; de engine gebruikt altijd de hardcoded WATERFALL_ORDER.', files: 'lib/pot-rules.ts · lib/unified-projection.ts · components/future/regels/*' },
  { titel: 'Surplus kan niet naar schuldaflossing', onderdeel: 'Voorkeuren', ernst: 'hoog', impact: "Keuze 'schuld_aflossen' bij verdeling-toename doet niets; surplus gaat altijd naar investable buckets. 'Eerst de hypotheek aflossen' is niet te modelleren.", files: 'lib/unified-projection.ts (INVESTABLE_ASSET_TYPES)' },
  { titel: 'Inkomensgroei staat hard op 0', onderdeel: 'Voorkeuren / engine', ernst: 'hoog', impact: 'incomeGrowthRate is overal 0; sparen groeit alleen met inflatie. Carrièregroei/salarisstijging — een reële hefboom naar eerder FIRE — is niet instelbaar.', files: 'lib/hooks/use-horizon-fire-sim.ts:216 · lib/dashboard-data-loader.ts' },
  { titel: 'Opeethypotheek-rente is display-only', onderdeel: 'Strategieën', ernst: 'hoog', impact: 'De schaduw-schuld van de opeethypotheek drukt niet op de simulatie (ADR 0012 erkent dit expliciet). FIRE-leeftijd/vermogen worden overschat: de lening wordt nooit afgelost, het huis blijft in het vermogen.', files: 'lib/housing-strategy.ts · components/app/horizon/horizon-client.tsx · docs/adr/0012-*' },
  { titel: 'Geen Box 1 in de projectie', onderdeel: 'Belasting', ernst: 'hoog', impact: 'AOW/pensioen stromen onbelast binnen (AOW als netto-constante, pensioen bruto). Geen loonheffing per jaar → besteedbaar pensioeninkomen wordt overschat. box1-tax.ts bestaat maar wordt niet gebruikt in de sim.', files: 'lib/fire-simulation.ts · lib/horizon-data.ts · lib/box1-tax.ts' },
  { titel: '/core wijkt af van /toekomst & /dashboard', onderdeel: 'Databedrading', ernst: 'hoog', impact: 'fire-target-shared gebruikt alleen monthlyContributions×12 als sparen (negeert spaarquote + override) en past geen huis-filtering toe → andere FIRE-datum voor dezelfde gebruiker, ondanks claim van identieke output.', files: 'lib/fire-target-shared.ts:82,86' },
  { titel: 'Twee engines naast elkaar', onderdeel: 'Engines', ernst: 'midden', impact: 'runUnifiedProjection (grafiek) vs legacy runSimulation (fee-analyse, hypotheek-vs-beleggen, deel household). De AOW/Pensioen-previews draaien op de oude engine → kunnen afwijken van de echte grafiek. Alleen de Huis-preview is consistent.', files: 'lib/strategy-preview.ts · lib/fee-analysis.ts · lib/hypotheek-vs-beleggen.ts · lib/household-projection.ts' },
  { titel: 'Overbruggingsfase heeft geen eigen gedrag', onderdeel: 'Werking', ernst: 'midden', impact: "transition en withdrawal zijn rekenkundig identiek. 'Vóór AOW anders/meer uitgeven dan erna' is niet als strategie uit te drukken, alleen met handmatige cashflows.", files: 'lib/unified-projection.ts (decumulatie-loop)' },
  { titel: 'Vrijgekomen geld na afgeloste schuld weggegooid', onderdeel: 'Inflatie & rendement', ernst: 'midden', impact: 'freedSurplus (vrijgekomen maandlasten na een afgeloste schuld) wordt berekend maar nooit herbelegd — "wat gebeurt er als de hypotheek weg is" is niet zichtbaar.', files: 'lib/unified-projection.ts:687,1524,1816' },
  { titel: 'Eenmalige meevallers gedwongen belegd', onderdeel: 'Gebeurtenissen', ernst: 'midden', impact: 'Erfenis/verkoopopbrengst wordt altijd over investable buckets verdeeld; "in cash houden" of "schuld mee aflossen" kan niet.', files: 'lib/unified-projection.ts:1490' },
  { titel: 'Box 3 bevroren op 2026 + negeert schulden', onderdeel: 'Belasting', ernst: 'midden', impact: 'BOX3_YEAR=2026 vast over de hele horizon; de schuld-offset/schuldendrempel uit de echte Box 3-berekening wordt in de projectie niet toegepast.', files: 'lib/unified-projection.ts:255 · lib/box3-data.ts' },
  { titel: 'Geen volatiliteit / sequence-of-returns op de hoofdlijn', onderdeel: 'Werking', ernst: 'midden', impact: 'Vast jaarrendement per asset; Monte-Carlo en backtest bestaan alleen als aparte widgets, niet op de primaire lijn. "Wat als de markt crasht net bij FIRE" alleen via een handmatige marktschok.', files: 'lib/unified-projection.ts · lib/phase-monte-carlo.ts · runBacktest' },
  { titel: 'Geen "huis kopen" als strategie', onderdeel: 'Strategieën', ernst: 'midden', impact: 'De Huis-strategie modelleert alleen de exit van een bestaand huis. Een toekomstige aankoop kan alleen als los life-event; house_purchase-metadata valt in de generieke fallback en wordt deels genegeerd.', files: 'lib/fire-simulation.ts (lifeEventsToCashflows)' },
  { titel: 'Aflossingsvrij na einddatum bevriest rente naar 0', onderdeel: 'Inflatie & rendement', ernst: 'laag', impact: 'Loopt het schema af met saldo > 0, dan stopt de rente — onderschat de kosten van een doorlopende aflossingsvrije structuur.', files: 'lib/unified-projection.ts:698' },
  { titel: 'VPW × niet-deplete = lege grafiek', onderdeel: 'Voorkeuren', ernst: 'laag', impact: 'VPW-onttrekking levert lege rijen bij perpetual/legacy/pensioen; in de UI afgevangen, maar de combinatie is gewoon niet mogelijk.', files: 'lib/unified-projection.ts:972' },
  { titel: 'Bucket-strategie half geïmplementeerd', onderdeel: 'Voorkeuren', ernst: 'laag', impact: 'De 3-bucket-rebalancing draait niet echt in de engine; het is een benadering via de asset-waterfall i.p.v. een echte cash/obligatie/aandelen-glidepath.', files: 'lib/withdrawal-strategy.ts:417' },
  { titel: 'Pensioen-annuïteit vast op 1,5% reëel', onderdeel: 'Strategieën', ernst: 'laag', impact: 'annuitizePension gebruikt een vast reëel rendement, los van de eigen expected_return-aanname.', files: 'lib/horizon-data.ts:315' },
  { titel: 'marginaal_tarief genegeerd door de grafiek', onderdeel: 'Voorkeuren', ernst: 'laag', impact: 'Wordt geresolved maar nergens door runUnifiedProjection gelezen; raakt alleen de Box 1-pagina.', files: 'lib/fire-params.ts' },
  { titel: 'target_savings_rate is een doel, geen graph-input', onderdeel: 'Voorkeuren', ernst: 'laag', impact: 'De projectie gebruikt het werkelijke/afgeleide sparen, niet het ingestelde spaardoel (alleen monthly_savings_override stuurt de lijn).', files: 'lib/savings-source.ts' },
  { titel: 'Engine is jaarlijks (geen maand-granulariteit)', onderdeel: 'Werking', ernst: 'laag', impact: 'Intra-jaar-timing van verkoop/huur/uitputting wordt benaderd (begin-jaar-injectie + buffer compenseert).', files: 'docs/adr/0012-*' },
]

const ERNST_CLR: Record<Ernst, string> = {
  hoog: 'var(--negative)',
  midden: 'var(--color-horizon-700)',
  laag: 'var(--ink-4)',
}

function Register() {
  return (
    <div className="overflow-x-auto border border-[var(--border-ed)]">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-[var(--ink)] bg-[var(--subtle)] text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            <th className="p-2 font-semibold">Beperking</th>
            <th className="p-2 font-semibold">Onderdeel</th>
            <th className="p-2 font-semibold">Impact</th>
            <th className="p-2 font-semibold">Ernst</th>
            <th className="p-2 font-semibold">Bestanden</th>
          </tr>
        </thead>
        <tbody>
          {GAPS.map((g, i) => (
            <tr key={i} className="border-b border-[var(--border-ed)] align-top">
              <td className="p-2 font-medium text-[var(--ink)]">{g.titel}</td>
              <td className="p-2 whitespace-nowrap text-[var(--ink-3)]">{g.onderdeel}</td>
              <td className="p-2 text-[var(--ink-2)]">{g.impact}</td>
              <td className="p-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: ERNST_CLR[g.ernst] }}>
                  {g.ernst}
                </span>
              </td>
              <td className="p-2">
                <F>{g.files}</F>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── inhoudsopgave ───────────────────────────────────────────────────────────────

const TOC = [
  ['werking', '1 · Werking van de grafiek'],
  ['voorkeuren', '2 · Voorkeuren & instellingen'],
  ['gebeurtenissen', '3 · Levensgebeurtenissen'],
  ['strategieen', '4 · De 3 multi-step strategieën'],
  ['uitgave-pensioen', '5 · Uitgave na pensioen'],
  ['inflatie-rendement', '6 · Inflatie & rendement (asset/schuld)'],
  ['belasting', '+ Belasting (Box 1 / Box 3)'],
  ['engines', '+ Engines & databedrading'],
  ['beperkingen', '⚠ Beperkingenregister'],
]

// ── pagina ───────────────────────────────────────────────────────────────────────

export default function GrafiekWerkingPage() {
  return (
    <div className="max-w-3xl space-y-10 pb-16">
      {/* header */}
      <header className="space-y-3">
        <span className="inline-block border border-[var(--negative)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--negative)]">
          Tijdelijk · werkdocument
        </span>
        <h1 className="text-2xl font-bold text-[var(--ink)] sm:text-3xl">Werking van de FIRE-grafiek</h1>
        <p className="max-w-[62ch] text-sm leading-relaxed text-[var(--ink-2)]">
          Complete functionele omschrijving van de toekomst-grafiek (<F>/toekomst</F>) — fases, snijpunt, weergaves, voorkeuren,
          gebeurtenissen, strategieën, uitgave na pensioen en het effect van inflatie/rendement op vermogen en schuld. Bedoeld als
          basis om daarna per onderdeel een technische analyse te doen en de werking (geheel of in delen) te herzien. Bewust statisch.
        </p>
        <p className="text-[12px] text-[var(--ink-3)]">
          Canonieke engine: <C>runUnifiedProjection</C> (<F>lib/unified-projection.ts</F>). Gecureerde tegenhanger:{' '}
          <a className="underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]" href="/beheer/architectuur?view=berekeningen">
            Berekeningen-view
          </a>
          .
        </p>
        <p className="text-[12px] text-[var(--ink-3)]">
          Werkende tabel-engine (Fase 1):{' '}
          <a className="underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]" href="/beheer/horizon-tabellen">
            Horizon-tabellen (engine v2)
          </a>{' '}
          — grootboek, V_op × V_nodig, snijpunt en tabellen A–G op voorbeelddata.
        </p>
      </header>

      {/* TOC */}
      <nav aria-label="Inhoud" className="border-y border-[var(--border-ed)] py-3">
        <ul className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-[var(--ink-2)] underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* 1 — Werking */}
      <Sec id="werking" kicker="1 · De grafiek" title="Werking van de grafiek">
        <Sub>1a · Algemeen & het FIRE-snijpunt</Sub>
        <p>
          De grafiek zet het <strong>netto vermogen</strong> uit tegen je leeftijd, jaar voor jaar tot de eindleeftijd. Hij draait
          op de canonieke engine <C>runUnifiedProjection</C>, client-side aangeroepen via de hook <C>useHorizonFireSim</C> (de oude{' '}
          <C>runSimulation</C> is hier vervangen). De engine is een pure functie zonder database.
        </p>
        <p>
          Het <strong>FIRE-moment (snijpunt)</strong> is géén simpele <C>uitgaven / SWR</C>-lijn. Het is de eerste leeftijd waarop het
          netto vermogen ≥ een <strong>via binary search bepaald &ldquo;benodigd vermogen&rdquo;</strong> is. Dat benodigd vermogen
          verschilt per eindstrategie (deplete / legacy / perpetual / pensioen): de binary search zoekt het minimale startvermogen
          waarmee een lichte onttrekkings-simulatie het einddoel van de strategie haalt. Binnen het FIRE-jaar wordt fractioneel
          geïnterpoleerd (<C>fireAgeFractional</C>) zodat de markering exact op de lijn valt.
        </p>
        <Snijpunt />

        <Sub>1b · Weergaves: lijn, bar, in/uit</Sub>
        <p>Custom SVG (geen recharts). Twee hoofdmodi (<C>chartMode</C>) plus een uitklapbaar in/uit-paneel:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Vermogenspad (lijn)</strong> — <C>SimChart</C>. Eén netto-vermogenlijn, in twee kleuren gesplitst op het FIRE-punt
            (goud = opbouw, bruin = afbouw). Decompositie (sparen/rendement/onttrekking) alleen in de hover-tooltip.
          </li>
          <li>
            <strong>Vermogensopbouw (bar)</strong> — <C>WealthCompositionChart</C>. Gestapelde staaf per jaar: 5 vermogensgroepen
            omhoog (spaargeld, beleggingen, pensioen, vastgoed, overig), schuld als rode laag omlaag.
          </li>
          <li>
            <strong>Inkomen &amp; Uitgaven (in/uit)</strong> — <C>IncomeExpenseChart</C>, uitklapbaar, met sub-modi{' '}
            <em>Lijnen</em> (aanvulling vs onttrekking + surplus/tekort-vlak) en <em>Bronnen</em> (gestapelde butterfly-bars per
            bron: sparen, rendement, onttrekking, Box 3, rente, per life-event).
          </li>
        </ul>

        <Sub>1c · Fases: opbouw, overbrugging, onttrekking</Sub>
        <p>
          De engine kent <strong>drie fases</strong> als veld op elke rij (<C>phase</C>): <C>accumulation</C> (opbouw, leeftijd &lt;
          FIRE), <C>transition</C> (overbrugging, FIRE → AOW) en <C>withdrawal</C> (vanaf AOW). De overgangen worden getriggerd door
          het FIRE-moment (binary search) en de AOW-leeftijd (<C>NL_AOW_AGE = 67</C>, of de echte AOW-tabel). In pensioen-modus is
          het FIRE-moment exogeen = AOW (<C>forcedFireAge</C>) en is er geen overbruggingsfase.
        </p>
        <FaseTijdas />

        <Sub>1d · Bijdrage per fase</Sub>
        <p>
          Welk onderdeel werkt in welke fase. Kort gezegd: <strong>sparen alleen in opbouw</strong>, <strong>rendement in alle
          drie</strong> — bevestigd. Inflatie, cashflows en Box 3 werken eveneens overal; onttrekking pas vanaf FIRE.
        </p>
        <div className="overflow-x-auto border border-[var(--border-ed)]">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--ink)] bg-[var(--subtle)] text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                <th className="p-2 font-semibold">Onderdeel</th>
                <th className="p-2 text-center font-semibold">Opbouw</th>
                <th className="p-2 text-center font-semibold">Overbrugging</th>
                <th className="p-2 text-center font-semibold">Onttrekking</th>
                <th className="p-2 font-semibold">Hoe toegepast</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((r, i) => (
                <tr key={i} className="border-b border-[var(--border-ed)] align-top">
                  <td className="p-2 font-medium text-[var(--ink)]">{r.onderdeel}</td>
                  <td className="p-2 text-center font-mono text-[var(--ink-2)]">{r.opbouw}</td>
                  <td className="p-2 text-center font-mono text-[var(--ink-2)]">{r.overbrugging}</td>
                  <td className="p-2 text-center font-mono text-[var(--ink-2)]">{r.onttrekking}</td>
                  <td className="p-2 text-[var(--ink-2)]">{r.hoe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Sub>Volgorde van bewerkingen per jaar</Sub>
        <p>
          Belangrijk voor de herziening: de exacte volgorde verschilt per fase. In de opbouw groeit het rendement op de startwaarde
          (contributies worden daarná toegevoegd); in de afbouw wordt eerst onttrokken en dán groeit het restant.
        </p>
        <JaarIteratie />
      </Sec>

      {/* 2 — Voorkeuren */}
      <Sec id="voorkeuren" kicker="2 · /toekomst/voorkeuren" title="Voorkeuren & instellingen">
        <Sub>Markt-aannames</Sub>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Verwacht bruto rendement</strong> — <F>profiles.expected_return</F> (default 7%). Alleen fallback; per-asset rendement wint.</li>
          <li><strong>Inflatie</strong> — <F>profiles.inflation_rate</F> (default 2%). Indexeert uitgaven, sparen, cashflows.</li>
          <li><strong>Effectief SWR</strong> — afgeleid (niet opgeslagen): <C>max(0,001; bruto − Box3-drag − inflatie)</C>. Voedt het fallback-FIRE-doel en de vrijheids-%-noemer.</li>
        </ul>
        <Sub>Regels op de tijdas</Sub>
        <p>Vijf regels; twee sturen de engine echt, drie zijn nu illustratief:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Eindstrategie</strong> (live-sim) — perpetual / legacy / deplete / <em>pensioen</em> + eindleeftijd (90) + nalatenschap. Bepaalt het &ldquo;benodigd vermogen&rdquo;.</li>
          <li><strong>Onttrekkingsstrategie</strong> (live-sim) — static / guardrails / vpw / bucket + guardrail-parameters.</li>
          <li><strong>Onttrekkingsvolgorde, Verdeling-bij-toename, Onttrekking-bij-afname</strong> (pot-regels) — opgeslagen in <F>profiles.pot_rules</F> op 5-groep-niveau.</li>
        </ul>
        <Gap>
          De drie pot-regels worden opgeslagen, gevalideerd én gevisualiseerd, maar <strong>bereiken de engine niet</strong> — de
          grafiek gebruikt altijd de hardcoded waterfall. Inclusief de optie &ldquo;schuld aflossen&rdquo; bij toename. Zie het register.
        </Gap>
        <Note>
          Let op: twee grote hefbomen staan <strong>niet</strong> op deze pagina — de huis-strategie staat onder <F>/mijn</F>-instellingen
          en het rendement per vermogensgroep onder <F>/overzicht/bezittingen</F>.
        </Note>
      </Sec>

      {/* 3 — Gebeurtenissen */}
      <Sec id="gebeurtenissen" kicker="3 · /toekomst/gebeurtenissen" title="Levensgebeurtenissen">
        <p>
          Een life-event (tabel <F>life_events</F>) wordt via <C>lifeEventsToCashflows</C> omgezet naar <C>SimCashflow</C>&rsquo;s:
          recurring of eenmalig, inkomen of uitgave, met <C>fromAge</C>/<C>toAge</C>, een <C>indexed</C>-vlag en optioneel{' '}
          <C>portfolioPct</C> (marktschok). Cashflows worden in <strong>beide fases</strong> elk jaar geëvalueerd; eenmalige vallen
          aan het begin van het jaar.
        </p>
        <p>
          Sommige types hebben eigen, gefaseerde logica: <strong>kinderen</strong> (NIBUD-kosten per leeftijdsfase + kinderbijslag),{' '}
          <strong>erfenis</strong> (netto na erfbelasting), <strong>marktschok</strong> (× portfolio), <strong>uitvaart</strong>. Vrije
          velden lopen via een generieke fallback (<C>one_time_cost</C>, <C>monthly_cost_change</C>, <C>monthly_income_change</C>,{' '}
          <C>duration_months</C>) of via eigen sub-cashflows in <C>metadata.cashflows</C> (o.a. de downsize-verkoop).
        </p>
      </Sec>

      {/* 4 — Strategieën */}
      <Sec id="strategieen" kicker="4 · Multi-step" title="De 3 multi-step strategieën">
        <p>Drie beheerde strategieën: <strong>AOW</strong>, <strong>Pensioen</strong> en <strong>Huis</strong>.</p>
        <Sub>AOW</Sub>
        <p>
          Eén echt life-event (<C>event_type=&apos;aow&apos;</C>). Multi-step = ingangsleeftijd (default wettelijk) × leefsituatie
          (alleenstaand/samenwonend → ander basisbedrag) × jaren-buiten-NL (opbouwkorting 2%/jaar). Levert een levenslange,
          geïndexeerde inkomen-cashflow; visualiseert ook de AOW-gat-jaren tussen FIRE en AOW.
        </p>
        <Sub>Pensioen</Sub>
        <p>
          Lijst-editor van meerdere potten (bedrijf, lijfrente levenslang/bancair, tijdelijke oudedagslijfrente), elk een eigen
          life-event (<C>event_type=&apos;pension&apos;</C>). Per pot: ingangsleeftijd, invoermodus &ldquo;maand&rdquo; (bekend bruto) of
          &ldquo;pot&rdquo; (kapitaal → geannuïteerd via <C>annuitizePension</C>), uitkeringsduur (levenslang/20/10/5), indexatie,
          partner-%.
        </p>
        <Sub>Huis</Sub>
        <p>
          Géén events maar een <strong>config-object</strong> (<F>profiles.housing_strategy_config</F>). Vier modi:{' '}
          <C>include_full</C> (default), <C>exclude_from_fire</C>, <C>downsize</C> (verkopen) en <C>reverse_mortgage</C>
          (opeethypotheek). Twee triggers: <C>fixed_age</C> en <C>on_depletion</C> (&ldquo;wanneer nodig&rdquo;).
        </p>
        <Note>
          <strong>ADR 0012:</strong> de &ldquo;wanneer nodig&rdquo;-trigger wordt afgeleid uit dezelfde unified-projection als de grafiek,
          via een capped vaste-punt-iteratie in <F>lib/housing-trigger.ts</F>. Daardoor valt het verkoop-moment per constructie samen
          met het moment waarop het liquide vermogen in de grafiek opraakt. Downsize geeft verkoopopbrengst + bespaarde hypotheek +
          nieuwe woonkosten; reverse geeft een maand-uitkering (huis blijft in de pot).
        </Note>
        <Gap>
          AOW- en Pensioen-previews gebruiken nog de <strong>oude engine</strong> (<C>runSimulation</C> via <C>previewFireAge</C>) en
          kunnen daardoor afwijken van de echte grafiek; alleen de Huis-preview draait op <C>runUnifiedProjection</C>.
        </Gap>
      </Sec>

      {/* 5 — Uitgave na pensioen */}
      <Sec id="uitgave-pensioen" kicker="5 · Na pensioen" title="Bepaling van de uitgave na pensioen">
        <p>
          Eén functie: <C>computeRetirementExpenses</C> (<F>lib/budget-utils.ts</F>), met drie methodes (<C>retirement_expense_method</C>):
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>essential_budgets</strong> — som van de essentiële budgetten (jaarlijks). De &ldquo;need&rdquo;-uitgave.</li>
          <li><strong>custom_amount</strong> — een handmatig bedrag (huidige prijzen).</li>
          <li><strong>current_income</strong> — je blijft op huidig inkomensniveau besteden.</li>
        </ul>
        <p>
          Er is <strong>geen vast percentage</strong>. De engine gebruikt <strong>één</strong> <C>yearlyExpenses</C> voor de hele
          horizon; die stuurt alleen de onttrekking ná FIRE. De uitgaven vóór FIRE zitten impliciet in &ldquo;inkomen − sparen&rdquo;.
        </p>
        <Gap>
          Default-inconsistentie: onboarding zet <C>current_income</C>, terwijl lees-fallbacks <C>essential_budgets</C> aannemen.
        </Gap>
      </Sec>

      {/* 6 — Inflatie & rendement */}
      <Sec id="inflatie-rendement" kicker="6 · Asset & schuld" title="Effect van inflatie & rendement">
        <Sub>Inflatie</Sub>
        <p>
          Toegepast op uitgaven (afbouw), op de indexering van sparen (opbouw) en op geïndexeerde cashflows — <strong>niet</strong> op
          de assetgroei. Het rendement is dus <strong>nominaal</strong> en de hele projectie is nominaal; elke rij draagt een{' '}
          <C>inflationFactor</C> mee zodat de UI desgewenst naar reële termen kan herrekenen. Schulden worden niet apart geïnflateerd.
        </p>
        <Sub>Rendement op assets</Sub>
        <p>
          Per vermogensgroep een waarde-gewogen rendement (fallback = bruto rendement). Surplus gaat alleen naar investable buckets
          (beleggingen, crypto, vastgoed, deelneming). Afschrijvende assets (voertuigen) krijgen rendement 0 + lineaire afschrijving.
          Het eigen huis heeft een eigen rendement, geen Box 3, en staat als laatste in de onttrekkings-waterfall.
        </p>
        <Sub>Schulden</Sub>
        <p>
          Echte amortisatie (annuïteit / lineair / aflossingsvrij): rente loopt op, hoofdsom wordt afgelost, saldo telt (gewogen) mee
          in het netto vermogen. De <C>include_aflossing_in_savings</C>-vlag voorkomt dubbeltelling met de spaarquote.
        </p>
        <Gap>
          Vrijgekomen maandlasten na een afgeloste schuld (<C>freedSurplus</C>) worden berekend maar weggegooid; en de Box 3 in de
          projectie kent geen schuld-offset. Zie het register.
        </Gap>
      </Sec>

      {/* + Belasting */}
      <Sec id="belasting" kicker="+ Aanvullend" title="Belasting (Box 1 / Box 3)">
        <Sub>Box 1 — afwezig in de projectie</Sub>
        <p>
          De projectie past <strong>geen Box 1</strong> toe. AOW (netto-constanten) en pensioen (bruto/geannuïteerd) stromen als
          besteedbaar inkomen binnen, zonder loonheffing per jaar. De volledige <F>lib/box1-tax.ts</F> wordt alleen op de
          belasting-pagina gebruikt, niet in de tijdas.
        </p>
        <Sub>Box 3 — jaarlijkse drag</Sub>
        <p>
          Per asset een forfaitaire drag (<C>forfait × 36%</C>), na heffingsvrij vermogen (€59.357 / €118.714 in 2026), elk jaar van
          het lopende vermogen afgetrokken. Het belastingjaar is bevroren op <C>BOX3_YEAR = 2026</C>.
        </p>
      </Sec>

      {/* + Engines & databedrading */}
      <Sec id="engines" kicker="+ Aanvullend" title="Engines & databedrading">
        <Sub>Twee engines</Sub>
        <p>
          <C>runUnifiedProjection</C> (canoniek, de grafiek) heeft per-asset rendement + Box 3, echte schuld-amortisatie en drie
          fases. De legacy <C>runSimulation</C> (vlakke Box 3, één portfolio-scalar, twee fases, grow-then-withdraw) voedt nog
          fee-analyse, hypotheek-vs-beleggen, deel van de household-projectie én de AOW/Pensioen-previews — een latente bron van
          afwijkingen.
        </p>
        <Sub>Databedrading</Sub>
        <DataStroom />
        <p className="mt-3">
          Sparen wordt geresolved via <C>resolveSavingsSource</C> (prioriteit: maand-override → spaarquote × inkomen →
          asset-contributie), met de aflossing-dubbeltel-guard. <C>effective-financials</C> bepaalt het effectieve inkomen/uitgaven
          (handmatig wint). Huishoud-/partnerperspectief raakt alleen de FIRE-aggregaten.
        </p>
      </Sec>

      {/* ⚠ Beperkingenregister */}
      <Sec id="beperkingen" kicker="⚠ Voor de herziening" title="Beperkingenregister">
        <p>
          De concrete &ldquo;strategieën en impact die we nu niet kunnen meenemen in de weergave of berekening&rdquo; — de basis voor
          de technische analyse per onderdeel. Gesorteerd op ernst.
        </p>
        <Register />
        <p className="text-[12px] text-[var(--ink-3)]">
          Grootste hefbomen voor de herziening: pot-regels aansluiten (incl. schuld-aflossen), inkomensgroei, een echte
          overbruggingsfase, opeethypotheek-rente in de simulatie en het gelijktrekken van /core + de twee engines.
        </p>
      </Sec>
    </div>
  )
}
