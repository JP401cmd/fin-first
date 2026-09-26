import { PageSkeletonList } from '@/components/app/shell/page-skeleton'

// Katernwissel (ADR 0179 fase 1 stap 15): de kop en het canvas staan in de
// `(katern)`-layout en blijven staan; alleen het katern-paneel eronder krijgt een
// skeleton. Binnenkomst van buiten toont de volle skeleton van `toekomst/loading.tsx`.
export default function ToekomstKaternLoading() {
  return <PageSkeletonList withHeader={false} rows={5} />
}
