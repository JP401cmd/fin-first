'use client'

/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.6 (loading-strategie)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Declaratieve meta-injector. Pagina's plaatsen `<NavStackMeta>` vroeg in hun
 * render-tree (vóór data-fetching) om de TopBar-titel + BottomBar-config voor
 * hun stack-entry te bevestigen.
 *
 * Waarom een tweede pad naast `push({ title, bottomBar })`?
 *  Wanneer een gebruiker via `<Link>` of `router.push()` navigeert (zonder zelf
 *  `push()` op de NavStackProvider aan te roepen), detecteert de provider de
 *  pathname-change en doet een auto-push met een lege titel + default bottomBar
 *  (zie nav-stack-provider.tsx pathname-watcher). De pagina-component rendert
 *  vervolgens `<NavStackMeta>` om die default te corrigeren met de echte
 *  waarden — ZONDER een nieuwe stack-entry te pushen.
 *
 * Coördinatie met nav-stack-provider.tsx:
 *  Deze component dispatcht een browser-CustomEvent `fintwo:nav-stack-meta` met
 *  `{ pathname, title, bottomBar, topBar }` als detail. De NavStackProvider
 *  luistert (zie `applyNavStackMetaToStack` + de pathname-watcher aldaar) en
 *  werkt de entry van de AFZENDER bij zonder push/pop.
 *
 *  Waarom de pathname meereist: dit component is een descendant van de
 *  provider en React draait kind-effects vóór ouder-effects in dezelfde
 *  commit. Rendert een nieuwe pagina haar NavStackMeta in dezelfde commit als
 *  de pathname-wissel, dan vuurt dit event vóórdat de provider de nieuwe
 *  entry heeft gepusht — en landde de titel op de entry van de vórige pagina
 *  (gepersisteerd in sessionStorage; UAT WF-REKEN-08-bug1). Met de pathname
 *  erbij kan de provider het event parkeren tot de entry bestaat.
 */

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { BottomBarConfig, TopBarConfig } from './nav-stack-provider'

// ── Re-export voor consumer-convenience ─────────────────────────────
//
// Pagina's die `<NavStackMeta>` willen gebruiken hoeven niet ook
// nav-stack-provider te importeren voor het type — één import-pad.
export type { BottomBarConfig, TopBarConfig, TopBarKind } from './nav-stack-provider'

// ── Event-coördinatie met provider ──────────────────────────────────

/** Event-name. Geprefixed met `fintwo:` om collisions te voorkomen. */
export const NAV_STACK_META_EVENT = 'fintwo:nav-stack-meta'

/**
 * CustomEvent-detail-shape. Provider parsed dit en update de entry van de
 * afzender in de huidige active tab-stack. `bottomBar` en `topBar` krijgen
 * een default in `NavStackMeta` zelf, dus de listener-kant blijft simpel.
 *
 * `pathname` = de route van de pagina die het event stuurt (`usePathname()`).
 * De provider werkt alleen een entry met déze pathname bij en parkeert het
 * event anders tot de entry bestaat. Optioneel voor legacy-afzenders zonder
 * pathname: die houden het oude "top-entry"-gedrag.
 */
export type NavStackMetaDetail = {
  pathname?: string
  title: string
  bottomBar: BottomBarConfig
  topBar: TopBarConfig
}

/**
 * Default bottom-bar als een pagina niets meegeeft = `'hidden'` (lege bar).
 * Tab-roots krijgen `'tabs'` via de pathname-watcher in `nav-stack-provider.tsx`
 * — die default geldt voor de auto-push bij root-bezoek. Pagina's die ondanks
 * sub-page-status alsnog module-tabs willen zien geven `bottomBar={{ kind: 'tabs' }}`
 * expliciet mee. Form-flows kiezen `'action-bar'`, detail-pagina's `'context-actions'`.
 */
const DEFAULT_BOTTOM_BAR: BottomBarConfig = { kind: 'hidden' }

/**
 * Default top-bar als een pagina niets meegeeft = `'simple'` (←-knop + titel,
 * geen utility-cluster). Pagina's die op tab-roots de rich-variant willen,
 * geven expliciet `topBar={{ kind: 'rich' }}` mee. De provider zet bij
 * pathname-driven auto-push tab-roots zelf op `'rich'`; deze component-default
 * geldt alleen wanneer een pagina expliciet `<NavStackMeta>` rendert zonder
 * topBar-prop.
 */
