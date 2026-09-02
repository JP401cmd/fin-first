import type { ReactNode } from 'react'
import Link from 'next/link'
import { Milestone } from 'lucide-react'
import {
  Button,
  OrnamentColophon,
  PageInfoButton,
  PageOpening,
  SectionLabel,
} from '@/components/editorial'
import { amsterdamParts, NL_MONTH_FULL } from '@/lib/tz'
import { MaskedAmount } from '@/components/app/masked-amount'
import { formatCurrency } from '@/lib/format'
import { getPageInfo } from '@/lib/page-info-content'
import type {
  MilestoneTimelineEntry,
  MilestoneTimelineYear,
} from '@/lib/milestones/timeline'

/**
 * MijlpalenTijdlijn — "Dit heb je bereikt" op /mijn/mijlpalen.
 *
 * De leesvorm van de mijlpaal-log (ADR 0123): één regel per gepasseerde
 * drempel, chronologisch aflopend, gegroepeerd per jaar. Historie dus — geen
 * stand die vandaag opnieuw waar is, en geen projectie.
 *
 * ── Zuivere presentatie ────────────────────────────────────────────────────
 * Dit bestand rekent niets en haalt niets op. De ordening en de copy komen
 * kant-en-klaar uit `lib/milestones/timeline.ts` (`buildMilestoneTimeline`),
 * dat op zijn beurt `buildMilestoneCopy` gebruikt. Er staan hier alleen
 * datum-formatters en opmaak. Geen hooks, dus bewust géén `'use client'`: de
 * server-page rendert dit direct; de enige client-eilanden zijn de
 * `PageInfoButton` (popover) en de `MaskedAmount`-spans (privacy-context).
 *
 * ── Toon ───────────────────────────────────────────────────────────────────
 * Krant: constateren, geen aanmoediging, geen emoji, geen confetti. Een
 * geseede rij (`source='seed'`) is historisch gedateerd op de snapshots die er
 * toevallig waren; die onzekerheid staat er letterlijk bij ("omstreeks"),
 * liever dan een precisie te suggereren die de log niet heeft.
 */

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * Datumlabel van één rij — in Europe/Amsterdam via de canonieke tz-helpers
 * (een kale Intl-format zonder timeZone draait op Vercel in UTC en zet een
 * passage om 00:30 NL-tijd op gisteren, rond de jaarwisseling zelfs in het
 * verkeerde jaargroep-kopje).
 *
 *  - 'exact'     → "12 maart" (jaarkop draagt het jaartal al)
 *  - 'omstreeks' → "omstreeks 12 maart" — historisch gedateerd op snapshots,
 *    de dag is een benadering (ADR 0123 §5)
 *  - 'onbekend'  → geen datumregel: de seed kon deze gebeurtenis niet dateren
 *    en de "Zonder datum"-jaargroep zegt dat al — "omstreeks vandaag" zou een
 *    onjuiste bewering zijn over iets dat jaren geleden gebeurde.
 */
function datumLabel(entry: MilestoneTimelineEntry): string | null {
  if (entry.dateKind === 'onbekend') return null
  const ms = Date.parse(entry.row.achieved_at)
  if (Number.isNaN(ms)) return null
  // Volle maandnaam ("12 maart") in de editorial datumregel; de tz-helper
  // formatAmsterdamDayMonth levert de korte vorm ("12 mrt"), dus hier de delen
  // + NL_MONTH_FULL — wél via amsterdamParts, nooit de server-tijdzone.
  const p = amsterdamParts(new Date(ms))
  const datum = `${p.day} ${NL_MONTH_FULL[p.month - 1]}`
  return entry.dateKind === 'omstreeks' ? `omstreeks ${datum}` : datum
}

