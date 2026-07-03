import type { Metadata } from 'next'
import MijnLedger from './mijn-ledger'

/**
 * STAP-5-DELETIEPUNT (FASE 6, horizon-kernel-migratie). Deze route toont het oude
 * v2-grootboek op de eigen data; ze is vervangen door `/beheer/horizon-kernel`
 * (de maandbasis-, oracle-bewezen horizon-kernel — tab "Stappen & tabellen").
 *
 * Verdwijnt bij FASE 6 stap 5, samen met:
 *  - `app/api/horizon-engine/ledger/route.ts` (de v2-grootboek-fetch van deze pagina);
 *  - `app/(app)/beheer/horizon-tabellen/ledger-views.tsx` + `persona.ts` (de gedeelde
 *    v2-weergavemodules; de persona-inspector-page zelf is al weg — C5-c);
 *  - de nav-entry in `lib/beheer-sections.ts` (~regel 250) — die wordt door de
 *    parallelle widget-sessie weggehaald, NIET hier.
 *
 * De default-flip naar de kernel is stap 3; de fysieke v2-deletie stap 5.
 */

export const metadata: Metadata = { title: 'Horizon-tabellen (mijn data) — Beheer' }

export default function HorizonTabellenMijPage() {
  return <MijnLedger />
}
