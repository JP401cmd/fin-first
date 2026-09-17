import Link from 'next/link'
import { PageOpening } from '@/components/editorial/page-opening'
import {
  GEBRUIK_BANDEN,
  GEBRUIK_PERIODES,
  type GebruikAnalyse,
  type GebruikAnalyseResultaat,
  type GebruikPeriode,
} from '@/lib/beheer/gebruik-analyse/loader'
import { GEBRUIK_K, GEBRUIK_PERCENTAGE_MIN_N } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import {
  DoorstroomSectie,
  EersteErvaringSectie,
  KerncijfersSectie,
  LevenscyclusSectie,
  RitmeSectie,
  SectieKop,
  StromenSectie,
} from './gebruik-secties'
import { weekLabel } from './opmaak'

/**
 * Presentatie van /beheer/gebruik (ADR 0153). Krijgt het loader-resultaat als
 * prop en rendert alle drie de staten. Server-component-vriendelijk: filters
 * zijn links, tooltips `title`/`<title>`, tabellen `<details>` — geen client-JS.
 */

export function gebruikHref(dagen: GebruikPeriode, intern: boolean): string {
  return `/beheer/gebruik?dagen=${dagen}${intern ? '&intern=1' : ''}`
}

function Chip({ href, actief, children }: { href: string; actief: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={actief ? 'page' : undefined}
      className={`inline-flex min-h-[36px] items-center border px-3 py-1.5 text-sm transition-colors ${
        actief
          ? 'border-[var(--ink)] font-medium text-[var(--ink)]'
          : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
      }`}
    >
      {children}
    </Link>
  )
}

function Filters({ dagen, intern }: { dagen: GebruikPeriode; intern: boolean }) {
  return (
    <nav aria-label="Filters" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Band">
        {GEBRUIK_PERIODES.map((p) => (
          <Chip key={p} href={gebruikHref(p, intern)} actief={p === dagen}>
            {GEBRUIK_BANDEN[p].label}
          </Chip>
        ))}
      </div>
      <span aria-hidden className="hidden h-6 w-px bg-[var(--border-ed)] sm:block" />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Segment">
        <Chip href={gebruikHref(dagen, false)} actief={!intern}>
          Extern
        </Chip>
        <Chip href={gebruikHref(dagen, true)} actief={intern}>
          Alleen intern
        </Chip>
      </div>
    </nav>
  )
}

function Meetbereik({ data }: { data: GebruikAnalyse }) {
  return (
    <p className="text-xs text-[var(--ink-3)]" data-testid="gemeten-sinds">
      Actieve dagen gemeten sinds{' '}
      {data.gemetenSindsWeek ? <span className="font-medium text-[var(--ink-2)]">{weekLabel(data.gemetenSindsWeek)}</span> : 'nog niet'}
      {' · '}app-delen gemeten sinds{' '}
      {data.modulesGemetenSindsWeek ? (
        <span className="font-medium text-[var(--ink-2)]">{weekLabel(data.modulesGemetenSindsWeek)}</span>
      ) : (
        'nog niet'
      )}
      . Weken daarvóór zijn geen nul, maar niet gemeten.
    </p>
  )
}

function StaatKaart({ titel, children, testId }: { titel: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-6 py-12 text-center" data-testid={testId}>
      <p className="text-sm font-medium text-[var(--ink-2)]">{titel}</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-sm text-[var(--ink-3)]">{children}</p>
    </div>
  )
}