/**
 * Vervang het euro-bedrag in een copy-zin door een `<MaskedAmount>`, zodat de
 * privacy-schakelaar (oog-icoon in de bovenbalk) ook hier werkt.
 *
 * De zin wordt niet overgetypt maar gesplitst op exact dezelfde
 * `formatCurrency`-uitvoer die `buildMilestoneCopy` erin zette — één formatter,
 * dus dezelfde string (inclusief de harde spatie na het euroteken). Vindt de
 * split niets, dan blijft de zin ongewijzigd staan; nooit een lege regel.
 *
 * `monoWhenVisible={false}` + `tone="inherit"`: het bedrag staat midden in een
 * zin die al een eigen font en kleur draagt (Playfair in de titel, Source Serif
 * in de betekenis). Font-mixing binnen één element is precies wat de
 * kwaliteitstoets verbiedt; `tabular-nums` blijft wel staan.
 */
function metGemaskeerdBedrag(text: string, amount: number | null): ReactNode {
  if (amount === null) return text
  const token = formatCurrency(amount)
  const delen = text.split(token)
  if (delen.length === 1) return text
  return delen.flatMap((deel, i) =>
    i === 0
      ? [deel]
      : [
          <MaskedAmount
            key={`bedrag-${i}`}
            value={amount}
            tone="inherit"
            monoWhenVisible={false}
          />,
          deel,
        ],
  )
}

/**
 * Sectiekop: een echte `<h2>` voor de leesvolgorde plus de zichtbare
 * `SectionLabel` als decoratie ernaast. Zonder die splitsing leest een
 * schermlezer de kop dubbel. Spiegelt `KaternKop` in `jaaroverzicht-client.tsx`.
 */
function SectieKop({ children, num }: { children: string; num?: string }) {
  return (
    <>
      <h2 className="sr-only">{children}</h2>
      <div aria-hidden="true">
        <SectionLabel num={num}>{children}</SectionLabel>
      </div>
    </>
  )
}

/** Eén gebeurtenis op de tijdlijn. */
function Rij({ entry }: { entry: MilestoneTimelineEntry }) {
  const datum = datumLabel(entry)

  // Tussenstations (doel-checkpoints, stil gelogde doelen) krijgen één
  // compacte regel: ze horen in de historie, maar de pagina leest naar de
  // echte gebeurtenissen toe.
  if (entry.secondary) {
    return (
      <li className="relative pb-3 pl-5 last:pb-0">
        <span
          aria-hidden
          className="absolute -left-[3.5px] top-[7px] h-[7px] w-[7px] rounded-full border border-[var(--border-md)] bg-[var(--paper)]"
        />
        {/* Datum vóór de titel, net als in de volwaardige rij — alleen op één
            regel. Rechts uitlijnen zou op breed scherm een tweede datumkolom
            maken die haaks staat op de kicker-positie erboven. */}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          {datum && (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-meta)]">
              {datum}
            </p>
          )}
          <p
            className="text-[13px] leading-snug text-[var(--ink-2)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            {/* Ook hier door de maskeer-splitser: vandaag draagt een compacte
                rij nooit een bedrag (secondary ⇒ kind 'doel'), maar die
                invariant leeft in timeline.ts — dit component bewaakt 'm niet
                en mag er dus niet stil op leunen (review 1 sep). */}
            {metGemaskeerdBedrag(entry.titel, entry.euroAmount)}
          </p>
        </div>
      </li>
    )
  }

  return (
    <li className="relative pb-7 pl-5 last:pb-0">
      <span
        aria-hidden
        className="absolute -left-[4.5px] top-[5px] h-[9px] w-[9px] rounded-full bg-[var(--module-active-500)]"
      />
      {datum && (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          {datum}
        </p>
      )}
      <p
        className="mt-1 text-[17px] font-semibold leading-snug text-[var(--ink)] sm:text-[19px]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {metGemaskeerdBedrag(entry.titel, entry.euroAmount)}
      </p>
      {entry.betekenis && (
        <p
          className="mt-1 max-w-prose text-[13px] italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {metGemaskeerdBedrag(entry.betekenis, entry.euroAmount)}
        </p>
      )}
    </li>
  )
}

/** Eén kalenderjaar met zijn gebeurtenissen. */
function Jaargroep({ groep }: { groep: MilestoneTimelineYear }) {
  const aantal = groep.entries.length
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-soft)] pb-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] tabular-nums text-[var(--module-active-700)]">
          {groep.year ?? 'Zonder datum'}
        </h3>
        <span
          className="text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {aantal} {aantal === 1 ? 'mijlpaal' : 'mijlpalen'}
        </span>
      </div>
      <ol className="mt-5 ml-[4px] border-l border-[var(--border-ed)]">
        {groep.entries.map((entry) => (
          <Rij key={entry.row.id} entry={entry} />
        ))}
      </ol>
    </div>
  )
}

