'use client'

// ── Het nieuwsprofiel invullen: één body, twee hosts (Krant 2C, ADR 0192) ────
//
// Deze body rendert de velden van het nieuwsprofiel. Twee hosts gebruiken hem:
//   - de onboarding van de Krant (`components/krant/krant-onboarding.tsx`),
//     één groep velden per scherm;
//   - /mijn/nieuwsprofiel (`components/krant/nieuwsprofiel-scherm.tsx`), alle
//     groepen onder elkaar.
// Een nieuw veld of een nieuwe uitleg komt dus hier, nooit in een host.
//
// Alleen euro's en banden (B2, ADR 0172): geen vrijheidstijd, geen dagen, geen
// dagtarief — bewaakt door lib/krant/euro-only.test.ts, die ook
// components/krant scant. Bandlabels komen uit de bandgrenzen zelf
// (lib/krant/profiel.ts), zodat label en matcher nooit uit elkaar lopen.
//
// Elke uitleg is keuze · effect · waarom (eigenaarsnorm 13 sep 2026), als
// `Record<ProfielVeld, …>`: een nieuw veld compileert pas met zijn uitleg.
//
// "Weet ik niet" is overal geldig (null). Een scherm overslaan laat de velden
// ongemoeid; alleen wat je hier aanraakt gaat mee in de PUT (`putBodyUitConcept`).
//
// Geen AI: dit bestand roept geen model aan en importeert niets uit lib/ai
// (bron-scan in lib/krant/aanmelden.geen-ai.test.ts).

import { useCallback, useId, useState, type ReactNode } from 'react'
import { formatCurrency } from '@/lib/format'
import { NEWS_CATEGORIES, type NewsCategory } from '@/lib/news-item'
import {
  BELEGGINGEN_BANDEN,
  HYPOTHEEK_RESTSCHULD_BANDEN,
  INKOMEN_BANDEN,
  SPAARGELD_BANDEN,
  STUDIESCHULD_BANDEN,
  type Band,
  type NieuwsprofielV1,
} from '@/lib/krant/profiel'
import {
  DOELGROEP_SLEUTELS,
  GEBOORTEJAAR_MAX,
  GEBOORTEJAAR_MIN,
  PROFIEL_VELDEN,
  type DoelgroepSleutel,
  type ProfielVeld,
} from '@/lib/krant/profiel-velden'
import type { ProfielPutBody } from '@/lib/krant/contract'
import type { Herkomst } from '@/lib/krant/profiel-afleiding'

// ── Groepen: de vijf schermen van de onboarding = de vijf secties op /mijn ──

export interface ProfielGroep {
  id: string
  /** Korte naam (kicker in de onboarding, sectiekop op /mijn/nieuwsprofiel). */
  titel: string
  velden: readonly ProfielVeld[]
}

export const PROFIEL_GROEPEN: readonly ProfielGroep[] = [
  { id: 'wie', titel: 'Wie je bent', velden: ['geboortejaar', 'huishouden', 'kinderen'] },
  { id: 'inkomen', titel: 'Inkomen', velden: ['werk', 'inkomen'] },
  { id: 'wonen', titel: 'Wonen', velden: ['wonen', 'hypotheek', 'woonplan'] },
  { id: 'geld', titel: 'Geld opzij en schulden', velden: ['spaargeld', 'beleggingen', 'schulden'] },
  { id: 'pensioen', titel: 'Pensioen en rubrieken', velden: ['pensioenopbouw', 'rubrieken'] },
]

// ── Uitleg per veld: keuze · effect · waarom ─────────────────────────────────

export interface VeldUitleg {
  /** De naam boven het veld. */
  label: string
  /** Wat je kiest. */
  keuze: string
  /** Wat de Krant ermee doet. */
  effect: string
  /** Waarom dat ertoe doet. */
  waarom: string
}

