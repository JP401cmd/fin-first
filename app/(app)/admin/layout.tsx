import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const isAdmin = await isSuperAdmin(supabase)

  if (!isAdmin) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
