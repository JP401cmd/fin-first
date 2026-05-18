import { Breadcrumb } from '@/components/app/breadcrumb'
import { ModuleNav } from '@/components/app/module-nav'
import { mijnNav } from '@/lib/navigation'

export default function MijnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav config={mijnNav} />
      <div className="mx-auto max-w-6xl px-6">
        <div className="pt-4">
          <Breadcrumb color="teal" />
        </div>
      </div>
      {children}
    </>
  )
}
