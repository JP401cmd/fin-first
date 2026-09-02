'use client'

import Link from 'next/link'
import {
  User,
  Shield,
  Link2,
  Palette,
  Bell,
  Settings2,
  CalendarCheck,
  CalendarRange,
  Milestone,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { PageOpening } from '@/components/editorial'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { getPageInfo } from '@/lib/page-info-content'
import { DepthSection } from '@/components/app/depth-section'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

/**
 * MijnOverview — kaart-grid op /mijn root die de sub-routes
 * overzichtelijk toont. Plan §6.4: "Mijn vervangt het 2459-regel
 * instellingenscherm. Geen accordions, één pagina per onderwerp."
 *
 * Bevinding M14 (optie b2): Rapportages en Account staan hier bewust NIET
 * meer. Beide hadden al een vaste ingang elders en verschenen dus twee keer:
 * Rapportages permanent in de desktop-zijbalk (`OVERIGE_BASE`), Account in de
 * mobiele nav-pill (`globalNav`, actie `open-account`) en — sinds dezelfde
 * wijziging — in de zijbalk-footer op desktop. Voeg ze hier niet terug: één
 * ingang per functie is precies wat de bevinding vroeg.
 *
 * Editorial Finance kaart-DNA: 3px accent-streep bovenaan (cross-module
 * → ink-tint via --module-active-fallback), icon op subtle-vlak, serif
 * kaart-titel en italic serif meta-regel. 2-koloms grid op desktop,
 * single-col op mobile.
 */

type SubRoute = {
  href: string
  label: string
  description: string
  Icon: LucideIcon
}

/**
 * De vier onderwerpen die in Eenvoudig direct zichtbaar blijven (S8, optie B).
 *
 * De keuze is geen smaakkwestie:
 *  - **Profiel** en **Privacy** dragen de gegevens waar de rest van de app op
 *    rekent, en de vraag "wie kan dit zien".
 *  - **Uiterlijk** is de vluchtroute: sinds APP-1 woont de weergavekeuze zélf
 *    daar. Wie in Eenvoudig staat en méér wil zien, moet die kaart kunnen
 *    vinden zonder eerst iets open te klappen.
 *  - **Koppelingen** is "koppel je bank" — de kernbelofte van de app, met een
 *    eigen coach-suggestie die hierheen wijst. Dat is de reden dat de eigenaar
 *    optie B koos boven de letterlijke vier van de kaart.
 *
 * De oorspronkelijke kaart noemde ook **Account** als primair. Die staat sinds
 * bevinding M14 bewust niet meer in dit grid (vaste ingang in de nav-pill en de
 * zijbalk-footer); één ingang per functie gaat vóór. Er zijn dus negen
 * kaarten, geen elf — vier vooraan, vijf achter de disclosure.
 * (Jaaroverzicht en Mijlpalen kwamen er later bij en staan, net als
 * Check-ins, bewust alleen hier en niet ook in `navGroups`.)
 */
const PRIMARY_ROUTES: SubRoute[] = [
  {
    href: '/mijn/profiel',
    label: 'Profiel',
    description: 'Naam, geboortejaar, inkomen, huishoudtype.',
    Icon: User,
  },
  {
    href: '/mijn/privacy',
    label: 'Privacy',
    description: 'Welke data slaan we op en wie kan het zien?',
    Icon: Shield,
  },
  {
    href: '/mijn/koppelingen',
    label: 'Koppelingen',
    // Bevinding H19 — NL-eerst, geen afkortingen. De kaart is één <Link>, dus
    // een <GlossaryTerm> (een <button>) kan hier niet; de uitleg staat in
    // lib/glossary-data.ts (psd2/upo) voor de detailpagina.
    description: 'Bank koppelen, pensioenoverzicht, beleggingsrekening.',
    Icon: Link2,
  },
  {
    href: '/mijn/uiterlijk',
    label: 'Uiterlijk',
    description: 'Kleurpalet, typografie, module-accentkleuren.',
    Icon: Palette,
  },
]

/** De rest: in Volledig gewoon in het grid, in Eenvoudig achter de disclosure. */
const SECONDARY_ROUTES: SubRoute[] = [
  {
    href: '/mijn/notificaties',
    label: 'Notificaties',
    description: 'E-mail, push en in-app meldingen.',
    Icon: Bell,
  },
  {
    href: '/mijn/checkins',
    label: 'Check-ins',
    description: 'Tijdlijn van al je maandelijkse geldcheck-ins.',
    Icon: CalendarCheck,
  },
  {
    href: '/mijn/jaaroverzicht',
    label: 'Jaaroverzicht',
    description: 'Jouw jaar in vrijheid — dagen, vermogen en de rekening.',
    Icon: CalendarRange,
  },
  {
    href: '/mijn/mijlpalen',
    label: 'Mijlpalen',
    description: 'Dit heb je bereikt — elke gepasseerde drempel met datum.',
    Icon: Milestone,
  },
  {
    href: '/mijn/geavanceerd',
    label: 'Geavanceerd',
    description: 'Exports, debug, ontwikkelaars-opties.',
    Icon: Settings2,
  },
]

const ROUTES: SubRoute[] = [...PRIMARY_ROUTES, ...SECONDARY_ROUTES]

function RouteCard({ href, label, description, Icon }: SubRoute) {
  return (
    <Link
      href={href}
      className="group relative border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all flex items-start gap-3"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-[var(--module-active-500)]"
      />
      <span className="inline-flex items-center justify-center w-10 h-10 shrink-0 bg-[var(--subtle)] text-[var(--ink-3)]">
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          {/* Kaarttitel = h3: de pagina-aanhef hierboven is de h2 van
              deze pagina (ADR 0110), de sub-route-kaarten hangen daaronder. */}
          <h3 className="font-serif text-base text-[var(--ink)]">
            {label}
          </h3>
          <ArrowRight
            className="w-4 h-4 text-[var(--ink-4)] group-hover:text-[var(--ink-2)] shrink-0 transition-colors"
            aria-hidden="true"
          />
        </div>
        <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)] leading-snug">
          {description}
        </p>
      </div>
    </Link>
  )
}

