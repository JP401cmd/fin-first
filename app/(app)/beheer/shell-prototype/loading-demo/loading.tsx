/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.6 (loading-strategie)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Next.js `loading.tsx` convention voor /beheer/shell-prototype/loading-demo.
 *
 * Bij navigatie naar deze route toont Next.js dit bestand als Suspense-fallback
 * tot de server-component-data van page.tsx binnen is. Plan §4.6:
 *   - TopBar + BottomBar moeten al geanimeerd verschenen zijn (uit stack-meta);
 *   - alleen de content-area toont een skeleton tijdens de wachttijd;
 *   - skeleton-dimensies matchen final layout (geen layout-shift).
 *
 * We renderen `PageSkeletonDetail` omdat de demo-pagina een detail-layout heeft
 * (header + KPI-strip + body-paragraphs). De skeleton-blokken gebruiken
 * `bg-[var(--subtle)]` met 1.5s pulse-animatie; statisch onder reduced-motion.
 *
 * Belangrijk: deze loading.tsx vervangt NIET de TopBar of BottomBar van de
 * mobile-stack-shell — alleen de content-area binnen de tray. Die shell zit
 * één laag hoger in de route-tree (in de uiteindelijke productie-shell wrapper).
 */

import { PageSkeletonDetail } from '@/components/app/shell/page-skeleton'

export default function LoadingDemoLoading() {
  return <PageSkeletonDetail />
}
