'use client'

/**
 * De route-kennis van de katern-layout (ADR 0179 D8, fase 1 stap 15).
 *
 * Alleen de `(katern)`-layout en de katern-koppen weten welk katern actief is. Dat
 * gebeurt hier, via `useSelectedLayoutSegment` (het segment onder de layout: `null`
 * op Plan, `'doelen'`, `'instellingen'`). Katern-componenten zelf lezen de route nooit;
 * zo blijft de terugvaloptie C′ (drie katernen gestapeld op één route) een
 * herschikking zonder herbouw.
 *
 * Twee consumenten: de katern-koppen onder het canvas en de i in de paginakop, die per
 * katern de "Wat zie ik hier?"-inhoud van zijn eigen route toont.
 */

import { useSelectedLayoutSegment } from 'next/navigation'
import { KaternKoppen, type KaternKopItem } from '@/components/editorial/katern-koppen'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import type { PageInfoContent } from '@/lib/page-info-content'
import { KATERN_LABEL, KATERN_NAV_LABEL, KATERN_VOLGORDE, type KaternId } from '@/lib/horizon/katern-copy'
import { KATERN_HREF } from './katern-routes'

const KATERN_VAN_SEGMENT: Readonly<Record<string, KaternId>> = {
  doelen: 'doelen',
  instellingen: 'instellingen',
}

/** Het actieve katern volgens het segment onder de `(katern)`-layout. */
function useActiefKatern(): KaternId {
  const segment = useSelectedLayoutSegment()
  return (segment != null ? KATERN_VAN_SEGMENT[segment] : undefined) ?? 'plan'
}

/**
 * De katern-koppen onder het canvas. Fase 1: alleen labels; samenvattingen en
 * statuspunten volgen in fase 2 (besluit Q6).
 */
export function ToekomstKaternKoppen({ className = '' }: { className?: string }) {
  const actief = useActiefKatern()
  const items: KaternKopItem[] = KATERN_VOLGORDE.map((key) => ({
    key,
    label: KATERN_LABEL[key],
    href: KATERN_HREF[key],
  }))
  return <KaternKoppen items={items} actiefKey={actief} label={KATERN_NAV_LABEL} className={className} />
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
