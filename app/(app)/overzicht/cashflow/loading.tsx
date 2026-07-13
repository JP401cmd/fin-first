import { PageSkeletonList } from '@/components/app/shell/page-skeleton'

// B-09: één loading.tsx op cashflow-niveau dekt de hele subtree (bij navigatie
// naar /overzicht/cashflow én de sub-routes zoals /budget en /vaste-lasten die
// géén eigen loading.tsx hebben) via de Next.js Suspense-boundary. List is de
// meest neutrale vorm voor de heterogene sub-pagina's (kaarten-hub, budgetten,
// vaste lasten). Canonieke PageSkeleton — geen ad-hoc pulse/rounded.
export default function CashflowLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonList />
    </div>
  )
}
