import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { BeheerNav } from '@/components/app/beheer/beheer-nav'

export default async function BeheerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const isAdmin = await isSuperAdmin(supabase)

  if (!isAdmin) {
    redirect('/dashboard')
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Beheer</h1>
        <p className="mt-1 text-sm text-zinc-500">Systeeminstellingen en beheerschermen</p>
      </div>

      <BeheerNav />

      <div className="mt-6">{children}</div>
    </div>
  )
}