export const PROFIEL_UITLEG: Record<ProfielVeld, VeldUitleg> = {
  geboortejaar: {
    label: 'Geboortejaar',
    keuze: 'Het jaar waarin je geboren bent.',
    effect: 'Nieuws over regels die aan een leeftijd hangen, zoals de AOW-leeftijd, zet de Krant dan in jouw situatie.',
    waarom: 'Zonder jaartal toont de Krant zulk nieuws wel, maar zonder te zeggen wat het voor jou betekent.',
  },
  huishouden: {
    label: 'Huishouden',
    keuze: 'Of je alleen woont, een fiscaal partner hebt of samenwoont zonder fiscaal partner.',
    effect: 'Regels voor partners, zoals het samen delen van het vrije vermogen in box 3, rekent de Krant dan voor jouw huishouden.',
    waarom: 'Met of zonder fiscaal partner maakt voor belasting vaak veel uit.',
  },
  kinderen: {
    label: 'Kinderen',
    keuze: 'Of je kinderen hebt, en hoe oud de jongste is.',
    effect: 'Nieuws over kinderopvang, kindregelingen of studiefinanciering komt naar voren als het jou raakt.',
    waarom: 'Veel regelingen gelden alleen zolang een kind een bepaalde leeftijd heeft.',
  },
  werk: {
    label: 'Werk',
    keuze: 'Waar je inkomen vandaan komt. Meer dan één antwoord kan.',
    effect: 'Nieuws voor ondernemers, voor wie in loondienst werkt of voor wie met pensioen is, spitst de Krant dan op jou toe.',
    waarom: 'Een regel voor zelfstandigen raakt iemand in loondienst niet, en andersom.',
  },
  inkomen: {
    label: 'Netto inkomen per maand',
    keuze: 'Je eigen netto inkomen per maand, in een band. Het inkomen van je partner telt niet mee.',
    effect: 'Bij nieuws over belasting of toeslagen laat de Krant in euro’s zien wat het bij een inkomen als het jouwe scheelt.',
    waarom: 'Een band is genoeg om mee te rekenen; een precies bedrag hoef je niet te geven.',
  },
  wonen: {
    label: 'Wonen',
    keuze: 'Of je huurt, een huis hebt gekocht of inwoont.',
    effect: 'Nieuws over huren, de woningmarkt en de hypotheekrente krijgt dan de plek die bij jou past.',
    waarom: 'Huurders en huizenbezitters raakt ander nieuws.',
  },
  hypotheek: {
    label: 'Hypotheek',
    keuze: 'Hoeveel hypotheek je nog ongeveer hebt en hoe lang je rente nog vaststaat.',
    effect: 'Bij nieuws over de hypotheekrente laat de Krant zien wat het bij een schuld als de jouwe betekent.',
    waarom: 'Loopt je rentevaste periode binnenkort af, dan raakt een renteverandering je eerder.',
  },
  woonplan: {
    label: 'Plannen om te kopen',
    keuze: 'Of je van plan bent binnen twee jaar een huis te kopen.',
    effect: 'Nieuws over leenregels en huizenprijzen krijgt dan meer gewicht.',
    waarom: 'Wie binnenkort wil kopen, heeft er nu mee te maken; anderen later.',
  },
  spaargeld: {
    label: 'Spaargeld',
    keuze: 'Hoeveel spaargeld je ongeveer hebt. Met een fiscaal partner: samen.',
    effect: 'Bij nieuws over de spaarrente of box 3 laat de Krant zien wat het bij een bedrag als het jouwe scheelt.',
    waarom: 'Of box 3 je raakt, hangt af van hoeveel vermogen je hebt.',
  },
  beleggingen: {
    label: 'Beleggingen',
    keuze: 'Hoeveel je ongeveer belegt, en in welke vorm.',
    effect: 'Nieuws over beleggen en box 3 spitst de Krant dan toe op jouw vermogen en vorm.',
    waarom: 'Voor crypto of een tweede woning gelden soms andere regels dan voor fondsen.',
  },
  schulden: {
    label: 'Schulden',
    keuze: 'Of je een studieschuld of een lening hebt. Meer dan één antwoord kan.',
    effect: 'Nieuws over studieschulden of kredieten komt naar voren als het jou raakt.',
    waarom: 'Een wijziging in de rente op studieschulden raakt alleen wie er een heeft.',
  },
  pensioenopbouw: {
    label: 'Pensioen',
    keuze: 'Of je pensioen opbouwt via je werkgever, en of je zelf inlegt in een lijfrente.',
    effect: 'Nieuws over het pensioenstelsel of over lijfrente spitst de Krant dan op jou toe.',
    waarom: 'Wie geen pensioen via zijn werk opbouwt, heeft met ander nieuws te maken.',
  },
  rubrieken: {
    label: 'Rubrieken',
    keuze: 'Over welke onderwerpen je vaker wilt lezen.',
    effect: 'Die rubrieken komen vaker in je tijdlijn. Niets kiezen betekent geen voorkeur.',
    waarom: 'Zo bepaal je mee wat je ziet, naast wat jouw situatie raakt.',
  },
}

