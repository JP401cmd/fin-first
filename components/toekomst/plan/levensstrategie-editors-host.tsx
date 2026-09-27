// Verplaatst uit components/toekomst/instellingen/instellingen-rijen.tsx @ 039a369b9 (27 sep, ADR 0179).
'use client'

/**
 * De editors van de levensstrategieën op katern Plan (eigenaarsbesluit 27 sep 2026): één
 * host op de Plan-page voor beide plekken van `LevensstrategieenBlok` (kolom en pagina).
 * Rendert de BESTAANDE `StrategieEditors` (AOW, pensioen, werk, eigen woning) — dezelfde
 * bodies als de wizard, één tegelijk — met de client-veilige snapshot, zodat elke footer
 * de verschilregel uit dezelfde override-run draagt (§7.7).
 *
 * Openen gaat op twee manieren:
 *  - een klik op een rij → `LEVENSSTRATEGIE_OPEN_EVENT` (geen URL-wissel, geen server-ronde);
 *  - een deeplink `?rij=aow|pensioen|werk|huis` of `?strategie=…` (de oude alias; ook de
 *    redirect van `/toekomst/instellingen?rij=…` in `next.config.ts`). Elke deeplink naar
 *    de pensioenrij komt van een opdracht "vul je factor A in" (Box 1): dan staat de
 *    factor-A-uitvraag meteen open (S6). Een klik op de rij zelf doet dat niet.
 *
 * De deeplink wordt bij het openen uit de URL gehaald met de native History API (patroon
 * `PlanReviewProvider`): `router.replace` zou op de dynamische /toekomst alle loaders
 * opnieuw laten draaien. De hash blijft staan. Staat `planreview` of `modal` er ook, dan
 * wacht deze host op hun eigen opruimer (zelfde regel als `useInstellingenRijDeeplink`).
 */

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { StrategieEditors } from '@/components/future/strategie/strategie-editors'
import { useToekomstBron } from '@/components/toekomst/state/toekomst-state-provider'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import { PLAN_REVIEW_PARAM } from '@/lib/plan-review/types'
import {
  RIJ_DEEPLINK_PARAMS,
  RIJ_META,
  STRATEGIE_NAAR_RIJ,
  isLevensstrategieRij,
  type LevensstrategieRij,
} from '@/lib/toekomst/instellingen-rij'
import { LEVENSSTRATEGIE_OPEN_EVENT, type LevensstrategieOpenDetail } from './levensstrategieen-blok'

/**
 * De deeplink-waarden die deze host opent: `?rij=` of de oude alias `?strategie=`. Letterlijk
 * uitgeschreven (en getoetst tegen `STRATEGIE_NAAR_RIJ`), zodat het deeplink-contract van
 * /toekomst (`toekomst-deeplinks.contract.test.ts`) de lezer en zijn waarden ziet.
 */
const DEEPLINK_RIJ = {
  aow: 'aow',
  pensioen: 'pensioen',
  werk: 'werk',
  huis: 'huis',
} as const satisfies Record<keyof typeof STRATEGIE_NAAR_RIJ, LevensstrategieRij>

function deeplinkRij(waarde: string | null): LevensstrategieRij | null {
  return waarde != null && Object.prototype.hasOwnProperty.call(DEEPLINK_RIJ, waarde)
    ? DEEPLINK_RIJ[waarde as keyof typeof DEEPLINK_RIJ]
    : null
}

/** Params met een eigen opruimer; zolang ze er staan, wacht de deeplink. */
const ANDERE_OPRUIMERS = [PLAN_REVIEW_PARAM, 'modal'] as const

export function LevensstrategieEditorsHost({
  snapshot: snapshotBron,
}: {
  /**
   * De snapshot als belofte (review 27 sep, punt 1): de host is er meteen en luistert vanaf
   * de eerste render naar klikken, ook bij een katernwissel terwijl de server de run nog
   * maakt. Tot de belofte klaar is rekenen de editors zonder verschilregel; komt hij binnen,
   * dan krijgt een open editor hem erbij zonder te sluiten (geen Suspense-wissel).
   */
  snapshot: Promise<RegelSimSnapshot | null> | RegelSimSnapshot | null
}) {
  const [snapshot, setSnapshot] = useState<RegelSimSnapshot | null>(
    snapshotBron instanceof Promise ? null : snapshotBron,
  )
  useEffect(() => {
    let actief = true
    Promise.resolve(snapshotBron).then(
      (s) => {
        if (actief) setSnapshot(s)
      },
      () => {
        if (actief) setSnapshot(null)
      },
    )
    return () => {
      actief = false
    }
  }, [snapshotBron])
  const { initialData, gebeurtenissen } = useToekomstBron()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [open, setOpen] = useState<LevensstrategieRij | null>(null)
  const [viaDeeplink, setViaDeeplink] = useState(false)

  // Klik op een rij (kolom of pagina).
  useEffect(() => {
    function onOpen(e: Event) {
      const rij = (e as CustomEvent<LevensstrategieOpenDetail>).detail?.rij
      if (!rij || !isLevensstrategieRij(rij)) return
      setViaDeeplink(false)
      setOpen(rij)
    }
    window.addEventListener(LEVENSSTRATEGIE_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(LEVENSSTRATEGIE_OPEN_EVENT, onOpen)
  }, [])

  // Deeplink: één keer openen en meteen opruimen.
  useEffect(() => {
    if (!RIJ_DEEPLINK_PARAMS.some((k) => searchParams.has(k))) return
    if (ANDERE_OPRUIMERS.some((k) => searchParams.has(k))) return
    // Voorrang `rij` > `strategie` (zelfde regel als `resolveRijDeeplink`). Een rij van
    // Instellingen (bv. `?rij=stopmoment`) of `?regel=` is niet van deze host.
    const rijParam = searchParams.get('rij')
    const rij = rijParam != null ? deeplinkRij(rijParam) : deeplinkRij(searchParams.get('strategie'))
    if (!rij) return
    // Ook zonder gebeurtenissen-bron (de host rendert dan niets) gaat de param weg: anders
    // blijft hij hangen en opent hij bij een latere lading alsnog.
    setOpen(rij)
    setViaDeeplink(rij === 'pensioen')
    const rest = new URLSearchParams(searchParams.toString())
    for (const k of RIJ_DEEPLINK_PARAMS) rest.delete(k)
    const qs = rest.toString()
    window.history.replaceState(window.history.state, '', `${pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
  }, [searchParams, pathname])

  const sluit = useCallback(() => {
    setOpen(null)
    setViaDeeplink(false)
  }, [])

  const editor = open ? RIJ_META[open].editor : null
  // Zonder bundel voor de editors (geen gebeurtenissen-bron) valt er niets te openen.
  if (!gebeurtenissen) return null

  return (
    <StrategieEditors
      open={editor?.soort === 'strategie' ? editor.strategie : null}
      onClose={sluit}
      events={gebeurtenissen.events ?? initialData.events}
      data={gebeurtenissen.strategieData}
      readOnly={false}
      autoOpenJaarruimte={viaDeeplink}
      snapshot={snapshot}
    />
  )
}
