'use client'

/**
 * De route-kennis van de katern-layout (ADR 0179 D8, fase 1 stap 15).
 *
 * Alleen de `(katern)`-layout en de katern-koppen weten welk katern actief is
 * (`useActiefKatern`, het segment onder de layout). Katern-componenten zelf lezen de
 * route nooit; zo blijft de terugvaloptie C′ (drie katernen gestapeld op één route) een
 * herschikking zonder herbouw.
 *
 * Twee consumenten: de katern-koppen (op desktop boven het canvas, mobiel eronder) en de i
 * in de paginakop, die per katern de "Wat zie ik hier?"-inhoud van zijn eigen route toont.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { KaternKoppen, type KaternKopItem } from '@/components/editorial/katern-koppen'
import { KaternAccentScope } from '@/components/editorial/katern-accent-scope'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import type { PageInfoContent } from '@/lib/page-info-content'
import { KATERN_LABEL, KATERN_NAV_LABEL, KATERN_VOLGORDE, type KaternId } from '@/lib/horizon/katern-copy'
import { useToekomstKaternMeldingen } from '@/components/toekomst/meldingen/toekomst-katern-meldingen'
import { KATERN_HREF } from './katern-routes'
import { KATERN_ACCENT } from './katern-accent'
import { useActiefKatern } from './actief-katern'

/**
 * De katern-koppen (fase 2, spec §4.2 regel 4 en §4.8): de inactieve koppen dragen hun
 * samenvatting (vanaf `lg`), een katern met een melding draagt het statuspunt in
 * stoplichtkleur met tekstlabel en aantal. Een klik op de kop van een katern met een
 * geminimaliseerde melding klapt die weer uit (dezelfde `restore` als de
 * Minimaliseren-knop terugdraait; server-side onthouden).
 *
 * De layout zet twee exemplaren (eigenaarswens 27 sep): op desktop boven het canvas, als
 * tabbladen op de grafiekkaart, en mobiel eronder, klevend. Per breedte is er één
 * zichtbaar; het andere staat op `display: none` en laat de scrollregel hieronder met rust.
 */
export function ToekomstKaternKoppen({ className = '' }: { className?: string }) {
  const actief = useActiefKatern()
  const meldingen = useToekomstKaternMeldingen()
  const ankerRef = useRef<HTMLDivElement>(null)
  const vorigKatern = useRef(actief)

  // Katernwissel zonder sprong (fixronde C1). De koppen navigeren met `scroll={false}`;
  // hier één regel voor waar de pagina daarna staat: staan de koppen op hun eigen plek
  // in beeld, dan blijft alles staan. Kleven ze (mobiel, ver naar beneden gescrold) of
  // zijn ze boven uit beeld, dan komen ze bovenaan het zichtbare deel, met het nieuwe
  // katern er direct onder — niet halverwege een katern dat je nog niet gezien hebt.
  // Niet bij de eerste render, en niet bij een hash (`#verken-je-aannames`): die
  // scrolt zelf naar zijn anker.
  useEffect(() => {
    if (vorigKatern.current === actief) return
    vorigKatern.current = actief
    if (window.location.hash) return
    const anker = ankerRef.current
    if (!anker) return
    const nav = anker.nextElementSibling
    if (!(nav instanceof HTMLElement)) return
    // Het exemplaar van de andere breedte (`hidden lg:block` / `lg:hidden`) doet niets:
    // alleen de koppen die je ziet bepalen waar de pagina staat.
    if (getComputedStyle(nav).display === 'none') return
    // Natuurlijke bovenkant van de nav = het anker plus de eigen marge van de nav (mobiel
    // geeft de layout `mt-6`); kleeft hij, dan staat hij lager dan die plek.
    const natuurlijk = anker.getBoundingClientRect().top + (parseFloat(getComputedStyle(nav).marginTop) || 0)
    const kleeft = nav.getBoundingClientRect().top > natuurlijk + 1
    if (!kleeft && natuurlijk >= 0) return
    anker.scrollIntoView({ block: 'start' })
  }, [actief])

  const items: KaternKopItem[] = KATERN_VOLGORDE.map((key) => {
    const staat = meldingen?.perKatern[key] ?? null
    return {
      key,
      label: KATERN_LABEL[key],
      href: KATERN_HREF[key],
      samenvatting: staat?.samenvatting ?? null,
      status: staat?.status ?? null,
      onSelect: staat && staat.display === 'minimized' ? staat.restore : undefined,
      // Eigen accent per katern (Fins drie kleuren, `KATERN_ACCENT`): de koppen lezen als
      // tabbladen: de drie delen van de pagina, de actieve sluit aan op zijn katern.
      accent: KATERN_ACCENT[key],
    }
  })
  return (
    <>
      {/* De natuurlijke plek van de koppen: de nav zelf kleeft (sticky) en mag niet in
          een wrapper, want sticky werkt alleen binnen zijn ouder. */}
      <div ref={ankerRef} aria-hidden="true" data-testid="katern-koppen-anker" />
      <KaternKoppen items={items} actiefKey={actief} label={KATERN_NAV_LABEL} className={className} />
    </>
  )
}

/**
 * Het accent van het actieve katern als module-accent voor alles erbinnen
 * (`--module-active-*` → het accent uit `KATERN_ACCENT`): de subpagina draagt de kleur
 * van haar tab, zonder vlak. `display: contents` — geen box, dus geen verschuiving (de
 * één-scherm-eis van Doelen op mobiel meet de plek van het rad). Ook bruikbaar om losse
 * slots (canvas-zijkolom, actierij) heen. Met `className` wordt de scope zelf een box —
 * de layout maakt er zo de witte katern-module onder de tabbladen van (`KATERN_MODULE`).
 */
export function ToekomstKaternAccentScope({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <KaternAccentScope accent={KATERN_ACCENT[useActiefKatern()]} className={className}>
      {children}
    </KaternAccentScope>
  )
}

/**
 * De i in de paginakop. De layout geeft de inhoud van de katernen mee (server-side
 * opgezocht via `getPageInfo`, zonder lege entries — zo komt de hele PAGE_INFO-tabel
 * niet in de client-bundel); hier wordt alleen gekozen.
 */
export function ToekomstKaternInfo({ inhoud }: { inhoud: Partial<Record<KaternId, PageInfoContent>> }) {
  const content = inhoud[useActiefKatern()]
  if (!content) return null
  return <PageInfoButton content={content} />
}
