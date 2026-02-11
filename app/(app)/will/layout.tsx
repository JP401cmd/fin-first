import { ModuleNav } from '@/components/app/module-nav'
import { willNav } from '@/lib/navigation'

export default function WillLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ModuleNav config={willNav} />
      {children}
    </>
  )
}
