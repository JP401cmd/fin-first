/* ─────────────────────────────────────────────────────────────
   Roadmap & Feature Gap Analyse
   Vergelijking met 30+ budgeting & wealth management apps
   ───────────────────────────────────────────────────────────── */

const FASE_A_FEATURES = [
  {
    nr: 1,
    name: 'Pensioen Unified Timeline',
    description:
      'AOW-leeftijd, werkgeverspensioen (UPO) en eigen vermogen op een geintegreerde tijdlijn. De AOW-tabel en pensioen PDF upload bestaan al \u2014 maar een visuele tijdlijn die toont \u201cMet 52 FIRE, AOW bridge 52\u201367 uit eigen vermogen, dan AOW + pensioen erbij\u201d ontbreekt. Dit is de ontbrekende schakel die De Horizon compleet maakt.',
    competitors: 'Boldin (Social Security Explorer), ProjectionLab (pensioen modeling)',
    priority: 'Hoog',
  },
  {
    nr: 2,
    name: 'Rebalancing Alerts & Advies',
    description:
      'De target_allocations tabel bestaat al in de database maar wordt nog niet actief gebruikt. Activeer dit: toon wanneer de portefeuille meer dan X% afwijkt van de target allocatie, en geef een concreet rebalancing advies (welke holdings kopen/verkopen). Integreer met de meldingen-widget.',
    competitors:
      'Wealthfront (automatisch), Betterment (automatisch), Empower (Investment Checkup)',
    priority: 'Hoog',
  },
  {
    nr: 3,
    name: 'Fee Analyzer (TER Impact)',
    description:
      'Bereken de totale jaarlijkse kosten van de beleggingsportefeuille op basis van TER (Total Expense Ratio) per holding. Toon het effect op de FIRE-datum: \u201cJe betaalt \u20acX/jaar aan fondsbeheer \u2014 dit kost je Y maanden vrijheid over 20 jaar.\u201d Holdings data met ISIN/ticker is er al \u2014 koppel aan een TER database of laat gebruikers TER per holding invoeren.',
    competitors: 'Empower (Fee Analyzer \u2014 best-in-class), Wealthica (fee reporting)',
    priority: 'Hoog',
  },
  {
    nr: 4,
    name: 'Tijd-prijskaartje op Transacties',
    description:
      'De vrijheidstijd-filosofie (\u201cgeld is opgeslagen tijd\u201d) consequent doorvoeren naar individuele transacties. Elke transactie toont automatisch hoeveel uur/dagen werk het kostte, gebaseerd op het netto-uurloon. FreedomTimeBadge en calculateFreedomTime bestaan al \u2014 maar worden nog niet op transactieniveau getoond. Dit maakt de filosofie tastbaar in het dagelijks gebruik.',
    competitors: 'Niemand \u2014 dit is uniek voor TriFinity',
    priority: 'Middel',
  },
  {
    nr: 5,
    name: 'Financiele Gezondheids-score',
    description:
      'Een samenvattend getal (0\u2013100) dat de complete financiele gezondheid weergeeft. Combineer: spaarquote, schuldratio, noodfonds-dekking, FIRE-voortgang, portefeuille-diversificatie, budget-discipline. De veerkracht_score widget bestaat al (0\u2013100 resilience) \u2014 maar een bredere \u201cfinancial health score\u201d die ook gedrag en planning meeneemt ontbreekt. Toon trend over tijd.',
    competitors:
      'Niemand doet dit goed \u2014 Credit Karma heeft credit score maar dat is anders',
    priority: 'Middel',
  },
] as const

