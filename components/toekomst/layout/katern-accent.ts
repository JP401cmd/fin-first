/**
 * Welk accent draagt elk katern van /toekomst (eigenaarswens 27 sep: "gebruik de drie
 * accentkleuren die ook voor Fin zijn gebruikt")?
 *
 * Fins avatar is driekleurig en die drie kleuren zijn de drie hefboom-accenten
 * (`components/app/fin-dots.tsx`): linkeroog `kern`, rechteroog `wil`, onderste stip
 * `horizon`. De koppen volgen die leesrichting: Plan · Doelen · Instellingen. Dit is een
 * voorstel — de eigenaar kan de koppeling omgooien, en dat is dan alléén deze constante.
 *
 * De tokens zelf (`--color-kern-*` enz.) kiest de gebruiker op /mijn/uiterlijk; hier staat
 * alleen welk accent bij welk katern hoort, nooit een kleurwaarde.
 *
 * Gewone module (geen `'use client'`): bruikbaar vanuit server- én clientcode.
 */
import type { KaternAccent } from '@/components/editorial/katern-accent-scope'
import type { KaternId } from '@/lib/horizon/katern-copy'

export const KATERN_ACCENT: Readonly<Record<KaternId, KaternAccent>> = {
  plan: 'kern',
  doelen: 'wil',
  instellingen: 'horizon',
}