// ── Labels per waarde (banden uit de bandgrenzen zelf) ───────────────────────

type KeuzeSleutel = Exclude<DoelgroepSleutel, 'geboortejaar'>
type WaardenVan<K extends KeuzeSleutel> = (typeof DOELGROEP_SLEUTELS)[K]['waarden'][number]

/** "Tot € 1.750" · "€ 1.750 – € 2.500" · "Meer dan € 5.500". */
export function bandLabel(band: Band): string {
  if (band.hi === null) return `Meer dan ${formatCurrency(band.lo)}`
  if (band.lo === 0) return `Tot ${formatCurrency(band.hi)}`
  return `${formatCurrency(band.lo)} – ${formatCurrency(band.hi)}`
}

function bandLabels<K extends string>(banden: Record<K, Band>): Record<K, string> {
  const uit = {} as Record<K, string>
  for (const sleutel of Object.keys(banden) as K[]) uit[sleutel] = bandLabel(banden[sleutel])
  return uit
}

export const WAARDE_LABELS: { [K in KeuzeSleutel]: Record<WaardenVan<K>, string> } = {
  huishouden: {
    alleen: 'Alleen',
    'fiscaal-partner': 'Met fiscaal partner',
    'samenwonend-zonder-fiscaal-partner': 'Samenwonend, geen fiscaal partner',
  },
  kinderen: {
    geen: 'Geen kinderen',
    'jongste-0-3': 'Jongste 0 tot 4 jaar',
    'jongste-4-11': 'Jongste 4 tot 12 jaar',
    'jongste-12-17': 'Jongste 12 tot 18 jaar',
    'alleen-18-plus': 'Alle kinderen 18 of ouder',
  },
  werk: {
    loondienst: 'In loondienst',
    zelfstandig: 'Zelfstandig ondernemer',
    dga: 'Directeur-grootaandeelhouder',
    uitkering: 'Uitkering',
    pensioen: 'Met pensioen',
    studie: 'Studie',
  },
  inkomen: bandLabels(INKOMEN_BANDEN),
  wonen: {
    'huur-sociaal': 'Sociale huur',
    'huur-vrije-sector': 'Huur, vrije sector',
    'koop-met-hypotheek': 'Koophuis met hypotheek',
    'koop-zonder-hypotheek': 'Koophuis zonder hypotheek',
    inwonend: 'Inwonend',
  },
  hypotheek_restschuld: bandLabels(HYPOTHEEK_RESTSCHULD_BANDEN),
  hypotheek_rentevast: {
    'tot-1-jaar': 'Loopt binnen een jaar af',
    '2-5-jaar': 'Nog 2 tot 5 jaar vast',
    'boven-5-jaar': 'Nog meer dan 5 jaar vast',
    variabel: 'Variabele rente',
  },
  woonplan: {
    'kopen-binnen-2-jaar': 'Ja, binnen twee jaar',
    'geen-koopplan': 'Nee',
  },
  spaargeld: bandLabels(SPAARGELD_BANDEN),
  beleggingen: { ...bandLabels(BELEGGINGEN_BANDEN), geen: 'Ik beleg niet' },
  beleggingen_vorm: {
    fondsen: 'Fondsen',
    aandelen: 'Losse aandelen',
    crypto: 'Crypto',
    'tweede-woning': 'Tweede woning',
  },
  schulden: {
    'studieschuld-tot-15k': `Studieschuld, ${bandLabel(STUDIESCHULD_BANDEN['studieschuld-tot-15k']).toLowerCase()}`,
    'studieschuld-15k-40k': `Studieschuld, ${bandLabel(STUDIESCHULD_BANDEN['studieschuld-15k-40k'])}`,
    'studieschuld-boven-40k': `Studieschuld, ${bandLabel(STUDIESCHULD_BANDEN['studieschuld-boven-40k']).toLowerCase()}`,
    'consumptief-krediet': 'Persoonlijke lening of krediet',
    geen: 'Geen schulden',
  },
  pensioen_werkgever: {
    ja: 'Ja, via mijn werk',
    nee: 'Nee',
    'weet-niet': 'Weet ik niet',
  },
  pensioen_lijfrente: {
    ja: 'Ja, ik leg zelf in',
    nee: 'Nee',
  },
}