const FASE_B_FEATURES = [
  {
    nr: 6,
    name: 'Vermogensaanwasbelasting 2027 Simulator',
    description:
      'Nederland schakelt per 2027 over van forfaitair rendement naar belasting op werkelijk rendement (vermogensaanwasbelasting). Geen enkele app of tool bereidt gebruikers hierop voor. Bouw een simulator die toont: \u201cOnder het huidige systeem betaal je \u20acX, onder het nieuwe systeem \u20acY \u2014 dit is het effect op je FIRE-datum.\u201d Dit is een first-mover kans met directe PR-waarde.',
    competitors: 'Niemand \u2014 er bestaan alleen basis webtools van de Belastingdienst',
    priority: 'Hoog',
  },
  {
    nr: 7,
    name: 'Hypotheek: Aflossen vs Beleggen',
    description:
      'De grootste financiele vraag voor Nederlandse huishoudens: \u201cmoet ik extra aflossen op mijn hypotheek of dat geld beleggen?\u201d Bouw een vergelijkingsmodule die beide scenario\u2019s doorrekent inclusief hypotheekrenteaftrek, Box 3 impact, risico, en effect op FIRE-datum. Schulden- en beleggingsmodule bestaan al \u2014 de vergelijking ontbreekt.',
    competitors:
      'Boldin (real estate modeling), Wealthfront (home purchase planning), diverse NL hypotheek-vergelijkers (maar zonder FIRE-integratie)',
    priority: 'Hoog',
  },
  {
    nr: 8,
    name: 'Toeslagen Simulator',
    description:
      'Veel Nederlanders ontvangen huurtoeslag, zorgtoeslag of kindgebonden budget. Vermogensgroei kan leiden tot verlies van toeslagen \u2014 een verborgen \u201cbelasting\u201d die niemand berekent. Simuleer: \u201cBij \u20acX vermogen verlies je \u20acY aan toeslagen per jaar.\u201d Dit helpt gebruikers bij de timing van vermogensopbouw en de beslissing of snel sparen altijd slim is.',
    competitors: 'Niemand \u2014 alleen losse webtools van toeslagen.nl',
    priority: 'Middel',
  },
  {
    nr: 9,
    name: 'Zorgkosten Planning',
    description:
      'NL-specifiek: eigen risico optimalisatie (\u20ac385 vs \u20ac885), aanvullende verzekering kosten-baten analyse, zorgtoeslag drempelberekening. Jaarlijks terugkerende keuze die veel Nederlanders verkeerd maken. Integreer met de budget-module (categorie zorg) en de check-in.',
    competitors:
      'Boldin (US healthcare/Medicare \u2014 niet NL), Financieel Fit (verzekeringsfocus maar geen planning)',
    priority: 'Middel',
  },
  {
    nr: 10,
    name: 'Box 2 \u2194 Box 3 Optimalisatie (DGA Planning)',
    description:
      'Voor DGA\u2019s/ondernemers: wanneer dividend uitkeren uit de BV? Hoeveel in Box 2 laten vs overhevelen naar prive (Box 3)? Optimale timing van BV-liquidatie bij FIRE. De Box 2 module bestaat al \u2014 maar de strategische planning \u201cwanneer en hoeveel\u201d ontbreekt. Relevant voor ~400.000 DGA\u2019s in Nederland.',
    competitors: 'Niemand \u2014 fiscalisten doen dit handmatig voor \u20ac200+/uur',
    priority: 'Middel',
  },
] as const