const GRID_CLASSES = 'grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'

export function MijnOverview() {
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  return (
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2 md:pt-8 md:pb-4">
      <PageInfoButton
        content={getPageInfo('/mijn')}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />
      <PageOpening
        className="mb-6 pr-12 sm:pr-14"
        kicker="Mijn TriFinity"
        titleBefore="Alles "
        emphasis="naar jouw hand"
        titleAfter=" gezet"
        deck="Elk onderwerp op een eigen rustige pagina."
      />

      {/* Volledig: één grid met alle negen kaarten — pixelgelijk aan wat er
          stond. Eenvoudig: vier vooraan, de rest achter één disclosure.

          `DepthSection` en NIET `HideInSimple`: instellingen zijn geen diepte
          die je mag wegnemen. Hard verbergen zou in de standaardmodus van elk
          nieuw account de hub-ingang naar bijvoorbeeld notificaties dichtzetten.
          DepthSection houdt de kinderen gemount, zet ze `inert` zolang de
          sectie dicht is (niet in de tab-volgorde, niet voorgelezen) en opent
          met één klik. */}
      {simple ? (
        <>
          <div className={GRID_CLASSES}>
            {PRIMARY_ROUTES.map((route) => (
              <RouteCard key={route.href} {...route} />
            ))}
          </div>

          <div className="mt-4">
            <DepthSection
              title="Alle instellingen"
              // De samenvatting is het duidings-deel: wie de sectie dicht ziet
              // staan, moet zonder klikken weten wát erin zit — anders is dit
              // reductie zonder uitleg.
              summary="Notificaties, check-ins, je jaaroverzicht, je mijlpalen en geavanceerde opties zoals exports."
              icon={<Settings2 className="w-4 h-4 text-[var(--ink-3)]" aria-hidden />}
            >
              <div className={GRID_CLASSES}>
                {SECONDARY_ROUTES.map((route) => (
                  <RouteCard key={route.href} {...route} />
                ))}
              </div>
            </DepthSection>
          </div>
        </>
      ) : (
        <div className={GRID_CLASSES}>
          {ROUTES.map((route) => (
            <RouteCard key={route.href} {...route} />
          ))}
        </div>
      )}
    </section>
  )
}
