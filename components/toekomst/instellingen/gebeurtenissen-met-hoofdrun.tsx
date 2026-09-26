'use client'

/**
 * GebeurtenissenView in katern Instellingen, gevoed met de hoofdrun van de
 * /toekomst-provider (ADR 0179 fase 1 stap 17, besluit Q8).
 *
 * Gemeten: met een eigen `useHorizonFireSim` in de view liepen er op Instellingen twee
 * instanties op kernel-rijstrook `main`, die elkaars wachtende run verdrongen (vier
 * verdrongen verzoeken bij een directe lading, nul op /toekomst). Een verdrongen
 * instantie houdt `result: null` tot haar invoer verandert. De provider draait dezelfde
 * persoonlijke hoofdrun al voor het canvas; de view leest die.
 *
 * Buiten de provider (tests, los gebruik) valt hij terug op de eigen run van de view.
 * Leest de route niet (D8).
 */

import type { ComponentProps } from 'react'
import { GebeurtenissenView } from '@/components/future/gebeurtenissen-view'
import { useToekomstSimContextOptioneel } from '@/components/toekomst/state/toekomst-state-provider'

export function GebeurtenissenMetHoofdrun(props: ComponentProps<typeof GebeurtenissenView>) {
  const sim = useToekomstSimContextOptioneel()
  return <GebeurtenissenView {...props} hoofdrun={sim?.hoofdrun ?? null} />
}
