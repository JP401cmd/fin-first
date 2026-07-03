import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Grafiek-werking — Beheer' }

/**
 * BEHEER-UITLEGPAGINA — gecureerde functionele referentie van de FIRE-/toekomst-grafiek.
 *
 * Beschrijft hoe de HORIZON-KERNEL (de maandbasis-, Excel-oracle-bewezen rekenkern —
 * `lib/horizon-kernel/`, solver `solveFire`, ADR 0032) de /toekomst-grafiek berekent:
 * fases, het FIRE-moment via de solver-bisectie, de maand-waterval, belasting, het
 * onttrekkingsprofiel, de wrappers (scenario-band, Monte Carlo) en een aandachtspunten-
 * register. Voor de stappen & tabellen zelf: `/beheer/horizon-kernel`. Bewust statisch
 * (geen live data) — een presentatie-/naslagdocument, geen productie-datapagina.
 *
 * De v2-grootboek-engine (`lib/horizon-engine/`, `runHorizonLedger`) draait tijdens de
 * migratie nog uitsluitend als TERUGVAL-arm achter de per-gebruiker-vlag
 * `horizon_kernel_convergentie` (default-flip = FASE 6 stap 3, fysieke v2-deletie =
 * stap 5) — niet meer als "de" werking.
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

/** Inline aandachtspunt-callout (rode linkerrand). */
function Gap({ children }: { children: ReactNode }) {
  return (
    <div className="border border-[var(--border-ed)] border-l-[3px] border-l-[var(--negative)] bg-[var(--paper)] p-3 text-[13px] text-[var(--ink-2)]">
      <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--negative)]">aandachtspunt</span>
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
        De maand-recursie loopt continu van maand 0 tot leeftijd 100; de fases zijn een label afgeleid van de FIRE-maand en de
        AOW-maand. Vóór FIRE is de onttrekking altijd 0 (surplus voedt de opbouw); vanaf FIRE draait de onttrekking. Overbrugging en
        onttrekking rekenen identiek — alleen de AOW/pensioen-inkomensbodem schakelt op de AOW-maand in.
      </figcaption>
    </figure>
  )
}

function SolverBisectie() {
  return (
    <figure className="my-2">
      <svg viewBox="0 0 480 200" className="w-full max-w-[520px]" role="img" aria-label="De solver bisecteert over de FIRE-maand: netto-liquide vermogen op de eindleeftijd tegen het doelbedrag">
        <line x1="40" y1="20" x2="40" y2="160" stroke="var(--ink-4)" strokeWidth="1" />
        <line x1="40" y1="160" x2="450" y2="160" stroke="var(--ink-4)" strokeWidth="1" />
        {/* netto-liquide (Prognose!J) — stijgt door surplus + rendement */}
        <polyline points="40,165 160,120 252,92 360,60 420,46" fill="none" stroke="var(--color-horizon-600)" strokeWidth="2.5" />
        {/* kandidaat-FIRE-maanden (bisectie) */}
        <line x1="150" y1="30" x2="150" y2="160" stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
        <line x1="352" y1="30" x2="352" y2="160" stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
        <text x="150" y="26" textAnchor="middle" className="fill-[var(--ink-4)]" fontSize="8.5" fontFamily="monospace">te vroeg</text>
        <text x="352" y="26" textAnchor="middle" className="fill-[var(--ink-4)]" fontSize="8.5" fontFamily="monospace">haalt doel</text>
        {/* gevonden FIRE-maand */}
        <circle cx="252" cy="92" r="4.5" fill="var(--color-horizon-600)" />
        <line x1="252" y1="92" x2="252" y2="160" stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 3" />
        <text x="252" y="174" textAnchor="middle" className="fill-[var(--color-horizon-700)]" fontSize="10" fontFamily="monospace">FIRE-maand</text>
        <text x="424" y="46" className="fill-[var(--color-horizon-700)]" fontSize="10" fontFamily="monospace">netto-liquide (J)</text>
      </svg>
      <figcaption className="mt-1 text-center text-[11px] italic text-[var(--ink-3)]">
        Geen <C>uitgaven / SWR</C>-lijn: <C>BepaalFIRE</C> bisecteert over de FIRE-<strong>maand</strong>. Per kandidaat draait de volledige
        maand-projectie tot leeftijd 100; de vroegste maand waarvan het <strong>netto-liquide vermogen</strong> (<C>Prognose!J</C>) op de
        eindleeftijd het doelbedrag haalt (€0 bij &ldquo;opeten&rdquo;, de nalatenschap/het behouden bedrag bij nalatenschap/eeuwigdurend) is FIRE.
        Bij &ldquo;pensioenleeftijd&rdquo; is FIRE exogeen = de AOW-leeftijd. De solver rapporteert een status: nu al bereikt, bereikt op leeftijd,
        onbereikbaar (+ €/mnd-extra-hint) of pensioen-tekort.
      </figcaption>
    </figure>
  )
}

