import { createClient } from '@/lib/supabase/server'
import { ActionBoard } from '@/components/app/action-board'
import type { Action } from '@/lib/recommendation-data'

export default async function ActionsPage() {
  const supabase = await createClient()

  const { data: actions } = await supabase
    .from('actions')
    .select('*, recommendation:recommendations(title, recommendation_type)')
    .order('status', { ascending: true })
    .order('priority_score', { ascending: false })
    .order('sort_order', { ascending: true })

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Acties</h1>
        <p className="text-zinc-500">Concrete stappen die je vrijheid laten groeien</p>
      </div>

      {/* Action board */}
      <ActionBoard initialActions={(actions as Action[]) || []} />
    </div>
  )
}