export const RUBRIEK_LABELS: Record<NewsCategory, string> = {
  fiscaal: 'Belasting',
  rente: 'Rente',
  woningmarkt: 'Woningmarkt',
  beleggingen: 'Beleggen',
  pensioen: 'Pensioen',
  macro: 'Economie',
}

const WEET_NIET = 'Weet ik niet'

// ── Concept: wat de host bijhoudt ────────────────────────────────────────────

type ZetVeld = <K extends ProfielVeld>(veld: K, waarde: NieuwsprofielV1[K]) => void

/** Het concept van de host: het profiel zoals het nu op het scherm staat + wat je aanraakte. */
export function useProfielConcept(start: NieuwsprofielV1) {
  const [profiel, setProfiel] = useState<NieuwsprofielV1>(start)
  const [gewijzigd, setGewijzigd] = useState<ReadonlySet<ProfielVeld>>(() => new Set())
  const zet = useCallback<ZetVeld>((veld, waarde) => {
    setProfiel((p) => ({ ...p, [veld]: waarde }))
    setGewijzigd((g) => new Set(g).add(veld))
  }, [])
  /** Na een geslaagde opslag: het profiel van de server, niets meer gewijzigd. */
  const opgeslagen = useCallback((nieuw: NieuwsprofielV1) => {
    setProfiel(nieuw)
    setGewijzigd(new Set())
  }, [])
  return { profiel, gewijzigd, zet, opgeslagen }
}

const RUBRIEK_SET = new Set<string>(NEWS_CATEGORIES)

/**
 * De PUT-body: ALLEEN de aangeraakte velden (optioneel beperkt tot één groep),
 * zodat een overgeslagen veld ongemoeid blijft. `null` = bewust "weet ik niet".
 * Rubrieken die de PUT niet kent (een oude of afgeleide waarde) vallen weg.
 * Geen aangeraakt veld → null: er is niets om op te slaan.
 */
export function putBodyUitConcept(
  profiel: NieuwsprofielV1,
  gewijzigd: ReadonlySet<ProfielVeld>,
  binnen: readonly ProfielVeld[] = PROFIEL_VELDEN,
): ProfielPutBody | null {
  const body: Record<string, unknown> = {}
  for (const veld of binnen) {
    if (!gewijzigd.has(veld)) continue
    if (veld === 'rubrieken') {
      const lijst = (profiel.rubrieken ?? []).filter((r) => RUBRIEK_SET.has(r))
      body.rubrieken = lijst.length > 0 ? lijst : null
    } else {
      body[veld] = profiel[veld]
    }
  }
  return Object.keys(body).length > 0 ? (body as ProfielPutBody) : null
}

// ── De body ──────────────────────────────────────────────────────────────────

export interface ProfielBodyProps {
  profiel: NieuwsprofielV1
  /** Welke velden deze host nu toont (één groep in de onboarding, alles op /mijn). */
  velden: readonly ProfielVeld[]
  zet: ZetVeld
  gewijzigd: ReadonlySet<ProfielVeld>
  /** Herkomst per veld van de server; 'zelf' + null = eerder bewust "weet ik niet". */
  herkomst?: Herkomst
}

