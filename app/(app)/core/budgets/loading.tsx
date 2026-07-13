import { PageSkeletonDetail } from '@/components/app/shell/page-skeleton'

// F-03: canonieke PageSkeleton (Detail = maand-KPI-strip + rijen, sluit aan bij
// de budgetten-pagina met maandkiezer-KPI's en budgetgroepen).
export default function BudgetsLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonDetail />
    </div>
  )
}
