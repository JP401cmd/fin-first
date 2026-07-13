import { PageSkeletonList } from '@/components/app/shell/page-skeleton'

// F-03: canonieke PageSkeleton (List = header + rijen, sluit aan bij de
// rapporten-lijst; het config-paneel is transient chrome en hoeft niet in de
// skeleton).
export default function RapportagesLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonList />
    </div>
  )
}