export function ProfielBody({ profiel, velden, zet, gewijzigd, herkomst = {} }: ProfielBodyProps) {
  const basisId = useId()
  const expliciet = (veld: ProfielVeld) => gewijzigd.has(veld) || herkomst[veld] === 'zelf'
  const afgeleid = (veld: ProfielVeld) => !gewijzigd.has(veld) && herkomst[veld] === 'afgeleid'

  return (
    <div className="space-y-9">
      {velden.map((veld) => {
        if (veld === 'hypotheek' && profiel.wonen !== 'koop-met-hypotheek') return null
        const naam = `${basisId}-${veld}`
        return (
          <VeldBlok key={veld} veld={veld} afgeleid={afgeleid(veld)}>
            {renderVeld(veld, naam, profiel, zet, expliciet(veld))}
          </VeldBlok>
        )
      })}
    </div>
  )
}

function renderVeld(veld: ProfielVeld, naam: string, profiel: NieuwsprofielV1, zet: ZetVeld, expliciet: boolean): ReactNode {
  switch (veld) {
    case 'geboortejaar':
      return <GeboortejaarVeld naam={naam} waarde={profiel.geboortejaar} expliciet={expliciet} onZet={(w) => zet('geboortejaar', w)} />
    case 'huishouden':
    case 'kinderen':
    case 'inkomen':
    case 'wonen':
    case 'woonplan':
    case 'spaargeld':
      return (
        <EenKeuze
          naam={naam}
          labels={WAARDE_LABELS[veld] as Record<string, string>}
          waarde={profiel[veld]}
          expliciet={expliciet}
          onKies={(w) => zet(veld, w as NieuwsprofielV1[typeof veld])}
        />
      )
    case 'werk':
      return (
        <MeerKeuze
          naam={naam}
          labels={WAARDE_LABELS.werk}
          waarde={profiel.werk}
          expliciet={expliciet}
          onZet={(w) => zet('werk', w as NieuwsprofielV1['werk'])}
        />
      )
    case 'schulden':
      return (
        <MeerKeuze
          naam={naam}
          labels={WAARDE_LABELS.schulden}
          waarde={profiel.schulden}
          expliciet={expliciet}
          toggle={schuldenToggle}
          onZet={(w) => zet('schulden', w as NieuwsprofielV1['schulden'])}
        />
      )
    case 'hypotheek':
      return (
        <div className="space-y-4">
          <SubLabel>Restschuld</SubLabel>
          <EenKeuze
            naam={`${naam}-restschuld`}
            labels={WAARDE_LABELS.hypotheek_restschuld}
            waarde={profiel.hypotheek.restschuld}
            expliciet={expliciet}
            onKies={(w) => zet('hypotheek', { ...profiel.hypotheek, restschuld: w as NieuwsprofielV1['hypotheek']['restschuld'] })}
          />
          <SubLabel>Rentevaste periode</SubLabel>
          <EenKeuze
            naam={`${naam}-rentevast`}
            labels={WAARDE_LABELS.hypotheek_rentevast}
            waarde={profiel.hypotheek.rentevast}
            expliciet={expliciet}
            onKies={(w) => zet('hypotheek', { ...profiel.hypotheek, rentevast: w as NieuwsprofielV1['hypotheek']['rentevast'] })}
          />
        </div>
      )
    case 'beleggingen':
      return (
        <div className="space-y-4">
          <SubLabel>Hoeveel</SubLabel>
          <EenKeuze
            naam={`${naam}-band`}
            labels={WAARDE_LABELS.beleggingen}
            waarde={profiel.beleggingen.band}
            expliciet={expliciet}
            onKies={(w) =>
              zet('beleggingen', {
                band: w as NieuwsprofielV1['beleggingen']['band'],
                // Wie niet belegt, heeft geen vorm.
                vorm: w === 'geen' ? null : profiel.beleggingen.vorm,
              })
            }
          />
          {profiel.beleggingen.band !== 'geen' && (
            <>
              <SubLabel>In welke vorm</SubLabel>
              <MeerKeuze
                naam={`${naam}-vorm`}
                labels={WAARDE_LABELS.beleggingen_vorm}
                waarde={profiel.beleggingen.vorm}
                expliciet={expliciet}
                onZet={(w) => zet('beleggingen', { ...profiel.beleggingen, vorm: w as NieuwsprofielV1['beleggingen']['vorm'] })}
              />
            </>
          )}
        </div>
      )
    case 'pensioenopbouw':
      return (
        <div className="space-y-4">
          <SubLabel>Via je werkgever</SubLabel>
          <EenKeuze
            naam={`${naam}-werkgever`}
            labels={WAARDE_LABELS.pensioen_werkgever}
            waarde={profiel.pensioenopbouw.werkgever}
            expliciet={expliciet}
            // 'weet-niet' is hier een eigen antwoord; geen tweede "weet ik niet".
            zonderWeetNiet
            onKies={(w) =>
              zet('pensioenopbouw', { ...profiel.pensioenopbouw, werkgever: w as NieuwsprofielV1['pensioenopbouw']['werkgever'] })
            }
          />
          <SubLabel>Lijfrente</SubLabel>
          <EenKeuze
            naam={`${naam}-lijfrente`}
            labels={WAARDE_LABELS.pensioen_lijfrente}
            waarde={profiel.pensioenopbouw.lijfrente}
            expliciet={expliciet}
            onKies={(w) =>
              zet('pensioenopbouw', { ...profiel.pensioenopbouw, lijfrente: w as NieuwsprofielV1['pensioenopbouw']['lijfrente'] })
            }
          />
        </div>
      )
    case 'rubrieken':
      return (
        <MeerKeuze
          naam={naam}
          labels={RUBRIEK_LABELS}
          waarde={(profiel.rubrieken ?? []).filter((r) => RUBRIEK_SET.has(r))}
          expliciet={expliciet}
          weetNietLabel="Geen voorkeur"
          onZet={(w) => zet('rubrieken', w)}
        />
      )
  }
}

