import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { AI_HEALTH_META } from '@/lib/ai/ai-health'
import type { AiHealthSnapshot } from '@/lib/ai/ai-health-loader'
import { PRIJZEN_PEILDATUM } from '@/lib/ai/token-prices'
import type { AiBeeld } from '@/lib/beheer/dashboard/ai-reeks'
import {
  aiVerbruikHref,
  foutenHref,
  taakHref,
  webprestatiesHref,
  type DashboardPeriode,
} from '@/lib/beheer/dashboard/doorklik'
import type { DashboardFeiten } from '@/lib/beheer/dashboard/feiten'
import { AI_FOUT_CONTEXT_PREFIX, impactPerSoort } from '@/lib/beheer/dashboard/fouten'
import {
  EFFECT_VENSTER_DAGEN,
  markeringenPerDag,
  meetEffect,
  type Ingreep,
} from '@/lib/beheer/dashboard/ingrepen'
import type { IngrepenLezing } from '@/lib/beheer/dashboard/loader'
import type { FoutenVerloop, VitalsVerloop } from '@/lib/beheer/dashboard/ontwikkeling'
import { PROBE_TAAK, metingVers } from '@/lib/beheer/dashboard/probe'
import { laatsteDagen } from '@/lib/beheer/dashboard/reeksen'
import {
  recentOnvolledigVanaf,
  taakProbleem,
  vensterTekst,
  type TaakProbleem,
} from '@/lib/beheer/dashboard/signalen'
import type { Bron, Ernst, MeetStatus } from '@/lib/beheer/dashboard/status'
import { amsterdamDag, dagLabel, periodeLabel, verschuifDag } from '@/lib/beheer/dashboard/tijd'
import type { JobHealth } from '@/lib/job-health'
import { pageStaleAfterHours } from '@/lib/job-health'
import type { JobStand } from '@/lib/job-health-loader'
import { WEB_VITAL_THRESHOLDS, formatVitalValue, ratingForValue } from '@/lib/web-vitals/config'
import { TabelWeergave, Td, Th } from '@/components/app/beheer/gebruik/grafieken'
import { DagReeks } from './dag-reeks'
import { IngrepenFilter } from './ingrepen-filter'
import { EffectTabel, IngrepenLijst, type EffectRij } from './ingrepen-lijst'
import { getal, momentTekst, verschilTekst } from './opmaak'
import { SectieKopMetId } from './overzicht'
import { StatusTeken } from './status-teken'
import { VeroorzakersLijst, type VeroorzakerRij } from './veroorzakers-lijst'

/**
 * De drie verdiepingen van het dashboard: Betrouwbaarheid, Fin & AI en
 * Ingrepen. Pure presentatie; elke weergave laadt alleen wat zij toont.
 *
 * Gebruik en webprestaties hebben hun eigen scherm (/beheer/gebruik,
 * /beheer/webprestaties); die worden hier niet nagebouwd maar aangewezen.
 */

function Doorklik({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      {children}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  )
}

function BronMelding({ bron, wat }: { bron: { soort: 'fout' | 'niet-uitgerold' }; wat: string }) {
  const status: MeetStatus = bron.soort === 'fout' ? 'meting-mislukt' : 'nvt'
  return (
    <div className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6" data-testid="bron-melding">
      <StatusTeken status={status} />
      <p className="mt-2 text-sm text-[var(--ink-2)]">
        {bron.soort === 'fout'
          ? `${wat} kon niet worden gelezen. Dat zegt niets over het onderdeel zelf; er staan hier daarom geen cijfers.`
          : `${wat} is op deze omgeving nog niet uitgerold.`}
      </p>
    </div>
  )
}

function Paneel({ children }: { children: React.ReactNode }) {
  return <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">{children}</div>
}

