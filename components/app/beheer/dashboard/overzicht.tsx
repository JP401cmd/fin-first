import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { GebruikAnalyseResultaat } from '@/lib/beheer/gebruik-analyse/loader'
import { celTekst } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import type { AiBeeld } from '@/lib/beheer/dashboard/ai-reeks'
import {
  dashboardHref,
  gebruikHref,
  webprestatiesHref,
  type DashboardPeriode,
} from '@/lib/beheer/dashboard/doorklik'
import { bouwGebruikTrend } from '@/lib/beheer/dashboard/gebruik-trend'
import { markeringenPerDag, type Ingreep } from '@/lib/beheer/dashboard/ingrepen'
import type { IngrepenLezing } from '@/lib/beheer/dashboard/loader'
import type { OnderdeelRij } from '@/lib/beheer/dashboard/onderdelen'
import type { FoutenVerloop, VitalsVerloop } from '@/lib/beheer/dashboard/ontwikkeling'
import { laatsteDagen, type PeriodeVergelijking } from '@/lib/beheer/dashboard/reeksen'
import type { AandachtItem } from '@/lib/beheer/dashboard/signalen'
import type { Bron } from '@/lib/beheer/dashboard/status'
import { periodeLabel } from '@/lib/beheer/dashboard/tijd'
import { WEB_VITAL_THRESHOLDS, formatVitalValue, ratingForValue } from '@/lib/web-vitals/config'
import { SectieKop } from '@/components/app/beheer/gebruik/gebruik-secties'
import { ARCERING_STIJL } from '@/components/app/beheer/gebruik/grafieken'
import { mooieMax, weekKort, weekLabel } from '@/components/app/beheer/gebruik/opmaak'
import { NEUTRALE_REEKS } from '@/components/app/beheer/gebruik/palet'
import { AandachtLijst } from './aandacht-lijst'
import { DagReeks } from './dag-reeks'
import { DagReeksVeld, type VeldKolom } from './dag-reeks-veld'
import { IngrepenLijst } from './ingrepen-lijst'
import { Kerncijfer, type Vergelijking } from './kerncijfer'
import { OnderdelenTabel } from './onderdelen-tabel'
import { getal, momentTekst } from './opmaak'

/**
 * De secties van het overzicht. Pure presentatie: elke sectie krijgt haar
 * cijfers als prop, zodat ze zonder database te renderen en te testen is.
 */

// ── 01 en 02: aandacht en status ────────────────────────────────────

export function AandachtSectie({
  items,
  nu,
  afwijkendZonderSignaal = [],
}: {
  items: readonly AandachtItem[]
  nu: Date
  /** Onderdelen die afwijken zonder dat ingrijpen nodig is (zie `bouwOordeel`). */
  afwijkendZonderSignaal?: readonly string[]
}) {
  return (
    <section className="mb-12" aria-labelledby="sectie-aandacht" data-testid="sectie-aandacht">
      <SectieKopMetId id="sectie-aandacht" nummer="01 · Aandacht" titel="Wat vraagt aandacht">
        Zwaarste eerst: op ernst, dan op het gevolg voor gebruikers, dan op hoe lang het al speelt. Wat dezelfde
        oorzaak heeft, staat als één regel.
      </SectieKopMetId>
      <AandachtLijst items={[...items]} nu={nu} afwijkendZonderSignaal={[...afwijkendZonderSignaal]} />
    </section>
  )
}

export function StatusSectie({ rijen, nu }: { rijen: readonly OnderdeelRij[]; nu: Date }) {
  return (
    <section className="mb-12" aria-labelledby="sectie-status" data-testid="sectie-status">
      <SectieKopMetId id="sectie-status" nummer="02 · Status" titel="Hoe staat elk onderdeel ervoor">
        Een onderdeel zonder actuele meting heet niet gezond, maar verouderd, zonder gegevens of niet te meten.
      </SectieKopMetId>
      <OnderdelenTabel rijen={rijen} nu={nu} />
    </section>
  )
}

