import { createClient } from '@/lib/supabase/server'
import { FinnAvatar } from '@/components/app/avatars'
import { RecommendationList } from '@/components/app/recommendation-list'
import type { Recommendation } from '@/lib/recommendation-data'

export default async function OptimizationPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // Fetch pending recommendations + reactivated postponed ones
  const { data: recommendations } = await supabase
    .from('recommendations')
    .select('*')
    .or(`status.eq.pending,and(status.eq.postponed,postponed_until.lte.${today})`)
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <FinnAvatar size={48} />
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Optimalisatie</h1>
          <p className="text-zinc-500">Ontdek verborgen vrijheidsdagen</p>
        </div>
      </div>

      {/* Recommendation list */}
      <RecommendationList
        initialRecommendations={(recommendations as Recommendation[]) || []}
      />
    </div>
  )
}
