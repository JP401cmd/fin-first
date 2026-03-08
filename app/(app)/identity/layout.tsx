import { ModuleNav } from '@/components/app/module-nav'
import { Breadcrumb } from '@/components/app/breadcrumb'
import { identityNav } from '@/lib/navigation'

export default function IdentityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav config={identityNav} />
      <div className="mx-auto max-w-6xl px-6">
        <div className="pt-4">
          <Breadcrumb color="teal" />
        </div>
      </div>
      {children}
    </>
  )
}