/**
 * Lege staat — first-use. Ook de staat die je krijgt wanneer de log (nog) niet
 * te lezen is; de pagina belooft dan niets wat ze niet weet.
 */
function LegeStaat({ laadFout }: { laadFout: boolean }) {
  if (laadFout) {
    // Een gefaalde query is NIET hetzelfde als "nog niets bereikt": op een
    // historie-pagina is "je eerste mijlpaal komt nog" tegen iemand met twaalf
    // mijlpalen precies de verkeerde onwaarheid (review 1 sep).
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <Milestone className="mx-auto h-9 w-9 text-[var(--ink-3)]" aria-hidden />
        <p
          className="mt-4 text-[19px] leading-snug text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          We konden je mijlpalen nu niet ophalen
        </p>
        <p
          className="mx-auto mt-2 max-w-prose text-sm italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Je historie is er nog gewoon — probeer het zo weer.
        </p>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <Milestone className="mx-auto h-9 w-9 text-[var(--ink-3)]" aria-hidden />
      <p
        className="mt-4 text-[19px] leading-snug text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        Je eerste mijlpaal staat hier zodra je er een passeert
      </p>
      <p
        className="mx-auto mt-2 max-w-prose text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Passeert je vermogen een drempel, dekt je vrijheid een kwart meer, of
        haal je een doel — dan komt die gebeurtenis hier te staan, met de datum
        erbij. Je overzicht houdt het voor je bij.
      </p>
      <div className="mt-5 flex justify-center">
        <Button href="/overzicht">Bekijk je overzicht</Button>
      </div>
    </div>
  )
}

export function MijlpalenTijdlijn({
  years,
  laadFout = false,
}: {
  years: MilestoneTimelineYear[]
  /** De log kon niet gelezen worden — toon dan géén "nog niets bereikt". */
  laadFout?: boolean
}) {
  const leeg = years.length === 0

  return (
    <section className="relative mx-auto max-w-4xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8">
      <PageInfoButton
        content={getPageInfo('/mijn/mijlpalen')}
        className="absolute right-4 top-4 sm:right-6"
      />

      <PageOpening
        className="mb-8 pr-12 sm:pr-14"
        kicker="Mijlpalen"
        titleBefore="Dit heb je "
        emphasis="bereikt"
        titleAfter=""
        deck="Geen stand die vandaag opnieuw waar is, maar de momenten zelf: wanneer je een drempel passeerde, en wat dat betekende."
      />

      {leeg ? (
        <LegeStaat laadFout={laadFout} />
      ) : (
        <div className="space-y-10">
          <section>
            {/* Geen romeins nummer: die telling hoort bij een reeks katernen
                (zie jaaroverzicht), en deze pagina heeft één sectie. */}
            <SectieKop>Bereikt</SectieKop>
            <div className="space-y-9">
              {years.map((groep) => (
                <Jaargroep key={groep.year ?? 'onbekend'} groep={groep} />
              ))}
            </div>
          </section>

          {/* De toekomst-kant woont op /toekomst: daar draait de projectie die
              de nog niet bereikte vrijheidsmijlpalen een datum geeft. Hier
              staat alleen wat al gebeurd is — één bron per vraag. */}
          <p
            className="border-t border-[var(--border-ed)] pt-4 text-[13px] italic leading-snug text-[var(--ink-3)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            De mijlpalen die nog voor je liggen — een kwart, de helft, driekwart
            en het geheel van je vrijheid — staan met hun verwachte datum op{' '}
            <Link
              href="/toekomst"
              className="text-[var(--module-active-700)] underline underline-offset-2 hover:text-[var(--module-active-800)]"
            >
              Toekomst
            </Link>
            .
          </p>

          <OrnamentColophon module="Mijn" text="Mijlpalen" />
        </div>
      )}
    </section>
  )
}