function NogNietGemeten() {
  const items = [
    { titel: 'Klikgedrag', tekst: 'Op welke knoppen en links mensen drukken.' },
    { titel: 'Schermvolgorde', tekst: 'In welke volgorde iemand schermen binnen één bezoek opent.' },
    { titel: 'Sessieduur', tekst: 'Hoe lang een bezoek duurt, of hoe lang iemand op een scherm blijft.' },
  ]
  return (
    <section className="mb-12" data-testid="nog-niet-gemeten">
      <SectieKop nummer="07 · Grens" titel="Nog niet gemeten">
        Deze vragen kan de pagina bewust niet beantwoorden. We schatten ze ook niet: wat niet gemeten is, staat hier leeg.
      </SectieKop>
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <li key={i.titel} className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <h4 className="text-sm font-semibold text-[var(--ink)]">{i.titel}</h4>
            <p className="mt-1 text-xs text-[var(--ink-3)]">{i.tekst}</p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-meta)]">
              Niet gemeten · fase 2, zie ADR 0154 (voorstel)
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Regels() {
  return (
    <section data-testid="regels">
      <SectieKop nummer="08 · Spelregels" titel="Hoe deze cijfers beschermd zijn" />
      <ul className="max-w-[70ch] list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--ink-2)]">
        <li>
          Minimale groepsgrootte k = {GEBRUIK_K}. <span className="font-mono">&lt; {GEBRUIK_K}</span> betekent 1 t/m{' '}
          {GEBRUIK_K - 1} gebruikers; een 0 is echt 0.
        </li>
        <li>
          <span className="font-mono">verborgen</span>: zit er in een verdeling ook maar één groep onder {GEBRUIK_K}, dan
          verbergen we álle cellen van die verdeling behalve de nullen. Het totaal blijft staan. Zo kun je een kleine groep
          niet terugrekenen uit het totaal min de rest, ook niet als je weet hoe het verbergen werkt.
        </li>
        <li>
          In &ldquo;Extern&rdquo; tellen niet mee: testaccounts (@test.trifinity.nl), superadmins en demo-accounts.
          &ldquo;Alleen intern&rdquo; toont precies die accounts. Er is bewust geen optie &ldquo;alles samen&rdquo;: het
          verschil tussen twee overlappende tellingen zou een kleine externe groep exact prijsgeven.
        </li>
        <li>
          De periodes zijn aparte banden die elkaar niet overlappen (laatste 30 dagen · 30–89 · 90–364 dagen geleden). Met
          geneste periodes zou het verschil tussen twee zichtbare tellingen een kleine groep exact prijsgeven.
          &ldquo;Laatst actief&rdquo; is de enige verdeling die niet van de band afhangt.
        </li>
        <li>Alleen dagen en app-delen: geen routes, tijdstippen, kliks of inhoud.</li>
        <li>Tijd staat hier alleen per week of per maand, nooit als losse datum.</li>
        <li>
          Een percentage staat er alleen met zijn noemer bij; onder {GEBRUIK_PERCENTAGE_MIN_N} gebruikers lees je het als
          richting, niet als maat.
        </li>
        <li>Er is geen doorklik naar personen — deze pagina kent geen personen.</li>
      </ul>
    </section>
  )
}

export function GebruikAnalyseInhoud({ data }: { data: GebruikAnalyse }) {
  return (
    <>
      <KerncijfersSectie data={data} />
      <StromenSectie data={data} />
      <RitmeSectie data={data} />
      <DoorstroomSectie data={data} />
      <LevenscyclusSectie data={data} />
      <EersteErvaringSectie data={data} />
    </>
  )
}

export function GebruikPagina({ resultaat }: { resultaat: GebruikAnalyseResultaat }) {
  const dagen = resultaat.status === 'ok' ? resultaat.data.vensterDagen : resultaat.vensterDagen
  const intern = resultaat.status === 'ok' ? resultaat.data.intern : resultaat.intern

  return (
    <div className="beheer-viz">
      <PageOpening
        kicker="Beheer · Gebruik"
        titleBefore="Hoe de app "
        emphasis="gebruikt"
        titleAfter=" wordt"
        deck="Geanonimiseerd: per waardestroom en app-deel, van dag tot dag, en of mensen terugkomen. Alleen tellingen van groepen — nooit een persoon."
      />

      <div className="mb-10 mt-6 space-y-2 border-t border-[var(--border-ed)] pt-4">
        <Filters dagen={dagen} intern={intern} />
        <p className="text-xs text-[var(--ink-3)]" data-testid="banden-uitleg">
          Banden overlappen niet: zo kun je geen kleine groep afleiden uit het verschil tussen twee periodes.
        </p>
        {resultaat.status === 'ok' && <Meetbereik data={resultaat.data} />}
      </div>

      {resultaat.status === 'niet-uitgerold' && (
        <StaatKaart titel="Nog niet uitgerold" testId="staat-niet-uitgerold">
          De databasefunctie voor de gebruiksanalyse bestaat nog niet op deze omgeving (migratie nog niet toegepast). Zodra
          die live is, verschijnen hier de cijfers. Tot dan tonen we niets — ook geen nullen.
        </StaatKaart>
      )}
      {resultaat.status === 'fout' && (
        <StaatKaart titel="De gebruiksanalyse kon niet worden geladen" testId="staat-fout">
          Er ging iets mis bij het ophalen of de gegevens hadden een onverwachte vorm. De fout staat in de serverlog onder
          <span className="font-mono"> [beheer:gebruik]</span>. We tonen geen cijfers, zodat een storing niet als nul oogt.
        </StaatKaart>
      )}
      {resultaat.status === 'ok' && <GebruikAnalyseInhoud data={resultaat.data} />}

      <NogNietGemeten />
      <Regels />
    </div>
  )
}
