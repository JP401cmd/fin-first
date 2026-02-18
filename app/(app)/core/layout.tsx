import { ModuleNav } from '@/components/app/module-nav'
import { Breadcrumb } from '@/components/app/breadcrumb'
import { coreNav } from '@/lib/navigation'

export default function CoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav config={coreNav} />
      <div className="mx-auto max-w-6xl px-6">
        <div className="pt-4">
          <Breadcrumb color="amber" />
        </div>
      </div>
      {children}
    </>
  )
}
