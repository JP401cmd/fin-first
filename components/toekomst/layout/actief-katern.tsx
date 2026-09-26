'use client'

/**
 * Welk katern van /toekomst is actief (ADR 0179 D8, fase 2)?
 *
 * Routing hoort alleen in de layout-laag: deze hook leest het segment onder de
 * `(katern)`-layout via `useSelectedLayoutSegment` (`null` op Plan, `'doelen'`,
 * `'instellingen'`). Het canvas — dat in die layout gemonteerd blijft bij een
 * katernwissel — consumeert hem om per katern zijn standaardstand en vaste lagen te
 * kiezen (spec §4.5). Katern-panelen zelf lezen de route nooit; zo blijft de
 * terugvaloptie C′ (drie katernen gestapeld op één route) een herschikking: dan
 * levert een context hier de waarde in plaats van het segment.
 *
 * Werkt alleen voor componenten die de `(katern)`-layout rendert (het segment is
 * relatief aan de dichtstbijzijnde layout).
 */

import { useSelectedLayoutSegment } from 'next/navigation'
import type { KaternId } from '@/lib/horizon/katern-copy'

const KATERN_VAN_SEGMENT: Readonly<Record<string, KaternId>> = {
  doelen: 'doelen',
  instellingen: 'instellingen',
}

/** Het katern bij een layout-segment; alles wat geen katern is valt terug op Plan. */
export function katernVanSegment(segment: string | null): KaternId {
  return (segment != null ? KATERN_VAN_SEGMENT[segment] : undefined) ?? 'plan'
}

/** Het actieve katern volgens het segment onder de `(katern)`-layout. */
export function useActiefKatern(): KaternId {
  return katernVanSegment(useSelectedLayoutSegment())
}