function Blokkop({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-sm font-semibold text-[var(--ink)]">{children}</h4>
}

function Cijferregel({ delen }: { delen: { label: string; waarde: string }[] }) {
  return (
    <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 border-y border-[var(--border-ed)] py-3">
      {delen.map((d) => (
        <div key={d.label}>
          <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-meta)]">{d.label}</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">{d.waarde}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── Betrouwbaarheid ─────────────────────────────────────────────────

const HEALTH_STATUS: Record<JobHealth, { status: MeetStatus; ernst: Ernst | null }> = {
  ok: { status: 'gezond', ernst: null },
  overdue: { status: 'afwijkend', ernst: 'hoog' },
  never: { status: 'geen-gegevens', ernst: null },
  unknown: { status: 'meting-mislukt', ernst: null },
  unmonitored: { status: 'nvt', ernst: null },
}

const PROBLEEM_TEKST: Record<TaakProbleem, string> = {
  achterstallig: 'loopt achter',
  mislukt: 'laatste uitvoering mislukt',
  nooit: 'nog nooit gedraaid',
  deels: 'leverde niet alles op',
}

const RUN_STATUS_TEKST = { success: 'geslaagd', partial: 'deels', error: 'fout' } as const

function taakStatus(stand: JobStand, nu: Date): { status: MeetStatus; ernst: Ernst | null } {
  // De bereikbaarheidsmeting is actueel als ze recent liep, ook als ze een
  // onbereikbare dienst vond en daarom op `error` eindigde (zie `probe.ts`).
  const health: JobHealth =
    stand.job.key === PROBE_TAAK && stand.health === 'overdue' && metingVers(stand, nu) ? 'ok' : stand.health
  const basis = HEALTH_STATUS[health]
  if (basis.status !== 'gezond' && basis.status !== 'nvt') return basis
  const probleem = taakProbleem(stand, nu)
  if (probleem === 'mislukt') return { status: 'afwijkend', ernst: 'hoog' }
  if (probleem === 'deels') return { status: 'afwijkend', ernst: 'middel' }
  return basis
}

export const VEROORZAKERS_MAX = 8

export function BetrouwbaarheidWeergave({
  dagen,
  nu,
  feiten,
  verloop,
  vitals,
  ingrepen,
}: {
  dagen: DashboardPeriode
  nu: Date
  feiten: DashboardFeiten
  verloop: Bron<FoutenVerloop>
  vitals: Bron<VitalsVerloop>
  ingrepen: readonly Ingreep[]
}) {
  const markeringen = markeringenPerDag(ingrepen)
  const vanafDag = verschuifDag(amsterdamDag(nu), -(dagen - 1))

  // Geteld op de server; de lijst zelf ordent en filtert in de browser. Er gaat
  // geen gebruikers-id mee: alleen aantallen, de foutsoort en haar voorbeeld.
  const veroorzakers: VeroorzakerRij[] =
    feiten.fouten.soort === 'ok'
      ? (() => {
          const impact = impactPerSoort(feiten.fouten.data.voorvallen, vanafDag)
          return feiten.fouten.data.soorten.flatMap((s) => {
            const i = impact.get(s.signature)
            if (!i) return []
            return [
              {
                signature: s.signature,
                voorbeeld: s.voorbeeld,
                context: s.context,
                stand: s.teruggekomen ? ('teruggekomen' as const) : s.open ? ('open' as const) : ('afgehandeld' as const),
                voorvallen: i.voorvallen,
                gebruikers: i.gebruikers,
                zonderGebruiker: i.zonderGebruiker,
                laatstGezien: s.laatstGezien,
                laatstGezienTekst: momentTekst(s.laatstGezien, nu),
                href: foutenHref({ soort: s.signature }),
              },
            ]
          })
        })()
      : []
  const vensterBegin =
    feiten.fouten.soort === 'ok' ? recentOnvolledigVanaf(feiten.fouten.data, vanafDag) : null

  return (
    <div data-testid="weergave-betrouwbaarheid">
      <section className="mb-12" aria-labelledby="b-fouten">
        <SectieKopMetId id="b-fouten" nummer="01 · Fouten" titel="Foutvoorvallen per dag">
          Elke regel in het foutenlogboek, van browser en server samen. Een voorval is geen gebruiker en geen foutsoort.
        </SectieKopMetId>
        {verloop.soort !== 'ok' ? (
          <BronMelding bron={verloop} wat="Het foutenlogboek" />
        ) : (
          <>
            <Cijferregel
              delen={[
                {
                  label: periodeLabel(verloop.data.vergelijking.huidig.van, verloop.data.vergelijking.huidig.tot),
                  waarde:
                    verloop.data.vergelijking.huidig.aantal === null
                      ? 'niet gemeten'
                      : getal(verloop.data.vergelijking.huidig.aantal),
                },
                {
                  label: periodeLabel(verloop.data.vergelijking.vorig.van, verloop.data.vergelijking.vorig.tot),
                  waarde:
                    verloop.data.vergelijking.vorig.aantal === null
                      ? 'niet gemeten'
                      : getal(verloop.data.vergelijking.vorig.aantal),
                },
                {
                  label: 'Verschil',
                  waarde:
                    verloop.data.vergelijking.verschil === null
                      ? 'niet te vergelijken'
                      : verschilTekst(verloop.data.vergelijking.verschil),
                },
              ]}
            />
            <Paneel>
              <DagReeks
                idBasis="fouten-per-dag"
                omschrijving={`Foutvoorvallen per dag over ${dagen} dagen, met markeringen op dagen met een ingreep`}
                eenheid="voorvallen"
                tabelKop="Voorvallen"
                punten={verloop.data.reeks.map((p) => ({ dag: p.dag, waarde: p.aantal, lopend: p.lopend }))}
                markeringen={markeringen}
              />
            </Paneel>
            {verloop.data.afgekaptVanaf && (
              <p className="mt-2 text-xs text-[var(--ink-3)]">
                Het leesvenster bevat de laatste {getal(verloop.data.vensterGrootte)} regels en begint op{' '}
                {momentTekst(verloop.data.afgekaptVanaf, nu)}. Dagen daarvoor zijn niet gemeten, niet nul.
              </p>
            )}
          </>
        )}
      </section>

      <section className="mb-12" aria-labelledby="b-veroorzakers">
        <SectieKopMetId id="b-veroorzakers" nummer="02 · Veroorzakers" titel="Welke foutsoorten het meest voorkomen">
          Voorvallen in de laatste {dagen} dagen, te sorteren op voorvallen, op getroffen gebruikers of op het laatste
          voorval. Het aantal gebruikers is een ondergrens: een voorval zonder gebruiker telt wel als voorval, niet
          als gebruiker.
        </SectieKopMetId>
        {feiten.fouten.soort !== 'ok' ? (
          <BronMelding bron={feiten.fouten} wat="Het foutenlogboek" />
        ) : veroorzakers.length === 0 ? (
          <p className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 text-sm text-[var(--ink-2)]">
            Geen foutvoorvallen in de laatste {dagen} dagen.
          </p>
        ) : (
          <>
            <VeroorzakersLijst
              rijen={veroorzakers}
              dagen={dagen}
              standaardAantal={VEROORZAKERS_MAX}
              vensterOnvolledig={vensterBegin !== null}
            />
            {vensterBegin && (
              <p className="mt-2 text-xs text-[var(--ink-3)]" data-testid="veroorzakers-venster">
                Het leesvenster bevat de laatste {getal(feiten.fouten.data.vensterGrootte)} regels en begint op{' '}
                {dagLabel(vensterBegin)}. Oudere voorvallen in deze periode zijn niet gelezen: elk aantal is een
                ondergrens.
              </p>
            )}
            <p className="mt-1">
              <Doorklik href={foutenHref()}>Alle foutsoorten, afvinken en heropenen</Doorklik>
            </p>
          </>
        )}
      </section>

      <section className="mb-12" aria-labelledby="b-taken">
        <SectieKopMetId id="b-taken" nummer="03 · Taken" titel="Achtergrondtaken">
          Per taak of hij binnen zijn venster geslaagd is, en wat de laatste uitvoering opleverde. Een taak die op tijd
          draaide maar niet alles opleverde, is niet actueel én afwijkend.
        </SectieKopMetId>
        {feiten.taken.soort !== 'ok' ? (
          <BronMelding bron={feiten.taken} wat="De uitvoeringen van de taken" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm" data-testid="taken-tabel">
              <thead>
                <tr className="border-b border-[var(--border-ed)]">
                  <Th>Taak</Th>
                  <Th>Toestand</Th>
                  <Th>Laatste uitvoering</Th>
                  <Th>Venster</Th>
                </tr>
              </thead>
              <tbody>
                {feiten.taken.data.standen.map((s) => {
                  const { status, ernst } = taakStatus(s, nu)
                  const probleem = taakProbleem(s, nu)
                  return (
                    <tr key={s.job.key} className="border-b border-dotted border-[var(--border-ed)] hover:bg-[var(--subtle)]">
                      <Td>
                        <Link
                          href={taakHref(s.job.key)}
                          className="inline-flex min-h-11 items-center font-medium text-[var(--ink)] underline decoration-[var(--border-md)] underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-9"
                        >
                          {s.job.label}
                        </Link>
                        <span className="block text-xs text-[var(--ink-3)]">{s.job.schedule}</span>
                      </Td>
                      <Td>
                        <StatusTeken status={status} ernst={ernst} />
                        {probleem && (
                          <span className="mt-0.5 block text-xs text-[var(--ink-3)]">{PROBLEEM_TEKST[probleem]}</span>
                        )}
                      </Td>
                      <Td>
                        {s.last ? (
                          <span className="font-mono text-xs tabular-nums">
                            {momentTekst(s.last.created_at, nu)}
                            <span className="ml-1.5 text-[var(--ink-3)]">{RUN_STATUS_TEKST[s.last.status]}</span>
                          </span>
                        ) : (
                          <span className="text-xs italic text-[var(--ink-3)]">geen uitvoering vastgelegd</span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-xs text-[var(--ink-3)]">
                          {s.job.maxAgeHours == null
                            ? 'niet bewaakt'
                            : `binnen ${vensterTekst(pageStaleAfterHours(s.job.maxAgeHours))}`}
                        </span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-12" aria-labelledby="b-laadtijd">
        <SectieKopMetId id="b-laadtijd" nummer="04 · Laadtijd" titel="Laadtijd bij echte bezoekers">
          De p75 van het grootste element (LCP) per dag, op productie. Een dag zonder metingen is niet gemeten, geen
          laadtijd van nul.
        </SectieKopMetId>
        {vitals.soort !== 'ok' ? (
          <BronMelding bron={vitals} wat="De webprestaties" />
        ) : vitals.data.p75 === null ? (
          <p className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 text-sm text-[var(--ink-2)]">
            Geen metingen van productie in de laatste {vitals.data.dagen} dagen.
          </p>
        ) : (
          <>
            <Cijferregel
              delen={[
                { label: `p75 over ${vitals.data.dagen} dagen`, waarde: formatVitalValue('LCP', vitals.data.p75) },
                {
                  label: 'Oordeel',
                  waarde: { good: 'goed', 'needs-improvement': 'aandacht', poor: 'slecht' }[
                    ratingForValue('LCP', vitals.data.p75)
                  ],
                },
                { label: 'Metingen', waarde: getal(vitals.data.metingen) },
              ]}
            />
            <Paneel>
              <DagReeks
                idBasis="lcp-per-dag"
                omschrijving={`LCP p75 per dag over ${vitals.data.dagen} dagen, met de grenzen voor goed en slecht`}
                waardeTekst={(n) => formatVitalValue('LCP', n)}
                tabelKop="p75"
                punten={vitals.data.reeks.map((p) => ({
                  dag: p.dag,
                  waarde: p.p75,
                  lopend: p.lopend,
                  toelichting: p.metingen > 0 ? `${getal(p.metingen)} metingen` : undefined,
                }))}
                referenties={[
                  {
                    waarde: WEB_VITAL_THRESHOLDS.LCP.good,
                    label: `goed tot ${formatVitalValue('LCP', WEB_VITAL_THRESHOLDS.LCP.good)}`,
                    streep: 'lang',
                  },
                  {
                    waarde: WEB_VITAL_THRESHOLDS.LCP.poor,
                    label: `slecht boven ${formatVitalValue('LCP', WEB_VITAL_THRESHOLDS.LCP.poor)}`,
                    streep: 'kort',
                  },
                ]}
                markeringen={markeringen}
              />
            </Paneel>
          </>
        )}
        <p className="mt-3">
          <Doorklik href={webprestatiesHref(dagen, 'LCP')}>Alle maten, per route</Doorklik>
        </p>
      </section>
    </div>
  )
}

// ── Fin & AI ────────────────────────────────────────────────────────

const euro = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export interface Wisselkoers {
  usdNaarEur: number
  /** De live koers was niet op te halen; dit is een benadering. */
  benadering: boolean
}

function kostenTekst(usd: number | null, koers: Wisselkoers): string {
  if (usd === null) return 'onbekend'
  if (usd === 0) return '—'
  const eur = usd * koers.usdNaarEur
  return eur < 0.005 ? '< € 0,01' : euro.format(eur)
}

const AI_STATUS: Record<AiHealthSnapshot['status'], { status: MeetStatus; ernst: Ernst | null }> = {
  ok: { status: 'gezond', ernst: null },
  idle: { status: 'geen-gegevens', ernst: null },
  attention: { status: 'afwijkend', ernst: 'laag' },
  hapering: { status: 'afwijkend', ernst: 'hoog' },
  storing: { status: 'afwijkend', ernst: 'kritiek' },
  unknown: { status: 'meting-mislukt', ernst: null },
}

export function AiWeergave({
  dagen,
  nu,
  gezondheid,
  aiUit,
  beeld,
  koers,
  ingrepen,
}: {
  dagen: DashboardPeriode
  nu: Date
  gezondheid: AiHealthSnapshot
  /** AI is bewust uitgezet via de noodschakelaar. */
  aiUit: boolean
  beeld: Bron<AiBeeld>
  koers: Wisselkoers
  ingrepen: readonly Ingreep[]
}) {
  const markeringen = markeringenPerDag(ingrepen)
  const stand = AI_STATUS[gezondheid.status]

  return (
    <div data-testid="weergave-ai">
      <section className="mb-12" aria-labelledby="a-stand">
        <SectieKopMetId id="a-stand" nummer="01 · Stand" titel="Werkt de AI nu">
          Afgeleid uit de laatste geslaagde aanroep en de mislukte aanroepen sindsdien.
        </SectieKopMetId>
        <Paneel>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {aiUit ? <StatusTeken status="nvt" /> : <StatusTeken status={stand.status} ernst={stand.ernst} />}
            <p className="text-sm text-[var(--ink-2)]">
              {aiUit
                ? 'AI staat uit via de noodschakelaar op Platform-status.'
                : gezondheid.status === 'unknown'
                  ? 'De stand kon niet worden afgelezen.'
                  : `${AI_HEALTH_META[gezondheid.status].label}${
                      gezondheid.failureCount > 0
                        ? `: ${gezondheid.failureCount} mislukte ${gezondheid.failureCount === 1 ? 'aanroep' : 'aanroepen'} sinds de laatste geslaagde`
                        : ''
                    }.`}
            </p>
          </div>
          <p className="mt-2 font-mono text-xs tabular-nums text-[var(--ink-3)]">
            Laatste geslaagde aanroep: {gezondheid.lastSuccessAt ? momentTekst(gezondheid.lastSuccessAt, nu) : 'nog nooit'}
            {gezondheid.sinceAt ? ` · eerste mislukte daarna: ${momentTekst(gezondheid.sinceAt, nu)}` : ''}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-5">
            <Doorklik href="/beheer/ai">AI-instellingen</Doorklik>
            <Doorklik href={foutenHref({ context: AI_FOUT_CONTEXT_PREFIX })}>AI-foutmeldingen</Doorklik>
          </p>
        </Paneel>
      </section>

      {beeld.soort !== 'ok' ? (
        <BronMelding bron={beeld} wat="Het AI-verbruik" />
      ) : (
        <>
          <section className="mb-12" aria-labelledby="a-verloop">
            <SectieKopMetId id="a-verloop" nummer="02 · Verloop" titel="Geslaagd en mislukt per dag">
              Twee grafieken met elk een eigen schaal: lees de hoogtes niet tegen elkaar af. Geslaagde aanroepen komen
              uit het verbruikslogboek, mislukte uit het foutenlogboek.
            </SectieKopMetId>
            <Cijferregel
              delen={[
                {
                  label: `Geslaagd, ${periodeLabel(beeld.data.vergelijkGeslaagd.huidig.van, beeld.data.vergelijkGeslaagd.huidig.tot)}`,
                  // Een niet-gemeten totaal is geen nul.
                  waarde:
                    beeld.data.vergelijkGeslaagd.huidig.aantal === null
                      ? 'niet volledig gemeten'
                      : getal(beeld.data.vergelijkGeslaagd.huidig.aantal),
                },
                {
                  label: 'Mislukt',
                  waarde:
                    beeld.data.vergelijkMislukt.huidig.aantal === null
                      ? 'niet volledig gemeten'
                      : getal(beeld.data.vergelijkMislukt.huidig.aantal),
                },
                {
                  label: 'Aandeel mislukt',
                  waarde: beeld.data.aandeelMislukt
                    ? `${getal(beeld.data.aandeelMislukt.mislukt)} van ${getal(beeld.data.aandeelMislukt.pogingen)} pogingen`
                    : 'niet te bepalen',
                },
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Paneel>
                <Blokkop>Geslaagde aanroepen</Blokkop>
                <DagReeks
                  idBasis="ai-geslaagd"
                  omschrijving={`Geslaagde AI-aanroepen per dag over ${dagen} dagen`}
                  eenheid="aanroepen"
                  tabelKop="Geslaagd"
                  punten={laatsteDagen(beeld.data.geslaagd, dagen).map((p) => ({
                    dag: p.dag,
                    waarde: p.aantal,
                    lopend: p.lopend,
                  }))}
                  markeringen={markeringen}
                />
              </Paneel>
              <Paneel>
                <Blokkop>Mislukte aanroepen</Blokkop>
                <DagReeks
                  idBasis="ai-mislukt"
                  omschrijving={`Mislukte AI-aanroepen per dag over ${dagen} dagen`}
                  eenheid="mislukte aanroepen"
                  tabelKop="Mislukt"
                  punten={laatsteDagen(beeld.data.mislukt, dagen).map((p) => ({
                    dag: p.dag,
                    waarde: p.aantal,
                    lopend: p.lopend,
                  }))}
                  markeringen={markeringen}
                />
              </Paneel>
            </div>
          </section>

          <section className="mb-12" aria-labelledby="a-functies">
            <SectieKopMetId id="a-functies" nummer="03 · Functies" titel="Welke functies het meest verbruiken">
              Over {periodeLabel(beeld.data.vergelijkGeslaagd.huidig.van, beeld.data.vergelijkGeslaagd.huidig.tot)},
              gesorteerd op tokens. De kosten zijn een schatting: tokens maal het modeltarief, peildatum{' '}
              {PRIJZEN_PEILDATUM}, omgerekend van dollars.
            </SectieKopMetId>
            {beeld.data.perFunctie.length === 0 ? (
              <p className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 text-sm text-[var(--ink-2)]">
                {beeld.data.verbruikOnvolledig
                  ? 'De aanroepen van deze periode zijn niet volledig gelezen.'
                  : 'Geen AI-aanroepen in deze periode.'}
              </p>
            ) : (
              <>
                {beeld.data.verbruikOnvolledig && (
                  <p
                    className="mb-3 border-l-2 border-warning bg-warning-bg px-4 py-2 text-sm text-[var(--ink-2)]"
                    data-testid="ai-verbruik-onvolledig"
                  >
                    De lezing van het verbruikslogboek raakte haar bovengrens. Het verbruik per functie hieronder is
                    een ondergrens en de kosten zijn daarom niet opgeteld. Kies een kortere periode voor een volledig
                    beeld.
                  </p>
                )}
                <Cijferregel
                  delen={[
                    { label: 'Geschatte kosten', waarde: kostenTekst(beeld.data.kostenUsd, koers) },
                    { label: 'Functies in gebruik', waarde: getal(beeld.data.perFunctie.length) },
                  ]}
                />
                <FunctieBalken beeld={beeld.data} koers={koers} />
                {beeld.data.onbekendeModellen.length > 0 && (
                  <p className="mt-2 text-xs text-[var(--ink-3)]">
                    Geen tarief bekend voor {beeld.data.onbekendeModellen.join(', ')}. Het totaal is daarom onbekend en
                    niet een deelsom.
                  </p>
                )}
                <p className="mt-1 text-xs text-[var(--ink-3)]">
                  Wisselkoers: 1 dollar = {koers.usdNaarEur.toLocaleString('nl-NL', { maximumFractionDigits: 4 })} euro
                  {koers.benadering ? ' (benadering: de actuele koers was niet op te halen)' : ''}.
                </p>
              </>
            )}
            <p className="mt-3">
              <Doorklik href={aiVerbruikHref(dagen)}>Verbruik per provider en per account</Doorklik>
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function FunctieBalken({ beeld, koers }: { beeld: AiBeeld; koers: Wisselkoers }) {
  const hoogste = Math.max(...beeld.perFunctie.map((f) => f.tokensIn + f.tokensUit), 1)
  return (
    <>
      <ul className="space-y-2" data-testid="functie-balken">
        {beeld.perFunctie.map((f) => {
          const tokens = f.tokensIn + f.tokensUit
          return (
            <li
              key={f.feature}
              className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(8rem,14rem)_1fr] sm:items-center"
              title={`${getal(tokens)} tokens in ${getal(f.aanroepen)} aanroepen`}
            >
              <span className="truncate text-sm text-[var(--ink-2)]">{f.label}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex min-w-0 flex-1">
                  <span
                    aria-hidden
                    className="block h-3 bg-[var(--ink-3)]"
                    style={{ width: `${Math.max((tokens / hoogste) * 100, 0.5)}%` }}
                  />
                </span>
                <span className="w-[10.5rem] shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-[var(--ink-2)]">
                  {getal(tokens)}
                  <span className="ml-1.5 text-[var(--ink-3)]">{kostenTekst(f.kostenUsd, koers)}</span>
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <TabelWeergave>
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)]">
              <Th>Functie</Th>
              <Th rechts>Aanroepen</Th>
              <Th rechts>Waarvan achtergrond</Th>
              <Th rechts>Tokens in</Th>
              <Th rechts>Tokens uit</Th>
              <Th rechts>Geschatte kosten</Th>
            </tr>
          </thead>
          <tbody>
            {beeld.perFunctie.map((f) => (
              <tr key={f.feature} className="border-b border-dotted border-[var(--border-ed)]">
                <Td>{f.label}</Td>
                <Td rechts>{getal(f.aanroepen)}</Td>
                <Td rechts>{getal(f.systeem)}</Td>
                <Td rechts>{getal(f.tokensIn)}</Td>
                <Td rechts>{getal(f.tokensUit)}</Td>
                <Td rechts>{kostenTekst(f.kostenUsd, koers)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelWeergave>
    </>
  )
}

// ── Ingrepen ────────────────────────────────────────────────────────

/** Hoeveel ingrepen de vóór/na-tabel toont voordat je "toon alle" kiest. */
export const EFFECT_RIJEN_MAX = 12

export function IngrepenWeergave({
  dagen,
  nu,
  ingrepen,
  fouten,
  aiFouten,
}: {
  dagen: DashboardPeriode
  nu: Date
  ingrepen: Bron<IngrepenLezing>
  fouten: Bron<FoutenVerloop>
  aiFouten: Bron<FoutenVerloop>
}) {
  if (ingrepen.soort !== 'ok') {
    return (
      <div data-testid="weergave-ingrepen">
        <BronMelding bron={ingrepen} wat="De audit-trail" />
      </div>
    )
  }

  const alle = ingrepen.data.ingrepen
  const vanafDag = verschuifDag(amsterdamDag(nu), -(dagen - 1))
  const inPeriode = alle.filter((i) => i.dag >= vanafDag)
  const releases = inPeriode.filter((i) => i.soort === 'release').length
  const beheeracties = inPeriode.length - releases
  // Elke ingreep krijgt zijn meting; de tabel toont de eerste reeks en de rest
  // op verzoek (`IngrepenFilter`).
  const rijen: EffectRij[] =
    fouten.soort === 'ok' && aiFouten.soort === 'ok'
      ? inPeriode.map((ingreep) => ({
          ingreep,
          metingen: [
            meetEffect(ingreep, fouten.data.volledig, alle, { nu }),
            meetEffect(ingreep, aiFouten.data.volledig, alle, { nu }),
          ],
        }))
      : []

  return (
    <div data-testid="weergave-ingrepen">
      <section className="mb-12" aria-labelledby="i-effect">
        <SectieKopMetId id="i-effect" nummer="01 · Voor en na" titel="Wat er rond een ingreep te zien was">
          Per ingreep de {EFFECT_VENSTER_DAGEN} dagen ervoor naast de {EFFECT_VENSTER_DAGEN} dagen erna. De dag van de
          ingreep zelf telt bij geen van beide mee: van een release is alleen de datum bekend, niet het tijdstip.
        </SectieKopMetId>
        <p className="mb-4 max-w-[75ch] border-l-2 border-[var(--border-md)] bg-[var(--subtle)] px-4 py-3 text-sm leading-relaxed text-[var(--ink-2)]">
          Dit is een waarneming, geen bewijs. Dat een cijfer na een ingreep verandert, zegt niet dat de ingreep de
          oorzaak is. Vielen er meer ingrepen in dezelfde twee weken, dan is het verschil aan geen van alle toe te
          schrijven; de laatste kolom telt ze.
        </p>
        {fouten.soort !== 'ok' ? (
          <BronMelding bron={fouten} wat="Het foutenlogboek" />
        ) : (
          <IngrepenFilter
            releases={releases}
            beheeracties={beheeracties}
            eersteReeks={EFFECT_RIJEN_MAX}
            naam="de tabel met voor en na"
          >
            <EffectTabel
              rijen={rijen}
              maten={['Foutvoorvallen', 'Mislukte AI-aanroepen']}
              eersteReeks={EFFECT_RIJEN_MAX}
            />
          </IngrepenFilter>
        )}
        {ingrepen.data.actiesAfgekaptVanaf && (
          <p className="mt-2 text-xs text-[var(--ink-3)]" data-testid="ingrepen-afgekapt">
            De audit-trail is gelezen tot {momentTekst(ingrepen.data.actiesAfgekaptVanaf, nu)}; beheeracties van
            daarvoor kunnen ontbreken, ook in de telling van andere ingrepen. Releases zijn volledig.
          </p>
        )}
      </section>

      <section className="mb-12" aria-labelledby="i-lijst">
        <SectieKopMetId id="i-lijst" nummer="02 · Tijdlijn" titel={`Alle ingrepen van de laatste ${dagen} dagen`}>
          Releases uit de vrijgavenotities, beheeracties uit de audit-trail. Alleen acties die iets wijzigden.
        </SectieKopMetId>
        <IngrepenFilter releases={releases} beheeracties={beheeracties} eersteReeks={null} naam="de tijdlijn">
          <IngrepenLijst ingrepen={inPeriode} leeg="Geen releases of beheeracties in deze periode." />
        </IngrepenFilter>
        <p className="mt-2 flex flex-wrap gap-x-5">
          <Doorklik href="/beheer/releases">Vrijgavenotities</Doorklik>
          <Doorklik href="/beheer/audit">Volledige audit-trail</Doorklik>
        </p>
      </section>

      <section className="mb-12" aria-labelledby="i-grens">
        <SectieKopMetId id="i-grens" nummer="03 · Grens" titel="Wat hier niet in staat" />
        <ul className="max-w-[75ch] list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--ink-2)]">
          <li>
            Het tijdstip van uitrol. Een release draagt de datum van zijn vrijgavenotitie; wanneer hij die dag live
            ging, legt niets vast.
          </li>
          <li>
            Wijzigingen die geen spoor nalaten in de audit-trail: AI-provider en -model, prompts, limieten van
            AI-functies, de bankkoppeling, rekenaannames, nieuwsbronnen en de inhoud van coach, welkomstgids en
            briefing. Van die instellingen is alleen de laatste wijziging bekend, niet de geschiedenis.
          </li>
          <li>Wijzigingen buiten de app: omgevingsvariabelen, het cron-schema en instellingen bij leveranciers.</li>
        </ul>
      </section>
    </div>
  )
}
