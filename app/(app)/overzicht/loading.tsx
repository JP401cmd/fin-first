import { PageSkeletonDetail } from '@/components/app/shell/page-skeleton'

// F-03: canonieke PageSkeleton i.p.v. ad-hoc pulse-/rounded-blokken. De outer
// wrapper levert alleen centrering + max-breedte (gelijk aan de /overzicht-hero
// grondvorm); de skeleton zelf draagt de padding + scherpe krant-blokken.
export default function OverzichtLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageSkeletonDetail />
    </div>
  )
}
