import { Breadcrumb } from '@/components/app/breadcrumb'

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
