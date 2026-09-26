'use client'

/**
 * De route-kennis van de katern-layout (ADR 0179 D8, fase 1 stap 15).
 *
 * Alleen de `(katern)`-layout en de katern-koppen weten welk katern actief is
 * (`useActiefKatern`, het segment onder de layout). Katern-componenten zelf lezen de
 * route nooit; zo blijft de terugvaloptie C′ (drie katernen gestapeld op één route) een
 * herschikking zonder herbouw.
 *
 * Twee consumenten: de katern-koppen onder het canvas en de i in de paginakop, die per
 * katern de "Wat zie ik hier?"-inhoud van zijn eigen route toont.
 */

import { KaternKoppen, type KaternKopItem } from '@/components/editorial/katern-koppen'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import type { PageInfoContent } from '@/lib/page-info-content'
import { KATERN_LABEL, KATERN_NAV_LABEL, KATERN_VOLGORDE, type KaternId } from '@/lib/horizon/katern-copy'
import { useToekomstKaternMeldingen } from '@/components/toekomst/meldingen/toekomst-katern-meldingen'
import { KATERN_HREF } from './katern-routes'
import { useActiefKatern } from './actief-katern'

/**
 * De katern-koppen onder het canvas (fase 2, spec §4.2 regel 4 en §4.8): de inactieve
 * koppen dragen hun samenvatting (vanaf `lg`), een katern met een melding draagt het
 * statuspunt in stoplichtkleur met tekstlabel en aantal. Een klik op de kop van een
 * katern met een geminimaliseerde melding klapt die weer uit (dezelfde `restore` als de
 * Minimaliseren-knop terugdraait; server-side onthouden).
 */
export function ToekomstKaternKoppen({ className = '' }: { className?: string }) {
  const actief = useActiefKatern()
  const meldingen = useToekomstKaternMeldingen()
  const items: KaternKopItem[] = KATERN_VOLGORDE.map((key) => {
    const staat = meldingen?.perKatern[key] ?? null
    return {
      key,
      label: KATERN_LABEL[key],
      href: KATERN_HREF[key],
      samenvatting: staat?.samenvatting ?? null,
      status: staat?.status ?? null,
      onSelect: staat && staat.display === 'minimized' ? staat.restore : undefined,
    }
  })
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