const DEFAULT_TOP_BAR: TopBarConfig = { kind: 'simple' }

// ── Component ───────────────────────────────────────────────────────

type NavStackMetaProps = {
  /** Titel die in de TopBar verschijnt voor deze pagina. */
  title: string
  /**
   * BottomBar-config voor deze pagina. Default = module-tabs als niet
   * meegegeven. Pagina's die hun bottom-bar willen overschrijven (bv. een
   * form-flow die `'action-bar'` toont) geven hier expliciet een config door.
   */
  bottomBar?: BottomBarConfig
  /**
   * TopBar-config voor deze pagina. Default = `'simple'` (←-knop + titel,
   * geen utility-cluster). Pagina's die op een tab-root de rich-variant
   * willen behouden geven `topBar={{ kind: 'rich' }}`. Voor full-screen
   * flows zonder TopBar: `topBar={{ kind: 'hidden' }}`.
   */
  topBar?: TopBarConfig
}

/**
 * Render-loos component. Effect-only — synchroniseert de huidige stack-entry's
 * meta met de meegegeven props. Plaats VROEG in de pagina-component, vóór
 * data-fetching, zodat de TopBar+BottomBar instant rendert met de juiste meta
 * terwijl de content asynchroon arriveert via Suspense.
 *
 * Implementatie-detail: we depend de useEffect op een serialized config-key
 * ipv het hele bottomBar-object zodat we niet bij elke render dispatchen
 * wanneer een pagina inline `bottomBar={{ kind: 'tabs' }}` doorgeeft (nieuwe
 * object-ref per render, gelijke inhoud). De serializer schrijft alleen
 * primitives + nested objects; functions (onClick) worden weggelaten — dat is
 * acceptabel want twee actions met dezelfde label/href/icon zijn semantisch
 * gelijk voor onze sync-doel.
 */
export function NavStackMeta({ title, bottomBar, topBar }: NavStackMetaProps): null {
  // De afzender-route: de provider matcht hierop i.p.v. blind de top-entry
  // te nemen (zie header-comment — effect-volgorde kind → ouder).
  const pathname = usePathname()
  // Resolve defaults hier zodat het event ALTIJD een complete config draagt.
  // Dat houdt de listener-kant simpel (geen extra null-check daar).
  const resolvedBottom: BottomBarConfig = bottomBar ?? DEFAULT_BOTTOM_BAR
  const resolvedTop: TopBarConfig = topBar ?? DEFAULT_TOP_BAR

  // useEffect met serialized config-key: voorkomt re-dispatch bij gelijke
  // inhoud maar nieuwe object-identity. JSON.stringify met function-replacer
  // (functies → undefined) zodat onClick-handlers de key-equivalentie niet
  // breken bij anders-gelijke configs. Eén key voor beide configs samen
  // zodat we niet bij elke render dispatchen wanneer maar één config wijzigt.
  const configKey = JSON.stringify(
    { bottom: resolvedBottom, top: resolvedTop },
    replaceFunctions,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const detail: NavStackMetaDetail = {
      pathname: pathname ?? undefined,
      title,
      bottomBar: resolvedBottom,
      topBar: resolvedTop,
    }
    window.dispatchEvent(
      new CustomEvent<NavStackMetaDetail>(NAV_STACK_META_EVENT, { detail }),
    )
    // Geen cleanup — dit is een fire-and-forget sync. Volgende render
    // (met andere title of config) dispatcht opnieuw; de listener werkt
    // simpelweg de entry van deze route bij. Idempotent.
    //
    // `resolvedBottom` en `resolvedTop` zijn gederiveerd uit `configKey`
    // (zelfde JSON = gelijke semantiek), dus we kunnen ze veilig in de
    // effect referentielen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, configKey, pathname])

  return null
}

/**
 * JSON.stringify-replacer: laat functions weg uit de key zodat twee inline-
 * gegenereerde handler-functies die semantisch gelijk zijn dezelfde key
 * produceren. Anders zou elke render opnieuw dispatchen.
 */
function replaceFunctions(_key: string, value: unknown): unknown {
  if (typeof value === 'function') return undefined
  return value
}