/**
 * Schulden: "geen" sluit de rest uit, en je hebt hoogstens één studieschuldband.
 * Pure functie, zodat de test de regels los kan toetsen.
 */
export function schuldenToggle(huidig: readonly string[], waarde: string): string[] {
  if (huidig.includes(waarde)) return huidig.filter((w) => w !== waarde)
  if (waarde === 'geen') return ['geen']
  const zonderGeen = huidig.filter((w) => w !== 'geen')
  const zonderAndereBand = waarde.startsWith('studieschuld-') ? zonderGeen.filter((w) => !w.startsWith('studieschuld-')) : zonderGeen
  return [...zonderAndereBand, waarde]
}

// ── Bouwstenen ───────────────────────────────────────────────────────────────

function VeldBlok({ veld, afgeleid, children }: { veld: ProfielVeld; afgeleid: boolean; children: ReactNode }) {
  const uitleg = PROFIEL_UITLEG[veld]
  return (
    <fieldset className="min-w-0">
      <legend className="text-[15px] font-semibold text-[var(--ink)]">{uitleg.label}</legend>
      <p
        className="mt-1.5 max-w-[62ch] text-[13px] italic leading-snug text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {uitleg.keuze} {uitleg.effect} {uitleg.waarom}
      </p>
      {afgeleid && (
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--module-active-700)]">
          Afgeleid uit wat je in de app hebt vastgelegd
        </p>
      )}
      <div className="mt-3">{children}</div>
    </fieldset>
  )
}

function SubLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">{children}</p>
}

const CHIP =
  'inline-flex min-h-11 cursor-pointer items-center border border-[var(--border-ed)] bg-[var(--paper)] px-3.5 py-2 text-sm text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] ' +
  'has-[:checked]:border-[var(--ink)] has-[:checked]:bg-[var(--ink)] has-[:checked]:text-[var(--paper)] ' +
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--module-active-500)]'

function Chip({
  type,
  naam,
  checked,
  onChange,
  children,
}: {
  type: 'radio' | 'checkbox'
  naam: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label className={CHIP}>
      <input type={type} name={naam} className="sr-only" checked={checked} onChange={onChange} />
      {children}
    </label>
  )
}