/** `SectieKop` van /beheer/gebruik, met een anker zodat de sectie te benoemen is. */
export function SectieKopMetId({
  id,
  nummer,
  titel,
  children,
}: {
  id: string
  nummer: string
  titel: string
  children?: React.ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <SectieKop nummer={nummer} titel={titel}>
        {children}
      </SectieKop>
    </div>
  )
}

// ── 03: ontwikkeling ────────────────────────────────────────────────

function vergelijkingVan(v: PeriodeVergelijking, stijgingGunstig: boolean | null, reden?: string): Vergelijking {
  return {
    verschil: v.verschil,
    met: `${periodeLabel(v.vorig.van, v.vorig.tot)}${v.vorig.aantal !== null ? `: ${getal(v.vorig.aantal)}` : ''}`,
    reden,
    stijgingGunstig,
  }
}

const ZONDER = {
  'meting-mislukt': 'De bron kon niet worden gelezen. Dit zegt niets over het onderdeel zelf.',
  nvt: 'Deze meting is op deze omgeving nog niet uitgerold.',
} as const

export interface OntwikkelingInvoer {
  dagen: DashboardPeriode
  nu: Date
  fouten: Bron<FoutenVerloop>
  ai: Bron<AiBeeld>
  gebruik: GebruikAnalyseResultaat
  vitals: Bron<VitalsVerloop>
  ingrepen: readonly Ingreep[]
}

function FoutenKerncijfer({ invoer }: { invoer: OntwikkelingInvoer }) {
  const { fouten, dagen } = invoer
  const basis = {
    label: 'Foutvoorvallen',
    definitie:
      'Regels in het foutenlogboek, van browser en server samen. Een voorval is geen gebruiker en geen foutsoort: één fout kan honderd voorvallen geven.',
    href: dashboardHref('betrouwbaarheid', dagen),
    linkLabel: 'Verloop en veroorzakers',
    testId: 'kerncijfer-fouten',
  }
  if (fouten.soort !== 'ok') {
    const status = fouten.soort === 'fout' ? 'meting-mislukt' : 'nvt'
    return <Kerncijfer {...basis} waarde={null} periode={`${dagen} dagen`} zonderMeting={{ status, uitleg: ZONDER[status] }} />
  }
  const v = fouten.data.vergelijking
  return (
    <Kerncijfer
      {...basis}
      waarde={v.huidig.aantal === null ? null : getal(v.huidig.aantal)}
      waardeToelichting="voorvallen"
      periode={periodeLabel(v.huidig.van, v.huidig.tot)}
      zonderMeting={
        v.huidig.aantal === null
          ? {
              status: 'geen-gegevens',
              uitleg: `Het leesvenster bevat de laatste ${getal(fouten.data.vensterGrootte)} regels en dekt deze periode niet helemaal.`,
            }
          : undefined
      }
      vergelijking={vergelijkingVan(
        v,
        false,
        `het leesvenster van ${getal(fouten.data.vensterGrootte)} regels reikt niet tot de vorige periode.`,
      )}
      grafiek={
        <DagReeks
          compact
          hoogte={56}
          idBasis="kern-fouten"
          omschrijving={`Foutvoorvallen per dag, ${dagen} dagen`}
          eenheid="voorvallen"
          punten={fouten.data.reeks.map((p) => ({ dag: p.dag, waarde: p.aantal, lopend: p.lopend }))}
          markeringen={markeringenPerDag(invoer.ingrepen)}
        />
      }
    />
  )
}

