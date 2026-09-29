import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PageVerdictOpening } from '@/components/editorial/page-verdict-opening'
import { AlleSchermen } from '@/components/app/beheer/dashboard/alle-schermen'
import { DashboardNavigatie } from '@/components/app/beheer/dashboard/navigatie'
import {
  AandachtSectie,
  IngrepenSectie,
  OntwikkelingSectie,
  SectieKopMetId,
  StatusSectie,
} from '@/components/app/beheer/dashboard/overzicht'
import { KerncijfersSkelet, SectieSkelet } from '@/components/app/beheer/dashboard/skelet'
import { Verantwoording } from '@/components/app/beheer/dashboard/verantwoording'
import { Ververs } from '@/components/app/beheer/dashboard/ververs'
import {
  AiWeergave,
  BetrouwbaarheidWeergave,
  IngrepenWeergave,
  type Wisselkoers,
} from '@/components/app/beheer/dashboard/weergaven'
import { EMPTY_BEHEER_INBOX_COUNTS } from '@/lib/beheer-inbox-counts'
import { bouwAiBeeld, type AiBeeld } from '@/lib/beheer/dashboard/ai-reeks'
import { omgevingTelt, type DashboardFeiten } from '@/lib/beheer/dashboard/feiten'
import { parseOnderwerp, parsePeriode, type DashboardPeriode } from '@/lib/beheer/dashboard/doorklik'
import {
  laadAiAanroepen,
  laadDashboardFeiten,
  laadFoutMomenten,
  laadGebruik,
  laadIngrepen,
  laadVitalsReeks,
  magDashboardZien,
} from '@/lib/beheer/dashboard/loader'
import { bouwOnderdelen, bouwOordeel } from '@/lib/beheer/dashboard/onderdelen'
import {
  bouwFoutenVerloop,
  bouwVitalsVerloop,
  type FoutenVerloop,
  type VitalsVerloop,
} from '@/lib/beheer/dashboard/ontwikkeling'
import { bouwAandacht } from '@/lib/beheer/dashboard/signalen'
import { bronOk, type Bron, type StatusToon } from '@/lib/beheer/dashboard/status'
import { fetchBatchForexRates } from '@/lib/forex'
import { leverageStatusTextClass, type LeverageStatus } from '@/lib/leverage-status'
import { formatAmsterdamTime } from '@/lib/tz'

export const dynamic = 'force-dynamic'

/**
 * /beheer — het beheerdashboard.
 *
 * De startpagina van beheer beantwoordt vijf vragen, in deze volgorde: wat
 * vraagt aandacht, hoe staat elk onderdeel ervoor, welke kant gaat het op, wat
 * is er veranderd, en waar stuur ik bij. De bestaande beheerschermen blijven
 * de plek waar je bijstuurt; dit scherm wijst ze aan.
 *
 * Opbouw:
 *  - lezen via server-loaders (ADR 0058), per verzoek gememoïseerd, zodat
 *    secties die dezelfde bron nodig hebben hem één keer lezen;
 *  - elke sectie stroomt los binnen (Suspense): een trage bron houdt de rest
 *    niet op, en de laadtoestand is per sectie zichtbaar;
 *  - weergave en periode staan in de URL; de verdiepingen laden alleen wat zij
 *    tonen.
 *
 * Toegang: de layout weert niet-beheerders al, maar dit scherm leest via de
 * service-role en zet de check daarom zelf ook (zoals /beheer/jobs en
 * /beheer/kpi). De loaders zijn bovendien zelf fail-closed.
 */

const ONDERWERP_VAN_KOP = 'Het platform'

const TOON_NAAR_STATUS: Record<StatusToon, LeverageStatus> = {
  positive: 'good',
  warning: 'warn',
  negative: 'bad',
  neutral: 'neutral',
}

/** De rest van de zin in de kop; het onderwerp staat al in de eerste byte. */
async function OordeelRest() {
  const feiten = await laadDashboardFeiten()
  if (!feiten) return null
  const oordeel = bouwOordeel(bouwAandacht(feiten), bouwOnderdelen(feiten))
  return (
    <>
      {oordeel.zin.voor.slice(ONDERWERP_VAN_KOP.length)}{' '}
      <em
        className={`font-normal italic ${leverageStatusTextClass(TOON_NAAR_STATUS[oordeel.toon])}`}
        data-testid="dashboard-oordeel"
      >
        {oordeel.zin.oordeel}
      </em>
      {oordeel.zin.na}.
    </>
  )
}

function GeenFeiten() {
  return (
    <p
      role="alert"
      className="mb-12 border-l-2 border-warning bg-warning-bg px-4 py-3 text-sm text-[var(--ink-2)]"
    >
      Het dashboard kon niet meten. Dat zegt niets over het platform zelf. Probeer het opnieuw met &ldquo;Nu
      meten&rdquo;; de beheerschermen hieronder blijven bereikbaar.
    </p>
  )
}

const OMGEVING_NAAM: Record<DashboardFeiten['omgeving'], string> = {
  production: 'productie',
  preview: 'een voorbeeldomgeving',
  development: 'een ontwikkelomgeving',
}

