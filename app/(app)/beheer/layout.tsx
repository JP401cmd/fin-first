import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { BeheerNav } from '@/components/app/beheer/beheer-nav'
import { BeheerContainer } from '@/components/app/beheer/beheer-container'

export default async function BeheerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const isAdmin = await isSuperAdmin(supabase)

  if (!isAdmin) {
    redirect('/overzicht')
  }

  return (
    <BeheerContainer>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">
          <Link href="/beheer" className="transition-colors hover:text-zinc-600">
            Beheer
          </Link>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Technisch en functioneel beheer, testtools en naslag
        </p>
      </div>

      <BeheerNav />

      <div className="mt-6">{children}</div>
    </BeheerContainer>
  )
}