function AiKerncijfer({ invoer }: { invoer: OntwikkelingInvoer }) {
  const { ai, dagen } = invoer
  const basis = {
    label: 'AI-aanroepen',
    definitie:
      'Geslaagde aanroepen bij de provider, van gebruikers en achtergrondtaken samen. Elke ronde telt, ook een tussenstap van een gereedschap.',
    href: dashboardHref('ai', dagen),
    linkLabel: 'Verloop, mislukt en kosten',
    testId: 'kerncijfer-ai',
  }
  if (ai.soort !== 'ok') {
    const status = ai.soort === 'fout' ? 'meting-mislukt' : 'nvt'
    return <Kerncijfer {...basis} waarde={null} periode={`${dagen} dagen`} zonderMeting={{ status, uitleg: ZONDER[status] }} />
  }
  const v = ai.data.vergelijkGeslaagd
  const aandeel = ai.data.aandeelMislukt
  return (
    <Kerncijfer
      {...basis}
      waarde={v.huidig.aantal === null ? null : getal(v.huidig.aantal)}
      waardeToelichting={
        aandeel
          ? `geslaagd · ${getal(aandeel.mislukt)} van ${getal(aandeel.pogingen)} pogingen mislukt`
          : 'geslaagd · mislukte aanroepen niet volledig gemeten'
      }
      periode={periodeLabel(v.huidig.van, v.huidig.tot)}
      zonderMeting={
        v.huidig.aantal === null
          ? {
              status: 'geen-gegevens',
              uitleg:
                'De lezing van het verbruikslogboek raakte haar bovengrens en dekt deze periode niet helemaal. Kies een kortere periode.',
            }
          : undefined
      }
      vergelijking={vergelijkingVan(v, null)}
      grafiek={
        <DagReeks
          compact
          hoogte={56}
          idBasis="kern-ai"
          omschrijving={`Geslaagde AI-aanroepen per dag, ${dagen} dagen`}
          eenheid="aanroepen"
          punten={laatsteDagen(ai.data.geslaagd, dagen).map((p) => ({ dag: p.dag, waarde: p.aantal, lopend: p.lopend }))}
          markeringen={markeringenPerDag(invoer.ingrepen)}
        />
      }
    />
  )
}