const FASE_C_FEATURES = [
  {
    nr: 11,
    name: 'Cashflow Forecasting (30/60/90 dagen)',
    description:
      'Vooruitkijkend saldo: wanneer worden welke rekeningen afgeschreven, wanneer komt salaris, wat is het verwachte saldo over 30/60/90 dagen? Gebruik recurring transaction detection (bestaat al) om een voorspelling te bouwen. Waarschuw bij verwachte negatieve saldi. Monarch en Simplifi bieden dit \u2014 het is een \u201csticky\u201d feature die dagelijks gebruik stimuleert.',
    competitors:
      'Monarch Money (cashflow forecasting), Simplifi (12-maanden forecast), PocketGuard (bill calendar)',
    priority: 'Hoog',
  },
  {
    nr: 12,
    name: 'Besteedbaar Inkomen (\u201cHoeveel kan ik uitgeven?\u201d)',
    description:
      'Een groot getal bovenaan: \u201cJe kunt vandaag nog \u20acX vrij besteden.\u201d Berekend uit: saldo \u2212 gereserveerd voor vaste lasten \u2212 spaardoelen \u2212 buffer. PocketGuard noemt dit \u201cIn My Pocket\u201d en het is hun meest geliefde feature. Simpel maar krachtig \u2014 beantwoordt de #1 vraag die mensen aan hun budget-app stellen.',
    competitors:
      'PocketGuard (\u201cIn My Pocket\u201d / \u201cLeftover\u201d), Simplifi (Spending Plan daily available)',
    priority: 'Hoog',
  },
  {
    nr: 13,
    name: 'Spending Patterns AI',
    description:
      'Machine learning die patronen herkent in uitgaven: seizoenseffecten, lifestyle inflation, categorie-verschuivingen, anomalieen. \u201cJe besteedt 30% meer aan boodschappen dan 3 maanden geleden\u201d of \u201cJe horeca-uitgaven stijgen elk kwartaal.\u201d Spending patterns lib bestaat al (lib/spending-patterns.ts) \u2014 activeren en uitbreiden met AI.',
    competitors: 'Copilot Money (per-user ML model \u2014 best-in-class), Monarch (AI insights)',
    priority: 'Middel',
  },
  {
    nr: 14,
    name: 'Financieel Rapport PDF Export',
    description:
      'Genereer een professioneel PDF-rapport met vermogensoverzicht, budget performance, FIRE-voortgang, en trends. Bruikbaar voor: hypotheekadviseur, financieel planner, partner, of eigen archief. Rapportages module bestaat al \u2014 PDF export toevoegen.',
    competitors:
      'Simplifi (tax reports), Boldin (comprehensive reports), Kubera (Excel/ZIP export)',
    priority: 'Middel',
  },
  {
    nr: 15,
    name: 'Community Benchmarks (Anoniem)',
    description:
      'Anonieme, privacy-first vergelijking: \u201cHoe doe ik het vergeleken met andere FIRE-strijders in mijn leeftijdscategorie?\u201d Vergelijk op basis van: spaarquote, FIRE-voortgang, portefeuille-allocatie. NIBUD benchmark bestaat al voor budgetten \u2014 dit is de FIRE-equivalent. Kan starten met aggregated data, geen individuele gegevens delen.',
    competitors:
      'Niemand doet dit goed \u2014 Boldin heeft een PeerScore maar beperkt',
    priority: 'Laag',
  },
] as const

const FASE_D_FEATURES = [
  {
    nr: 16,
    name: 'Document Vault / Financiele Kluis',
    description:
      'Alle financiele documenten op een plek: polissen, testamenten, contracten, jaaropgaves, belastingaangiftes. Pensioen PDF opslag bestaat al via Supabase Storage \u2014 uitbreiden naar een volledige kluis met categorisatie, vervaldatum-alerts, en delen met partner. Kubera vraagt $249/jaar voor vergelijkbare functionaliteit.',
    competitors: 'Kubera (encrypted document vault \u2014 premium feature)',
    priority: 'Middel',
  },
  {
    nr: 17,
    name: 'Nalatenschapsplanning (\u201cDead Man\u2019s Switch\u201d)',
    description:
      'Bij langdurige inactiviteit automatisch een vertrouwenspersoon informeren. Stel in: \u201cAls ik 30 dagen niet inlog, stuur een email naar [partner] met toegang tot mijn financieel overzicht.\u201d Inclusief: wie krijgt wat, waar staan de documenten, contactgegevens adviseurs. Huishouden-systeem en delen-functionaliteit bestaan al \u2014 uitbreiden met inactiviteit-detectie.',
    competitors:
      'Kubera (\u201cLife Beat\u201d / Dead Man\u2019s Switch \u2014 hun meest onderscheidende feature)',
    priority: 'Middel',
  },
  {
    nr: 18,
    name: 'Internationale Belasting Vergelijking',
    description:
      'Voor FIRE-emigranten: vergelijk je belastingdruk in NL vs Portugal vs Spanje vs Belgie vs Duitsland. Hoeveel sneller bereik je FIRE in een ander land? Box 3 engine bestaat \u2014 bouw vergelijkbare engines voor populaire FIRE-bestemmingen. Relevant voor de groeiende groep digital nomads en FIRE-emigranten.',
    competitors:
      'Niemand \u2014 ProjectionLab heeft tax presets voor enkele landen maar geen vergelijking',
    priority: 'Laag',
  },
  {
    nr: 19,
    name: 'API voor Derden',
    description:
      'Open API waarmee power users en developers eigen integraties kunnen bouwen: spreadsheet-koppelingen, custom dashboards, automatiseringen. YNAB\u2019s API is een van hun meest gewaardeerde features bij de tech-savvy FIRE-community. Start met read-only endpoints voor saldi, transacties, en FIRE-metrics.',
    competitors:
      'YNAB (public API), Kubera (first-party API), Wealthica (developer API + add-ons), Actual Budget (local API)',
    priority: 'Laag',
  },
  {
    nr: 20,
    name: 'Schenkbelasting Planner',
    description:
      'Optimale timing en strategie voor schenken aan kinderen of familie. Jaarlijkse vrijstellingen, eenmalig verhoogde vrijstelling, effect op eigen FIRE-datum vs voordeel voor ontvanger. Life events module heeft al schenkbelasting calculator \u2014 uitbreiden naar een volledige planner met meerjarenadvies.',
    competitors: 'Niemand \u2014 fiscalisten bieden dit als betaalde dienst',
    priority: 'Laag',
  },
] as const

