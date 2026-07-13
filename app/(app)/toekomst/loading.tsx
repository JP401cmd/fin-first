import { PageSkeletonDetail } from '@/components/app/shell/page-skeleton'

// F-03: canonieke PageSkeleton (Detail = KPI-strip + grafiek + rijen, sluit aan
// bij de Horizon-hub met vrijheids-KPI's, sim-grafiek en levensgebeurtenissen).
export default function ToekomstLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonDetail />
    </div>
  )
}