function GebruikKerncijfer({ invoer }: { invoer: OntwikkelingInvoer }) {
  const basis = {
    label: 'Actieve gebruikers per week',
    definitie:
      'Verschillende gebruikers met minstens één actieve dag in de week, zonder testaccounts en beheerders. Groepen onder de vijf blijven verborgen.',
    href: gebruikHref(),
    linkLabel: 'Gebruik per waardestroom',
    testId: 'kerncijfer-gebruik',
  }
  if (invoer.gebruik.status !== 'ok') {
    const status = invoer.gebruik.status === 'fout' ? 'meting-mislukt' : 'nvt'
    return <Kerncijfer {...basis} waarde={null} periode="per week" zonderMeting={{ status, uitleg: ZONDER[status] }} />
  }
  const trend = bouwGebruikTrend(invoer.gebruik.data.weektrend, {
    nu: invoer.nu,
    bandDagen: invoer.gebruik.data.vensterDagen,
  })
  const laatste = trend.laatsteVolle
  if (!laatste) {
    return (
      <Kerncijfer
        {...basis}
        waarde={null}
        periode="per week"
        zonderMeting={{ status: 'geen-gegevens', uitleg: 'Er is nog geen volle week gemeten.' }}
      />
    )
  }
  // Alleen volle weken in de grafiek: de lopende week en de afgekapte eerste
  // week van de band tellen minder dagen en lezen naast volle weken als een
  // daling of als groei.
  const volleWeken = trend.weken.filter((w) => !w.lopend && !w.afgekapt)
  const max = mooieMax(
    volleWeken.reduce((m, w) => (w.actief.soort === 'waarde' && w.actief.n > m ? w.actief.n : m), 0),
  )
  const heeftOnderdrukt = volleWeken.some((w) => w.actief.soort !== 'waarde')
  // Een onderdrukte week wordt nooit als 0 of als kolom getekend, maar als
  // gearceerd vlak; de uitlezing zegt wat er wel bekend is ("< 5").
  const weekKolommen: VeldKolom[] = volleWeken.map((w) => {
    const waarde = `${celTekst(w.actief)} ${w.actief.soort === 'waarde' && w.actief.n === 1 ? 'gebruiker' : 'gebruikers'}`
    return {
      dag: w.week,
      label: weekLabel(w.week),
      soort: w.actief.soort !== 'waarde' ? 'niet-gemeten' : w.actief.n > 0 ? 'waarde' : 'leeg',
      hoogte: w.actief.soort === 'waarde' && max > 0 ? (w.actief.n / max) * 100 : 0,
      waarde,
      toelichting: null,
      markering: null,
      tip: `${weekLabel(w.week)}: ${waarde}`,
    }
  })
  return (
    <Kerncijfer
      {...basis}
      waarde={celTekst(laatste.actief)}
      waardeToelichting={
        laatste.actief.soort === 'waarde' ? 'gebruikers' : 'gebruikers: te weinig om te tonen'
      }
      periode={weekLabel(laatste.week)}
      vergelijking={
        trend.daarvoor
          ? {
              verschil: trend.verschil,
              met: `${weekKort(trend.daarvoor.week)}: ${celTekst(trend.daarvoor.actief)}`,
              reden: 'een van beide weken telt minder dan vijf gebruikers en draagt geen getal.',
              stijgingGunstig: true,
            }
          : undefined
      }
      grafiek={
        <>
          <DagReeksVeld
            compact
            kolommen={weekKolommen}
            referenties={[]}
            omschrijving={`Actieve gebruikers per week, ${volleWeken.length} volle weken`}
            idBasis="kern-gebruik"
            stap="week"
            veld={56}
            strook={9}
            tekenMaat={7}
            kleur={NEUTRALE_REEKS}
            arcering={ARCERING_STIJL}
          />
          <div className="font-mono text-[10px] text-[var(--ink-meta)]">
            <p className="flex justify-between gap-2 tabular-nums">
              <span>{weekKort(volleWeken[0].week)}</span>
              <span>{weekKort(volleWeken[volleWeken.length - 1].week)}</span>
            </p>
            {heeftOnderdrukt && <p>gearceerd = minder dan vijf of verborgen</p>}
          </div>
        </>
      }
    />
  )
}

function VitalsKerncijfer({ invoer }: { invoer: OntwikkelingInvoer }) {
  const { vitals, dagen } = invoer
  const basis = {
    label: 'Laadtijd (LCP)',
    definitie:
      'Tijd tot het grootste element op het scherm staat, gemeten bij echte bezoekers van productie. De p75 is de waarde die driekwart van de bezoeken haalt of beter.',
    href: webprestatiesHref(dagen, 'LCP'),
    linkLabel: 'Per maat en per route',
    testId: 'kerncijfer-vitals',
  }
  if (vitals.soort !== 'ok') {
    const status = vitals.soort === 'fout' ? 'meting-mislukt' : 'nvt'
    return <Kerncijfer {...basis} waarde={null} periode={`${dagen} dagen`} zonderMeting={{ status, uitleg: ZONDER[status] }} />
  }
  const v = vitals.data
  const grens = WEB_VITAL_THRESHOLDS.LCP
  const oordeel = v.p75 === null ? null : ratingForValue('LCP', v.p75)
  const OORDEEL_TEKST = { good: 'goed', 'needs-improvement': 'aandacht', poor: 'slecht' } as const
  return (
    <Kerncijfer
      {...basis}
      waarde={v.p75 === null ? null : formatVitalValue('LCP', v.p75)}
      waardeToelichting={
        oordeel
          ? `p75 · ${OORDEEL_TEKST[oordeel]} (goed tot ${formatVitalValue('LCP', grens.good)}) · ${getal(v.metingen)} metingen`
          : undefined
      }
      periode={`laatste ${v.dagen} dagen`}
      zonderMeting={
        v.p75 === null
          ? { status: 'geen-gegevens', uitleg: `Geen metingen van productie in de laatste ${v.dagen} dagen.` }
          : undefined
      }
      vergelijking={{
        verschil: null,
        met: '',
        reden: 'de bron levert de p75 per dag en over één periode, niet over twee periodes naast elkaar.',
        stijgingGunstig: false,
      }}
      grafiek={
        <DagReeks
          compact
          hoogte={56}
          idBasis="kern-vitals"
          omschrijving={`LCP p75 per dag, ${v.dagen} dagen, met de grenzen voor goed en slecht`}
          waardeTekst={(n) => formatVitalValue('LCP', n)}
          punten={v.reeks.map((p) => ({
            dag: p.dag,
            waarde: p.p75,
            lopend: p.lopend,
            toelichting: p.metingen > 0 ? `${getal(p.metingen)} metingen` : undefined,
          }))}
          referenties={[{ waarde: grens.good, label: 'grens goed', streep: 'lang' }]}
          markeringen={markeringenPerDag(invoer.ingrepen)}
        />
      }
    />
  )
}