/* ── Priority badge colors ────────────────────────────────── */
function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    Hoog: 'bg-red-50 text-red-700 border-red-200',
    Middel: 'bg-amber-50 text-amber-700 border-amber-200',
    Laag: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  }
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.06em] ${styles[priority] ?? styles.Middel}`}
    >
      {priority}
    </span>
  )
}

/* ── Feature card ─────────────────────────────────────────── */
function FeatureCard({
  nr,
  name,
  description,
  competitors,
  priority,
}: {
  nr: number
  name: string
  description: string
  competitors: string
  priority: string
}) {
  return (
    <div className="flex gap-4 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-colors hover:bg-[var(--subtle)]">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--subtle)] font-mono text-sm font-bold tabular-nums text-[var(--ink-2)]">
        {nr}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="font-display text-sm font-bold text-[var(--ink)]">{name}</p>
          <PriorityBadge priority={priority} />
        </div>
        <p className="mb-2.5 font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
          {description}
        </p>
        <p className="text-[11px] text-[var(--ink-3)]">
          <span className="font-semibold text-[var(--ink-2)]">Wie heeft het:</span>{' '}
          {competitors}
        </p>
      </div>
    </div>
  )
}

/* ── Phase section ────────────────────────────────────────── */
function PhaseSection({
  id,
  title,
  subtitle,
  accentColor,
  accentBg,
  features,
}: {
  id: string
  title: string
  subtitle: string
  accentColor: string
  accentBg: string
  features: ReadonlyArray<{
    readonly nr: number
    readonly name: string
    readonly description: string
    readonly competitors: string
    readonly priority: string
  }>
}) {
  return (
    <section
      className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6"
      style={{ borderLeftWidth: '3px', borderLeftColor: accentColor }}
    >
      <div className="mb-5">
        <div className="mb-1 flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ backgroundColor: accentBg, color: accentColor }}
          >
            {id}
          </span>
          <p className="font-display text-lg font-bold text-[var(--ink)]">{title}</p>
        </div>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">{subtitle}</p>
      </div>

      <div className="space-y-3">
        {features.map((f) => (
          <FeatureCard key={f.nr} {...f} />
        ))}
      </div>
    </section>
  )
}

/* ── Competitor group ─────────────────────────────────────── */
function CompetitorGroup({ title, apps }: { title: string; apps: string[] }) {
  return (
    <div>
      <p className="mb-2 font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {apps.map((app) => (
          <span
            key={app}
            className="rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2)]"
          >
            {app}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
export default function RoadmapPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <p className="mb-2 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
          Laatst bijgewerkt: maart 2026
        </p>
        <h2 className="font-display text-xl font-bold text-[var(--ink)]">
          Roadmap &amp; Feature Gap Analyse
        </h2>
        <p className="mt-1 font-serif text-sm text-[var(--ink-3)]">
          Vergelijking met 30+ budgeting &amp; wealth management apps &mdash; maart 2026
        </p>
      </header>

      {/* ─── Section 1: Concurrentiepositionering ─────────── */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-3 text-[var(--ink-4)]">Concurrentiepositionering</p>
        <p className="font-serif text-sm leading-relaxed text-[var(--ink-2)]">
          TriFinity combineert budgeting (YNAB-niveau), FIRE-planning (ProjectionLab-niveau) en
          NL-specifieke belastingkennis (Box&nbsp;3/AOW) met een AI-coach en
          vrijheidstijd-filosofie. Geen enkele concurrent biedt dit geheel. De app bevat 46+
          widgets, 60+ pagina&apos;s, 80+ API routes en volledige huishouden-ondersteuning.
        </p>
      </section>

      {/* ─── Section 2: Onderzochte concurrenten ──────────── */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-4 text-[var(--ink-4)]">Onderzochte concurrenten</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <CompetitorGroup
            title="Budgeting Apps (10)"
            apps={[
              'YNAB',
              'Monarch Money',
              'Copilot Money',
              'Simplifi (Quicken)',
              'PocketGuard',
              'Goodbudget',
              'EveryDollar',
              'Actual Budget',
              'Honeydue',
              'Tiller Money',
            ]}
          />
          <CompetitorGroup
            title="Wealth Management Tools (10)"
            apps={[
              'Empower',
              'Wealthfront',
              'Betterment',
              'Fidelity Full View',
              'Kubera',
              'ProjectionLab',
              'Boldin',
              'Delta (eToro)',
              'Stock Events',
              'Wealthica',
            ]}
          />
          <CompetitorGroup
            title="Nederlandse Markt (5)"
            apps={['MijnGeldzaken', 'Dyme', 'Grassfeld', 'Grip (gestopt)', 'Financieel Fit']}
          />
        </div>
      </section>

      {/* ─── Section 3: Feature Gaps ──────────────────────── */}
      <div>
        <p className="label-editorial mb-4 text-[var(--ink-4)]">
          Feature Gaps &mdash; Geprioriteerd
        </p>

        <div className="space-y-6">
          <PhaseSection
            id="Fase A"
            title="De Brug"
            subtitle="Bouw voort op wat er al is &mdash; maximaliseer waarde van bestaande data"
            accentColor="var(--kern-500)"
            accentBg="var(--kern-l, #fef3c7)"
            features={FASE_A_FEATURES}
          />

          <PhaseSection
            id="Fase B"
            title="Nederland-proof"
            subtitle="Onverslaanbare NL-positie &mdash; geen concurrent raakt hier aan"
            accentColor="var(--horizon-500)"
            accentBg="var(--horizon-l, #f3e8ff)"
            features={FASE_B_FEATURES}
          />

          <PhaseSection
            id="Fase C"
            title="Groei"
            subtitle="Features die nieuwe gebruikers aantrekken"
            accentColor="var(--wil-500)"
            accentBg="var(--wil-l, #ccfbf1)"
            features={FASE_C_FEATURES}
          />

          <PhaseSection
            id="Fase D"
            title="Premium"
            subtitle="Waarde waarvoor gebruikers willen betalen"
            accentColor="var(--ink-3)"
            accentBg="var(--subtle)"
            features={FASE_D_FEATURES}
          />
        </div>
      </div>

      {/* ─── Section 4: Bronnen & Methodologie ────────────── */}
      <details className="group rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
        <summary className="cursor-pointer select-none px-6 py-4 font-display text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]">
          Bronnen &amp; Methodologie
        </summary>
        <div className="border-t border-[var(--border-ed)] px-6 py-5">
          <p className="mb-4 font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
            Dit onderzoek is uitgevoerd in maart 2026 door analyse van de volledige TriFinity
            codebase (60+ pagina&apos;s, 80+ API routes, 46 widgets) en vergelijking met 30+
            concurrenten:
          </p>
          <div className="space-y-4">
            <div>
              <p className="mb-1 font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Budgeting (10)
              </p>
              <p className="font-serif text-[12px] leading-relaxed text-[var(--ink-2)]">
                YNAB, Monarch Money, Copilot Money, Simplifi, PocketGuard, Goodbudget,
                EveryDollar, Actual Budget, Honeydue, Tiller Money
              </p>
            </div>
            <div>
              <p className="mb-1 font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Wealth Management (10)
              </p>
              <p className="font-serif text-[12px] leading-relaxed text-[var(--ink-2)]">
                Empower, Wealthfront, Betterment, Fidelity Full View, Kubera, ProjectionLab,
                Boldin, Delta, Stock Events, Wealthica
              </p>
            </div>
            <div>
              <p className="mb-1 font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Nederlands/Europees (8)
              </p>
              <p className="font-serif text-[12px] leading-relaxed text-[var(--ink-2)]">
                MijnGeldzaken, Dyme, Grassfeld, Grip, Financieel Fit, Spendee, BudgetBakers
                Wallet, Toshl Finance, Emma
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
