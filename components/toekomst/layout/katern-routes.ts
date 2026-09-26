import type { KaternId } from '@/lib/horizon/katern-copy'

/**
 * De route van elk katern van /toekomst (ADR 0179 D1). Plan is de standaard.
 *
 * Een gewone module (geen `'use client'`), zodat zowel de server-layout als de
 * client-koppen dezelfde waarden lezen: een const uit een client-module is in een
 * server-component alleen een referentie, geen waarde.
 */
export const KATERN_HREF: Readonly<Record<KaternId, string>> = {
  plan: '/toekomst',
  doelen: '/toekomst/doelen',
  instellingen: '/toekomst/instellingen',
}
