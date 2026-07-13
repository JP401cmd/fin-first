import { PageSkeletonList } from '@/components/app/shell/page-skeleton'

// F-03: canonieke PageSkeleton (List = header + rijen, sluit aan bij de
// artikel-lijst van de krant).
export default function NieuwsLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonList />
    </div>
  )
}
