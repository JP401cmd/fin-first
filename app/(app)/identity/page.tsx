import { createClient } from '@/lib/supabase/server'
import { loadIdentityData } from '@/lib/identity-data-loader'
import IdentityClient from '@/components/identity/identity-client'

export default async function IdentityPage() {
  const supabase = await createClient()
  const data = await loadIdentityData(supabase)

  return <IdentityClient initialData={data} />
}
