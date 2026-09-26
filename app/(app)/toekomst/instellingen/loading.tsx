import { PageSkeletonDetail } from '@/components/app/shell/page-skeleton'

// Canonieke PageSkeleton voor katern Instellingen (kop + rijen), gelijk aan /toekomst.
export default function ToekomstInstellingenLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonDetail />
    </div>
  )
}
