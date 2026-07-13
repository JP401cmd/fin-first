import { PageSkeletonDetail } from '@/components/app/shell/page-skeleton'

// F-03: canonieke PageSkeleton (Detail = header + KPI-strip + rijen, sluit aan
// bij de Mijn-hub met profiel-strip, stats en tijdlijn).
export default function MijnLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonDetail />
    </div>
  )
}