/** De maand-waterval: de elf tabellen in rekenflow-volgorde per maand. */
function MaandWaterval() {
  const stappen: { t: string; d: string }[] = [
    { t: 'Werk-strategie + PT', d: 'reële salarisladder (gegate op FIRE) en partner-inkomen → extra inkomen naar de cashflow' },
    { t: 'CF — cashflow', d: 'inkomen − uitgaven (+ baten, − onttrekking na FIRE), nominaal gemaakt; kolom I = te verdelen extra geld' },
    { t: 'Bel — Box 3', d: 'forfaitaire (D–K) én werkelijke (L/M) heffing → canoniek (N); voedt de cashflow met één-maand-lag' },
    { t: 'Ont — onttrekkingsbehoefte', d: 'na FIRE: behoefte × onttrekkingsprofiel (Vast/Afnemend/Oplopend/Guardrails)' },
    { t: 'Af — kosten-gebeurtenissen', d: 'som van de geplande negatieve gebeurtenis-posten die deze maand actief zijn' },
    { t: 'Toename en afname', d: 'per categorie klaarzetten hoeveel er bij/af gaat, volgens de prio-gewichten (½^(prio−1))' },
    { t: 'Verdeling — waterval', d: 'capaciteit-waterval over de potten in passes; cap op saldo(m−1); reserve = prio 5; restant → tekort-lening' },
    { t: 'Bez — bezittingen', d: 'saldo(m−1) × rendement + nieuwe inleg; totalen per Box 3-type + woningblok (verkoop/opeethypotheek)' },
    { t: 'S — schulden', d: 'saldo(m−1) − aflossing + rente per pot; slot voor de tekort-lening (vangnet bij een maand-tekort)' },
    { t: 'Prognose', d: 'bezittingen − schulden = netto vermogen (I); netto-liquide (J) = zonder niet-liquide bezit — de FIRE-lijn' },
  ]
  return (
    <ol className="flex flex-col gap-2">
      {stappen.map((s, i) => (
        <li key={s.t} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-horizon-500)] font-mono text-[10px] font-bold text-white">
            {i + 1}
          </span>
          <div className="pb-0.5">
            <span className="text-[13px] font-semibold text-[var(--ink)]">{s.t}</span>
            <span className="text-[12px] text-[var(--ink-3)]"> — {s.d}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Databedrading: van DB naar grafiek. */
function DataStroom() {
  const chain = [
    { t: 'DB-tabellen', d: 'assets · debts · budgets · transactions · life_events · profiles · bank_accounts · pot_rules' },
    { t: 'Loaders (server)', d: 'horizon-data-loader.ts · dashboard-data-loader.ts → spaarquote, uitgaven, FIRE-params, strategieën, pot-regels' },
    { t: 'Client-hook', d: 'useHorizonFireSim — bouwt de v2-input én de rauwe kernel-context (profiel + assets/debts + life-events)' },
    { t: 'Convergentie-router', d: 'convergentie-router.ts → kernel (solveFire, achter de vlag) of v2 (runSelectedProjection, terugval); één beslispunt' },
    { t: 'Grafiek', d: 'SimChart (lijn) · WealthCompositionChart (bar) · IncomeExpenseChart (in/uit) — via de gedeelde result-vorm (bridge)' },
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
  { onderdeel: 'Sparen (surplus)', opbouw: '✓', overbrugging: '—', onttrekking: '—', hoe: 'CF!I → Verdeling-waterval naar de potten; alleen vóór FIRE' },
  { onderdeel: 'Rendement', opbouw: '✓', overbrugging: '✓', onttrekking: '✓', hoe: 'per pot op saldo(m−1) × rente/12 (Bez); nominaal' },
  { onderdeel: 'Inflatie', opbouw: '✓', overbrugging: '✓', onttrekking: '✓', hoe: 'reële invoer vooraf geïndexeerd (1+i)^(m/12); niet-geïndexeerde posten vooraf gede-indexeerd' },
  { onderdeel: 'Life-event cashflows', opbouw: '✓', overbrugging: '✓', onttrekking: '✓', hoe: 'baten → CF!H, kosten → Af; per maand actief tussen start- en eind-index' },
  { onderdeel: 'AOW / pensioen', opbouw: '(✓)', overbrugging: '✓', onttrekking: '✓', hoe: 'inkomensbodem vanaf ingangsleeftijd; verlaagt de behoefte-onttrekking' },
  { onderdeel: 'Onttrekking / uitgaven', opbouw: '—', overbrugging: '✓', onttrekking: '✓', hoe: 'behoefte × onttrekkingsprofiel (Ont) → Verdeling uit de potten' },
  { onderdeel: 'Box 3', opbouw: '✓', overbrugging: '✓', onttrekking: '✓', hoe: 'tabel Bel; canoniek (N) via de cashflow met één-maand-lag' },
  { onderdeel: 'Tekort-lening', opbouw: '(✓)', overbrugging: '(✓)', onttrekking: '(✓)', hoe: 'vangnet (S) dat bijspringt bij een maand-tekort; rente instelbaar, aflos-prio 1' },
]

// ── aandachtspunten-register (kernel) ───────────────────────────────────────────

type Ernst = 'hoog' | 'midden' | 'laag'
const GAPS: { titel: string; onderdeel: string; impact: string; ernst: Ernst; files: string }[] = [
  { titel: 'Flag-periode: v2-terugval voor specifieke machinerie', onderdeel: 'Engines', ernst: 'midden', impact: 'Achter de vlag draait /toekomst op de kernel; generieke (niet-huis) liquidaties die de kernel-mapping niet aankan (wanneer-nodig/datum-trigger, payoffDebtIds, prijs-fractie) én een ontbrekende rauwe context of een kernel-fout vallen schoon terug op v2 (detectV2OnlyMachinery). Woning-strategieën zijn kernel-native en vallen NIET terug.', files: 'lib/horizon-kernel/convergentie-router.ts · adapter/whatif-varianten.ts' },
  { titel: 'Geen Box 1-loonheffing in de projectie', onderdeel: 'Belasting', ernst: 'midden', impact: 'De kern rekent Box 3 (tabel Bel) maar geen Box 1 op AOW/pensioen-inkomen. AOW komt netto binnen, pensioen bruto/geannuïteerd; zonder jaarlijkse loonheffing wordt het besteedbaar pensioeninkomen overschat.', files: 'lib/horizon-kernel/tables/ (geen Box 1-tabel)' },
  { titel: 'Deterministische hoofdlijn; volatiliteit alleen in wrappers', onderdeel: 'Werking', ernst: 'midden', impact: 'De primaire lijn draait op een vast rendement per pot. Sequence-of-returns / "crash net bij FIRE" zit alleen in de scenario-band (RunScenarioBand) en Monte Carlo (RunMonteCarlo, deterministische sin-hash) als aparte wrappers, niet op de hoofdlijn.', files: 'lib/horizon-kernel/ (band/mc-wrappers)' },
  { titel: 'Toekomstige huis-aankoop niet als strategie', onderdeel: 'Strategieën', ernst: 'laag', impact: 'De woning-strategie modelleert alleen de EXIT van een bestaand huis (meerekenen/uitsluiten/verkopen/opeethypotheek). Een toekomstige aankoop kan alleen als los life-event via de generieke fallback.', files: 'lib/horizon-kernel/adapter/params.ts (buildWoning) · adapter/events.ts' },
  { titel: 'marginaal_tarief nog niet geconsumeerd', onderdeel: 'Belasting', ernst: 'laag', impact: 'Het marginale tarief wordt naar de kernel-adapter doorgegeven (params-interface + convergentie-router) maar nog niet gelezen door de werkelijk-Box 3-tak — een bewust bedradingsgat (adapter-default). Raakt alleen de "werkelijk rendement"-methode.', files: 'lib/horizon-kernel/adapter/params.ts · adapter/whatif-varianten.ts:149' },
  { titel: 'Eén belastingjaar over de hele horizon', onderdeel: 'Belasting', ernst: 'laag', impact: 'Bel gebruikt de fiscale parameters van één belastingjaar (BOX3_PARAMS[jaar]) over de volledige horizon. Heffingvrij vermogen en schuldendrempel worden wél geïndexeerd en de schulden tellen mee (forfaitSchuld + schuldendrempel), maar toekomstige wetswijzigingen niet.', files: 'lib/horizon-kernel/adapter/params.ts (buildBox3) · lib/box3-data.ts' },
  { titel: "Schuld-per-categorie-prio's nog niet geconsumeerd", onderdeel: 'Voorkeuren', ernst: 'laag', impact: "De V5-overlay legt expliciete BEZIT-per-categorie-prio's over de orde-groep-afleiding, maar SCHULD-per-categorie-prio's uit categorie_prios worden nog niet gelezen (wacht op oracle-fixture). De drie pot-regels (volgorde, verdeling-bij-toename incl. schuld-aflossen, onttrekking-bij-afname) worden wél gehonoreerd.", files: 'lib/horizon-kernel/adapter/prio-overgang.ts' },
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
            <th className="p-2 font-semibold">Aandachtspunt</th>
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
  ['beperkingen', '⚠ Aandachtspunten-register'],
]

// ── pagina ───────────────────────────────────────────────────────────────────────

export default function GrafiekWerkingPage() {
  return (
    <div className="max-w-3xl space-y-10 pb-16">
      {/* header */}
      <header className="space-y-3">
        <span className="inline-block border border-[var(--border-ed)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-horizon-700)]">
          Beheer · gecureerde uitleg
        </span>
        <h1 className="text-2xl font-bold text-[var(--ink)] sm:text-3xl">Werking van de FIRE-grafiek</h1>
        <p className="max-w-[62ch] text-sm leading-relaxed text-[var(--ink-2)]">
          Complete functionele omschrijving van de toekomst-grafiek (<F>/toekomst</F>) — fases, het FIRE-moment, weergaves, voorkeuren,
          gebeurtenissen, strategieën, uitgave na pensioen en het effect van inflatie/rendement op vermogen en schuld. De beschreven
          motor is de <strong>horizon-kernel</strong>: een maandbasis-rekenkern die de grafiek berekent <em>exact zoals</em> het eigen
          Excel-model (<F>Core calc v5.xlsm</F>, cel-voor-cel oracle-getest, ADR 0032). Bewust statisch.
        </p>
        <p className="text-[12px] text-[var(--ink-3)]">
          Stappen &amp; tabellen (live op je eigen data):{' '}
          <a className="font-medium text-[var(--color-horizon-700)] underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]" href="/beheer/horizon-kernel">
            Horizon-kernel — transparantie
          </a>{' '}
          (tab &ldquo;Stappen &amp; tabellen&rdquo;). Gecureerde tegenhanger:{' '}
          <a className="underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]" href="/beheer/architectuur?view=berekeningen">
            Berekeningen-view
          </a>
          .
        </p>
        <p className="text-[12px] text-[var(--ink-3)]">
          Migratie-status: tijdens FASE 6 draait /toekomst op de kernel achter de per-gebruiker-vlag <C>horizon_kernel_convergentie</C>;
          de oude <strong>v2-grootboek-engine</strong> (<C>runHorizonLedger</C>, <F>lib/horizon-engine/</F>) blijft uitsluitend als
          terugval-arm tot de fysieke deletie (default-flip = stap 3, deletie = stap 5).
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
        <Sub>1a · Algemeen & het FIRE-moment</Sub>
        <p>
          De grafiek zet je <strong>netto vermogen</strong> uit tegen je leeftijd. Hij draait op de <strong>horizon-kernel</strong>{' '}
          (<C>solveFire</C>, <F>lib/horizon-kernel/</F>): een <strong>maandbasis</strong>-recursie over index 0..1199 (tot leeftijd 100).
          De kern rekent <strong>nominaal</strong> — reële invoer wordt vooraf geïndexeerd met <C>(1+inflatie)^(m/12)</C> — met een
          structurele <strong>één-maand-lag</strong>: de belasting van maand <em>m</em> is de heffing over de saldi van <em>m−1</em>{' '}
          (<C>CF!K(m)=Bel!N(m−1)</C>), en rendement/capaciteit/pot-shares rekenen op het saldo van de vorige maand. De kern is puur
          (geen database) en wordt cel-voor-cel tegen 19 Excel-fixtures bewezen (tolerantie €0,01).
        </p>
        <p>
          Het <strong>FIRE-moment</strong> is géén simpele <C>uitgaven / SWR</C>-lijn. De solver (<C>BepaalFIRE</C>) doet een{' '}
          <strong>maand-bisectie</strong>: per kandidaat-FIRE-maand draait de volledige maand-projectie tot de eindleeftijd en toetst of
          het <strong>netto-liquide vermogen</strong> (<C>Prognose!J</C>) op de eindleeftijd het doelbedrag van de eindstrategie haalt
          (€0 bij &ldquo;opeten&rdquo;, de nalatenschap/het behouden bedrag bij nalatenschap/eeuwigdurend). De vroegste maand die slaagt is FIRE.
          De solver levert daarbij een expliciete status (<C>reached_now</C> / <C>reached_at</C> / <C>unreachable_within_horizon</C> met
          €/mnd-extra-hint / <C>pension_shortfall</C>, statusblok P!B93-B100).
        </p>
        <SolverBisectie />

        <Sub>1b · Weergaves: lijn, bar, in/uit</Sub>
        <p>
          Custom SVG (geen recharts). De kernel-uitkomst wordt via de bridge naar de gedeelde result-vorm gemapt, zodat dezelfde
          chart-componenten renderen als voorheen. Twee hoofdmodi (<C>chartMode</C>) plus een uitklapbaar in/uit-paneel:
        </p>
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
          De drie <strong>fases</strong> zijn een label dat volgt uit de FIRE-maand (bisectie) en de AOW-leeftijd (<C>NL_AOW_AGE = 67</C>,
          of de echte AOW-tabel): <strong>opbouw</strong> (vóór FIRE), <strong>overbrugging</strong> (FIRE → AOW) en{' '}
          <strong>onttrekking</strong> (vanaf AOW). De maand-recursie zelf loopt onafgebroken door; vóór FIRE is de onttrekking 0 en
          voedt het surplus de potten, ná FIRE draait de onttrekking. In &ldquo;pensioenleeftijd&rdquo;-modus is FIRE exogeen = AOW en is er
          geen overbruggingsfase.
        </p>
        <FaseTijdas />

        <Sub>1d · Bijdrage per fase</Sub>
        <p>
          Welk onderdeel werkt in welke fase. Kort gezegd: <strong>sparen (surplus) alleen in opbouw</strong>, <strong>rendement en
          Box 3 in alle drie</strong>; onttrekking pas vanaf FIRE; de tekort-lening springt alleen bij een echt maand-tekort bij.
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
        <Sub>De maand-waterval (volgorde per maand)</Sub>
        <p>
          Elke maand loopt de berekening door dezelfde elf tabellen in vaste rekenflow-volgorde: van cashflow en belasting, via de
          verdeel-waterval, naar de bezittingen/schulden en de prognose die de solver leest. De volledige tabellen (per maand, alle
          kolommen) staan op <a className="underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]" href="/beheer/horizon-kernel">/beheer/horizon-kernel</a>.
        </p>
        <MaandWaterval />
      </Sec>

      {/* 2 — Voorkeuren */}
      <Sec id="voorkeuren" kicker="2 · /toekomst/voorkeuren" title="Voorkeuren & instellingen">
        <Sub>Markt-aannames</Sub>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Verwacht bruto rendement</strong> — <F>profiles.expected_return</F> (default 7%). Fallback; per-pot rendement wint.</li>
          <li><strong>Inflatie</strong> — <F>profiles.inflation_rate</F> (default 2%). Indexeert de reële invoer vooraf naar nominaal.</li>
          <li><strong>Effectief SWR</strong> — afgeleid (niet opgeslagen): <C>max(0,001; bruto − Box3-drag − inflatie)</C>. Voedt het fallback-FIRE-doel en de vrijheids-%-noemer.</li>
        </ul>
        <Sub>Regels op de tijdas</Sub>
        <p>De strategie- en pot-regels sturen de kernel nu allemaal echt aan:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Eindstrategie</strong> — opeten / nalatenschap / eeuwigdurend / <em>pensioenleeftijd</em> + eindleeftijd + nalatenschap. Bepaalt het doelbedrag dat de solver toetst (P!B48-B54).</li>
          <li><strong>Onttrekkingsprofiel</strong> — Vast / Afnemend / Oplopend / Guardrails, met een 3-fasen-curve (go-go / slow-go / no-go) en guardrail-parameters (P!B69-B82). VPW/bucket zijn naar &ldquo;Vast&rdquo; gemigreerd.</li>
          <li><strong>Pot-regels</strong> — onttrekkingsvolgorde, verdeling-bij-toename (incl. &ldquo;schuld aflossen&rdquo;) en onttrekking-bij-afname (<F>profiles.pot_rules</F>, 5-groep-niveau) → kern-TS-prio&rsquo;s via <C>prio-overgang</C>.</li>
        </ul>
        <Note>
          De drie pot-regels <strong>bereiken de engine wél</strong>: de kernel-adapter leest <F>profiles.pot_rules</F> en zet ze via{' '}
          <C>buildTsParams</C> om naar per-categorie-prio&rsquo;s (½^(prio−1)-gewichten, reserve = prio 5). Ook &ldquo;surplus → schuld aflossen&rdquo;
          werkt: dan krijgen de gevulde schuld-categorieën aflos-prio 1. Dit was de grote v2-beperking en is met de kern opgelost.
        </Note>
        <Note>
          Let op: twee grote hefbomen staan <strong>niet</strong> op deze pagina — de huis-strategie staat onder <F>/mijn</F>-instellingen
          en het rendement per vermogensgroep onder <F>/overzicht/bezittingen</F>.
        </Note>
      </Sec>

      {/* 3 — Gebeurtenissen */}
      <Sec id="gebeurtenissen" kicker="3 · /toekomst/gebeurtenissen" title="Levensgebeurtenissen">
        <p>
          Een life-event (tabel <F>life_events</F>) wordt door de kernel-adapter via een <C>guard</C> gepartitioneerd:{' '}
          <strong>beheerde</strong> events (AOW, pensioen, werk, huis + kinderen/erfenis) voeden de auto-gebeurtenis-/strategie-blokken;{' '}
          <strong>vrije</strong> events worden handmatige Geb-rijen. Een marktschok gaat als pot-mutatie, een <C>sale_config</C>-verkoop
          als pot-liquidatie.
        </p>
        <p>
          De beheerde types krijgen eigen, gefaseerde logica: <strong>AOW</strong> (leefsituatie + opbouwkorting), de{' '}
          <strong>pensioen-multipot</strong> (annuïtisering), <strong>kinderen</strong> (NIBUD-kosten per fase + kinderbijslag),{' '}
          <strong>erfenis</strong> (netto na erfbelasting) en de <strong>werk-strategie</strong> (reële salarisladder, gegate op FIRE).
          Vrije velden lopen via de generieke Geb-/kosten-fallback (<C>one_time_cost</C>, <C>monthly_cost_change</C>,{' '}
          <C>monthly_income_change</C>, <C>duration_months</C>).
        </p>
      </Sec>

      {/* 4 — Strategieën */}
      <Sec id="strategieen" kicker="4 · Multi-step" title="De 3 multi-step strategieën">
        <p>Drie beheerde strategieën: <strong>AOW</strong>, <strong>Pensioen</strong> en <strong>Huis</strong> — alle kernel-native.</p>
        <Sub>AOW</Sub>
        <p>
          Eén life-event (<C>event_type=&apos;aow&apos;</C>). Multi-step = ingangsleeftijd (default wettelijk) × leefsituatie
          (alleenstaand/samenwonend → ander basisbedrag) × jaren-buiten-NL (opbouwkorting 2%/jaar). Levert een levenslange,
          geïndexeerde inkomensbodem vanaf de AOW-leeftijd; de solver kortsluit &ldquo;pensioenleeftijd&rdquo; naar deze leeftijd.
        </p>
        <Sub>Pensioen</Sub>
        <p>
          Lijst-editor van meerdere potten (bedrijf, lijfrente levenslang/bancair, tijdelijke oudedagslijfrente), elk een eigen
          life-event (<C>event_type=&apos;pension&apos;</C>). Per pot: ingangsleeftijd, invoermodus &ldquo;maand&rdquo; (bekend bruto) of
          &ldquo;pot&rdquo; (kapitaal → geannuïteerd), uitkeringsduur (levenslang/20/10/5), indexatie, partner-%. De adapter mapt ze naar de
          pensioen-multipot van de auto-gebeurtenissen.
        </p>
        <Sub>Huis</Sub>
        <p>
          Géén events maar een <strong>config-object</strong> (<F>profiles.housing_strategy_config</F>). Vier modi:{' '}
          <C>include_full</C> (default), <C>exclude_from_fire</C>, <C>downsize</C> (verkopen) en <C>reverse_mortgage</C>
          (opeethypotheek), elk met een <C>fixed_age</C>- of <C>on_depletion</C>-trigger. De adapter mapt dit één-op-één naar de
          kern-woning-parameters (P!B57-B67); de verkoop/opeethypotheek loopt via het woningblok in <C>Bez</C> en de tekort-lening/opeet-schuld in <C>S</C>.
        </p>
        <Note>
          <strong>Kernel-native (geen v2-terugval):</strong> downsize én opeethypotheek zijn volledig in de kern gemodelleerd — de
          opeet-schaduwschuld drukt echt op de projectie (S-slot), niet alleen als display. Álle previews (AOW, Pensioen, Huis) draaien
          achter de vlag op dezelfde kern als de grafiek en matchen daarom de echte lijn.
        </Note>
      </Sec>

      {/* 5 — Uitgave na pensioen */}
      <Sec id="uitgave-pensioen" kicker="5 · Na pensioen" title="Bepaling van de uitgave na pensioen">
        <p>
          Eén functie: <C>computeRetirementExpenses</C> (<F>lib/budget-utils.ts</F>), met drie methodes (<C>retirement_expense_method</C>);
          de adapter zet de uitkomst als <C>uitgaveNaPensioenPerJaar</C> in het inkomen/uitgaven-blok (Ont):
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>essential_budgets</strong> — som van de essentiële budgetten (jaarlijks). De &ldquo;need&rdquo;-uitgave.</li>
          <li><strong>custom_amount</strong> — een handmatig bedrag (huidige prijzen).</li>
          <li><strong>current_income</strong> — je blijft op huidig inkomensniveau besteden.</li>
        </ul>
        <p>
          De onttrekkingsbehoefte ná FIRE (Ont) rust op deze post-pensioen-uitgave; de <strong>fasefactor</strong> van het
          onttrekkingsprofiel (go-go/slow-go/no-go) kan het bedrag per fase nog omhoog/omlaag schuiven. Vóór FIRE zitten de uitgaven
          impliciet in de cashflow (&ldquo;inkomen − sparen&rdquo;).
        </p>
      </Sec>

      {/* 6 — Inflatie & rendement */}
      <Sec id="inflatie-rendement" kicker="6 · Asset & schuld" title="Effect van inflatie & rendement">
        <Sub>Inflatie</Sub>
        <p>
          Het model is <strong>nominaal</strong>: reële invoer (uitgaven, sparen, cashflows, óók het heffingsvrij vermogen en de
          schuldendrempel) wordt <strong>vooraf</strong> geïndexeerd met <C>(1+inflatie)^(m/12)</C>; niet-geïndexeerde posten worden
          vooraf gede-indexeerd. Nergens deflatie achteraf. Elke maand draagt een index mee zodat de UI desgewenst naar reële termen
          kan herrekenen.
        </p>
        <Sub>Rendement op bezittingen</Sub>
        <p>
          Per pot een rendement op het <strong>saldo van de vorige maand</strong> (<C>saldo(m−1) × rente/12</C>, Bez); de nieuwe inleg
          uit de Verdeling komt er ná het rendement bij. De categorie-totalen per Box 3-type voeden de belasting; het woningblok
          (verkoop/huur/opeethypotheek) voedt de prognose. Het eigen huis is niet-liquide en telt niet mee in de netto-liquide FIRE-lijn.
        </p>
        <Sub>Schulden</Sub>
        <p>
          Echte amortisatie per schuld-pot (S): saldo(m−1) − geplande/extra aflossing + rente, per Box 3-type gesommeerd. De laatste
          slot is de <strong>tekort-lening</strong>: een vangnet dat bijspringt zodra het model in enige maand geld tekortkomt; de piek
          daarvan bepaalt mede de solver-status.
        </p>
        <Note>
          Valt een schuld weg, dan komt de <strong>rentelast</strong> als extra ruimte terug in de cashflow (CF!G, rente-vrijval) — geen
          weggegooid surplus. De aflossings-component telt al als sparen (dubbeltel-guard), dus alleen het rente-deel valt vrij.
        </Note>
      </Sec>

      {/* + Belasting */}
      <Sec id="belasting" kicker="+ Aanvullend" title="Belasting (Box 1 / Box 3)">
        <Sub>Box 1 — afwezig in de projectie</Sub>
        <p>
          De kern kent <strong>geen Box 1-tabel</strong>. AOW (netto) en pensioen (bruto/geannuïteerd) stromen als besteedbaar inkomen
          binnen, zonder loonheffing per jaar.
        </p>
        <Gap>
          Zonder Box 1-loonheffing op AOW/pensioen wordt het besteedbaar pensioeninkomen overschat — het grootste open
          reken-aandachtspunt van de kern. Zie ook het register onderaan.
        </Gap>
        <Sub>Box 3 — tabel Bel, via de cashflow</Sub>
        <p>
          De <C>Bel</C>-tabel berekent per maand de <strong>forfaitaire</strong> heffing (fictief rendement × tarief, kolommen D–K) én —
          bij de methode &ldquo;werkelijk rendement&rdquo; — de heffing op het werkelijke rendement (L/M); de canonieke heffing (N) is die het
          model gebruikt. Die voedt via de cashflow (één-maand-lag) de heffing: vóór FIRE minder sparen, ná FIRE extra onttrekking —
          netto = bruto. De fiscale kern-constanten (tarief, forfaits, heffingvrij vermogen, schuldendrempel) komen uit{' '}
          <F>lib/box3-data.ts</F>; heffingvrij vermogen en schuldendrempel worden geïndexeerd en × aantal fiscale personen geschaald,
          en de schulden tellen mee.
        </p>
      </Sec>

      {/* + Engines & databedrading */}
      <Sec id="engines" kicker="+ Aanvullend" title="Engines & databedrading">
        <Sub>Twee motoren, één schakelaar (flag-periode)</Sub>
        <p>
          Tijdens FASE 6 kiest de <strong>convergentie-router</strong> (<F>lib/horizon-kernel/convergentie-router.ts</F>) per run tussen
          de <strong>horizon-kernel</strong> (<C>solveFire</C>, achter de per-gebruiker-vlag <C>horizon_kernel_convergentie</C>) en de
          bestaande <strong>v2-grootboek-engine</strong> (<C>runSelectedProjection</C> → <C>runHorizonLedger</C>). Eén vlag stuurt de hele
          convergentie-set (/toekomst, /overzicht, het canonieke FIRE-doel en de AI-context); bij de vlag uit is de uitvoer byte-identiek
          aan vandaag. Woning-strategieën zijn kernel-native; alleen generieke (niet-huis) liquidaties die de kern niet mapt — of een
          kernel-fout — vallen schoon terug op v2. De default-flip is FASE 6 stap 3, de fysieke v2-deletie stap 5.
        </p>
        <Sub>Databedrading</Sub>
        <DataStroom />
        <p className="mt-3">
          Sparen wordt geresolved via <C>resolveSavingsSource</C> (prioriteit: maand-override → spaarquote × inkomen →
          asset-contributie), met de aflossing-dubbeltel-guard. <C>effective-financials</C> bepaalt het effectieve inkomen/uitgaven
          (handmatig wint). Bij een huishouden-run voegt de PT-laag alléén het partner-INKOMEN toe (geen partner-potten → geen dubbeltelling).
        </p>
      </Sec>

      {/* ⚠ Aandachtspunten-register */}
      <Sec id="beperkingen" kicker="⚠ Voor de verdere migratie" title="Aandachtspunten-register">
        <p>
          Wat de kern (nog) niet meeneemt in de weergave of berekening — geverifieerd tegen de huidige code. De grote v2-beperkingen
          (jaarbasis, pot-regels los van de engine, surplus-naar-schuld onmogelijk, opeethypotheek-rente display-only) zijn met de kern
          <strong> opgelost</strong>; wat overblijft is voornamelijk adapter-bedrading en de flag-periode.
        </p>
        <Register />
        <p className="text-[12px] text-[var(--ink-3)]">
          Grootste vervolgstappen: de adapter-bedrading afmaken (o.a. <C>marginaal_tarief</C>), Box 1-loonheffing toevoegen, de default
          naar de kern flippen (stap 3) en de v2-terugval verwijderen (stap 5).
        </p>
      </Sec>
    </div>
  )
}
