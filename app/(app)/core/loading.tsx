import { PageSkeletonDetail } from '@/components/app/shell/page-skeleton'

// F-03: canonieke PageSkeleton (Detail = header + KPI-strip + grafiek, sluit aan
// bij de Kern-hub). Legacy backing-route van /overzicht.
export default function CoreLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonDetail />
    </div>
  )
}
