'use client'

/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.6 (loading-strategie)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Client-bridge voor de loading-demo-server-component. Server-componenten
 * kunnen geen useEffect hebben, dus de declaratieve `<NavStackMeta>`-injector
 * gaat hier doorheen. Mount na arrival → dispatcht title + bottomBar naar de
 * NavStackProvider via het `fintwo:nav-stack-meta` event.
 *
 * Tijdens de skeleton-fase draagt de TopBar de auto-push-default (lege string
 * uit pathname-watcher of de `Loading-test`-titel die StackDemo via push()
 * meegaf). Zodra deze component mount, bevestigt hij de definitieve meta.
 */

import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export function LoadingDemoMeta() {
  return (
    <NavStackMeta
      title="Loading-test"
      // Default 'tabs' is correct voor deze demo — geen action-bar of context-
      // actions nodig op een puur informatieve pagina. Expliciet meegegeven
      // zodat de coördinatie met agent A's provider getest wordt (event vuurt).
      bottomBar={{ kind: 'tabs' }}
    />
  )
}