/**
 * Buiten productie: zeg wat dit scherm wel en niet beoordeelt. De gegevens
 * komen uit de gekoppelde database, maar de sleutels en kanalen zijn die van
 * deze ene server en zeggen niets over productie.
 */
function OmgevingMelding({ feiten }: { feiten: DashboardFeiten }) {
  if (omgevingTelt(feiten)) return null
  return (
    <p
      className="mb-8 border-l-2 border-[var(--border-md)] bg-[var(--subtle)] px-4 py-3 text-sm leading-relaxed text-[var(--ink-2)]"
      data-testid="omgeving-melding"
    >
      Dit scherm draait op {OMGEVING_NAAM[feiten.omgeving]}. De cijfers komen uit de gekoppelde database. Instellingen
      van de server zelf (de sleutel waarmee crons zich melden, de e-mailprovider, het meldkanaal) zijn hier niet
      beoordeeld: ze zeggen niets over productie.
    </p>
  )
}

async function NuSecties({ nu }: { nu: Date }) {
  const feiten = await laadDashboardFeiten()
  if (!feiten) return <GeenFeiten />
  const items = bouwAandacht(feiten)
  const rijen = bouwOnderdelen(feiten)
  return (
    <>
      <OmgevingMelding feiten={feiten} />
      <AandachtSectie
        items={items}
        nu={nu}
        afwijkendZonderSignaal={bouwOordeel(items, rijen).afwijkendZonderSignaal}
      />
      <StatusSectie rijen={rijen} nu={nu} />
    </>
  )
}

async function foutenVerloop(
  welke: 'alle' | 'ai',
  nu: Date,
  dagen: DashboardPeriode,
): Promise<Bron<FoutenVerloop>> {
  const momenten = await laadFoutMomenten()
  return momenten.soort === 'ok' ? bronOk(bouwFoutenVerloop(momenten.data, welke, { nu, dagen })) : momenten
}

async function aiBeeld(nu: Date, dagen: DashboardPeriode): Promise<Bron<AiBeeld>> {
  const [aanroepen, momenten] = await Promise.all([laadAiAanroepen(dagen), laadFoutMomenten()])
  if (aanroepen.soort !== 'ok') return aanroepen
  // Zonder foutenlogboek zijn de mislukte aanroepen niet gemeten: het hele
  // venster telt dan als afgekapt, zodat er geen aandeel uit nullen ontstaat.
  return bronOk(
    bouwAiBeeld({
      aanroepen: aanroepen.data.rijen,
      aanroepenAfgekaptVanaf: aanroepen.data.afgekaptVanaf,
      mislukt: momenten.soort === 'ok' ? momenten.data.ai : [],
      foutenAfgekaptVanaf: momenten.soort === 'ok' ? momenten.data.afgekaptVanaf : nu.toISOString(),
      nu,
      dagen,
    }),
  )
}

async function vitalsVerloop(nu: Date, dagen: DashboardPeriode): Promise<Bron<VitalsVerloop>> {
  const reeks = await laadVitalsReeks(dagen)
  return reeks.soort === 'ok' ? bronOk(bouwVitalsVerloop(reeks.data, 'LCP', nu)) : reeks
}

async function Ontwikkeling({ nu, dagen }: { nu: Date; dagen: DashboardPeriode }) {
  const [fouten, ai, gebruik, vitals, ingrepen] = await Promise.all([
    foutenVerloop('alle', nu, dagen),
    aiBeeld(nu, dagen),
    laadGebruik(),
    vitalsVerloop(nu, dagen),
    laadIngrepen(dagen),
  ])
  return (
    <OntwikkelingSectie
      invoer={{
        dagen,
        nu,
        fouten,
        ai,
        gebruik,
        vitals,
        ingrepen: ingrepen.soort === 'ok' ? ingrepen.data.ingrepen : [],
      }}
    />
  )
}

async function Ingrepen({ nu, dagen }: { nu: Date; dagen: DashboardPeriode }) {
  return <IngrepenSectie ingrepen={await laadIngrepen(dagen)} dagen={dagen} nu={nu} />
}

async function Schermen() {
  const feiten = await laadDashboardFeiten()
  return (
    <section className="mb-12" aria-labelledby="sectie-schermen" data-testid="sectie-schermen">
      <SectieKopMetId id="sectie-schermen" nummer="05 · Bijsturen" titel="Alle beheerschermen">
        Hier stuur je bij. Niet elk scherm heeft een indicator op dit dashboard; elk scherm is hier wel te bereiken.
      </SectieKopMetId>
      <AlleSchermen counts={feiten?.inbakken ?? EMPTY_BEHEER_INBOX_COUNTS} />
    </section>
  )
}

async function Betrouwbaarheid({ nu, dagen }: { nu: Date; dagen: DashboardPeriode }) {
  const [feiten, verloop, vitals, ingrepen] = await Promise.all([
    laadDashboardFeiten(),
    foutenVerloop('alle', nu, dagen),
    vitalsVerloop(nu, dagen),
    laadIngrepen(dagen),
  ])
  if (!feiten) return <GeenFeiten />
  return (
    <BetrouwbaarheidWeergave
      dagen={dagen}
      nu={nu}
      feiten={feiten}
      verloop={verloop}
      vitals={vitals}
      ingrepen={ingrepen.soort === 'ok' ? ingrepen.data.ingrepen : []}
    />
  )
}

