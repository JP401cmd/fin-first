import dynamic from 'next/dynamic'
import { ModuleNav } from '@/components/app/module-nav'
import { identityNav } from '@/lib/navigation'

const Breadcrumb = dynamic(
  () => import('@/components/app/breadcrumb').then(m => ({ default: m.Breadcrumb })),
  { ssr: false }
)

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
