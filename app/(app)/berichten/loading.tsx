import { PageSkeletonList } from '@/components/app/shell/page-skeleton'

// F-03: canonieke PageSkeleton (List = header + rijen, sluit aan bij de
// meldingen-lijst).
export default function BerichtenLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonList />
    </div>
  )
}