/**
 * De AI-tarieven staan in dollars; het scherm toont euro's, met dezelfde
 * omrekening als /beheer/jobs. Valt de live koers weg, dan geeft de bron een
 * benadering terug en zegt het scherm dat erbij.
 */
async function wisselkoers(): Promise<Wisselkoers> {
  const koersen = await fetchBatchForexRates(['USD']).catch(() => null)
  const usd = koersen?.get('USD') ?? null
  return { usdNaarEur: usd?.rate ?? 1, benadering: usd === null || usd.source === 'fallback' }
}

async function Ai({ nu, dagen }: { nu: Date; dagen: DashboardPeriode }) {
  const [feiten, beeld, koers, ingrepen] = await Promise.all([
    laadDashboardFeiten(),
    aiBeeld(nu, dagen),
    wisselkoers(),
    laadIngrepen(dagen),
  ])
  if (!feiten) return <GeenFeiten />
  return (
    <AiWeergave
      dagen={dagen}
      nu={nu}
      gezondheid={feiten.ai}
      aiUit={feiten.platform.soort === 'ok' && !feiten.platform.data.status.killSwitches.ai}
      beeld={beeld}
      koers={koers}
      ingrepen={ingrepen.soort === 'ok' ? ingrepen.data.ingrepen : []}
    />
  )
}

async function IngrepenVerdieping({ nu, dagen }: { nu: Date; dagen: DashboardPeriode }) {
  const [ingrepen, fouten, aiFouten] = await Promise.all([
    laadIngrepen(dagen),
    foutenVerloop('alle', nu, dagen),
    foutenVerloop('ai', nu, dagen),
  ])
  return <IngrepenWeergave dagen={dagen} nu={nu} ingrepen={ingrepen} fouten={fouten} aiFouten={aiFouten} />
}

export default async function BeheerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await magDashboardZien())) redirect('/overzicht')

  const params = await searchParams
  const onderwerp = parseOnderwerp(params.onderwerp)
  const dagen = parsePeriode(params.dagen)
  const nu = new Date()
  // De sleutel laat de laadtoestand terugkomen bij een andere weergave of periode.
  const sleutel = `${onderwerp}-${dagen}`

  return (
    <div className="beheer-viz" data-testid="beheer-dashboard" data-onderwerp={onderwerp}>
      <PageVerdictOpening
        pageName="Beheer"
        sentenceSlot={{
          subject: ONDERWERP_VAN_KOP,
          rest: (
            <Suspense fallback={<span className="font-normal italic text-[var(--ink-3)]"> wordt gemeten</span>}>
              <OordeelRest />
            </Suspense>
          ),
        }}
        deck="Wat aandacht vraagt, hoe elk onderdeel ervoor staat en welke kant het op gaat. Elk cijfer noemt zijn periode en zijn bron; wat niet gemeten is, staat er als niet gemeten."
      >
        <Ververs gemetenOm={formatAmsterdamTime(nu)} />
      </PageVerdictOpening>

      <div className="mt-6">
        <DashboardNavigatie onderwerp={onderwerp} dagen={dagen} />
      </div>

      <div className="mt-8">
        {onderwerp === 'overzicht' && (
          <>
            <Suspense key={`nu-${sleutel}`} fallback={<SectieSkelet wat="Aandacht en status" rijen={4} />}>
              <NuSecties nu={nu} />
            </Suspense>
            <Suspense key={`verloop-${sleutel}`} fallback={<KerncijfersSkelet />}>
              <Ontwikkeling nu={nu} dagen={dagen} />
            </Suspense>
            <Suspense key={`ingrepen-${sleutel}`} fallback={<SectieSkelet wat="Ingrepen" rijen={2} />}>
              <Ingrepen nu={nu} dagen={dagen} />
            </Suspense>
            <Suspense key={`schermen-${sleutel}`} fallback={<SectieSkelet wat="Beheerschermen" rijen={2} />}>
              <Schermen />
            </Suspense>
            <Verantwoording />
          </>
        )}
        {onderwerp === 'betrouwbaarheid' && (
          <Suspense key={sleutel} fallback={<SectieSkelet wat="Betrouwbaarheid" rijen={4} />}>
            <Betrouwbaarheid nu={nu} dagen={dagen} />
          </Suspense>
        )}
        {onderwerp === 'ai' && (
          <Suspense key={sleutel} fallback={<SectieSkelet wat="Fin & AI" rijen={4} />}>
            <Ai nu={nu} dagen={dagen} />
          </Suspense>
        )}
        {onderwerp === 'ingrepen' && (
          <Suspense key={sleutel} fallback={<SectieSkelet wat="Ingrepen" rijen={4} />}>
            <IngrepenVerdieping nu={nu} dagen={dagen} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