function EenKeuze({
  naam,
  labels,
  waarde,
  expliciet,
  onKies,
  zonderWeetNiet = false,
}: {
  naam: string
  labels: Record<string, string>
  waarde: string | null
  expliciet: boolean
  onKies: (waarde: string | null) => void
  zonderWeetNiet?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(labels).map(([sleutel, label]) => (
        <Chip key={sleutel} type="radio" naam={naam} checked={waarde === sleutel} onChange={() => onKies(sleutel)}>
          {label}
        </Chip>
      ))}
      {!zonderWeetNiet && (
        <Chip type="radio" naam={naam} checked={waarde === null && expliciet} onChange={() => onKies(null)}>
          {WEET_NIET}
        </Chip>
      )}
    </div>
  )
}

function MeerKeuze<W extends string>({
  naam,
  labels,
  waarde,
  expliciet,
  onZet,
  toggle,
  weetNietLabel = WEET_NIET,
}: {
  naam: string
  labels: Record<W, string>
  waarde: readonly string[] | null
  expliciet: boolean
  onZet: (waarde: W[] | null) => void
  toggle?: (huidig: readonly string[], waarde: string) => string[]
  weetNietLabel?: string
}) {
  const huidig = waarde ?? []
  const wissel = (sleutel: string) => {
    const volgende = toggle ? toggle(huidig, sleutel) : huidig.includes(sleutel) ? huidig.filter((w) => w !== sleutel) : [...huidig, sleutel]
    // Een lege lijst betekent niets: dan "weet ik niet" (null), zoals het schema wil.
    onZet(volgende.length > 0 ? (volgende as W[]) : null)
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.entries(labels) as [string, string][]).map(([sleutel, label]) => (
        <Chip key={sleutel} type="checkbox" naam={naam} checked={huidig.includes(sleutel)} onChange={() => wissel(sleutel)}>
          {label}
        </Chip>
      ))}
      <Chip type="checkbox" naam={`${naam}-leeg`} checked={waarde === null && expliciet} onChange={() => onZet(null)}>
        {weetNietLabel}
      </Chip>
    </div>
  )
}

function GeboortejaarVeld({
  naam,
  waarde,
  expliciet,
  onZet,
}: {
  naam: string
  waarde: number | null
  expliciet: boolean
  onZet: (waarde: number | null) => void
}) {
  const [tekst, setTekst] = useState(waarde === null ? '' : String(waarde))
  const [fout, setFout] = useState<string | null>(null)
  const foutId = `${naam}-fout`

  function wijzig(nieuw: string) {
    const schoon = nieuw.replace(/\D/g, '').slice(0, 4)
    setTekst(schoon)
    if (schoon.length < 4) {
      setFout(null)
      return
    }
    const jaar = Number(schoon)
    if (jaar < GEBOORTEJAAR_MIN || jaar > GEBOORTEJAAR_MAX) {
      setFout(`Vul een jaar in tussen ${GEBOORTEJAAR_MIN} en ${GEBOORTEJAAR_MAX}.`)
      return
    }
    setFout(null)
    onZet(jaar)
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div>
        <label htmlFor={naam} className="sr-only">
          Geboortejaar
        </label>
        <input
          id={naam}
          type="text"
          inputMode="numeric"
          autoComplete="bday-year"
          placeholder="bijv. 1985"
          value={tekst}
          onChange={(e) => wijzig(e.target.value)}
          aria-invalid={fout ? true : undefined}
          aria-describedby={fout ? foutId : undefined}
          className="min-h-11 w-32 border border-[var(--border-ed)] bg-[var(--paper)] px-3 font-mono text-[15px] tabular-nums text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
        />
        {fout && (
          <p id={foutId} className="mt-1.5 text-[13px] text-negative">
            {fout}
          </p>
        )}
      </div>
      <Chip
        type="checkbox"
        naam={`${naam}-leeg`}
        checked={waarde === null && expliciet && tekst === ''}
        onChange={() => {
          setTekst('')
          setFout(null)
          onZet(null)
        }}
      >
        {WEET_NIET}
      </Chip>
    </div>
  )
}
