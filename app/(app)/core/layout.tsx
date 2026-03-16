import dynamic from 'next/dynamic'

const Breadcrumb = dynamic(
  () => import('@/components/app/breadcrumb').then(m => ({ default: m.Breadcrumb })),
  { ssr: false }
)

export default function CoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-6xl px-6">
        <div className="pt-4">
          <Breadcrumb color="amber" />
        </div>
      </div>
      {children}
    </>
  )
}