export function OntwikkelingSectie({ invoer }: { invoer: OntwikkelingInvoer }) {
  return (
    <section className="mb-12" aria-labelledby="sectie-ontwikkeling" data-testid="sectie-ontwikkeling">
      <SectieKopMetId id="sectie-ontwikkeling" nummer="03 · Ontwikkeling" titel="Welke kant gaat het op">
        Elk cijfer gaat over volle dagen of weken; vandaag en de lopende week tellen niet mee in de vergelijking. In de
        grafieken staat een driehoek boven een dag met een release en een ruit boven een dag met een beheeractie.
      </SectieKopMetId>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GebruikKerncijfer invoer={invoer} />
        <FoutenKerncijfer invoer={invoer} />
        <AiKerncijfer invoer={invoer} />
        <VitalsKerncijfer invoer={invoer} />
      </div>
    </section>
  )
}

// ── 04: ingrepen ────────────────────────────────────────────────────

/** Hoeveel ingrepen het overzicht toont; de rest staat in de weergave Ingrepen. */
export const INGREPEN_OP_OVERZICHT = 6

export function IngrepenSectie({
  ingrepen,
  dagen,
  nu,
}: {
  ingrepen: Bron<IngrepenLezing>
  dagen: DashboardPeriode
  nu: Date
}) {
  return (
    <section className="mb-12" aria-labelledby="sectie-ingrepen" data-testid="sectie-ingrepen">
      <SectieKopMetId id="sectie-ingrepen" nummer="04 · Ingrepen" titel="Wat er laatst veranderd is">
        Releases en beheeracties die iets wijzigden. Wie een instelling alleen bekeek, staat hier niet.
      </SectieKopMetId>
      {ingrepen.soort !== 'ok' ? (
        <p className="border-l-2 border-warning bg-warning-bg px-4 py-3 text-sm text-[var(--ink-2)]">
          De audit-trail kon niet worden gelezen. Dat zegt niets over de ingrepen zelf.
        </p>
      ) : (
        <>
          <IngrepenLijst
            ingrepen={ingrepen.data.ingrepen.slice(0, INGREPEN_OP_OVERZICHT)}
            leeg="Geen releases of beheeracties in deze periode."
          />
          {ingrepen.data.actiesAfgekaptVanaf && (
            <p className="mt-2 text-xs text-[var(--ink-3)]" data-testid="ingrepen-afgekapt">
              De audit-trail is gelezen tot {momentTekst(ingrepen.data.actiesAfgekaptVanaf, nu)}; beheeracties van
              daarvoor kunnen ontbreken. Releases zijn volledig.
            </p>
          )}
          <p className="mt-2">
            <Link
              href={dashboardHref('ingrepen', dagen)}
              className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {ingrepen.data.ingrepen.length > INGREPEN_OP_OVERZICHT
                ? `Alle ${ingrepen.data.ingrepen.length} ingrepen, met de week ervoor en erna`
                : 'De week voor en na elke ingreep'}
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </p>
        </>
      )}
    </section>
  )
}
