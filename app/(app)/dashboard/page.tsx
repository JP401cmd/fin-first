import { createClient } from '@/lib/supabase/server'
import { DomainCard } from '@/components/app/domain-card'
import { FhinAvatar, FinnAvatar, FfinAvatar } from '@/components/app/avatars'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const displayName = user?.email?.split('@')[0] ?? 'daar'

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900">
          Welkom terug, {displayName}
        </h1>
        <p className="mt-2 text-zinc-600">
          Kies een domein om je financiële vrijheidsreis voort te zetten.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <DomainCard
          title="De Kern"
          subtitle="Waar sta je echt?"
          description="Jouw financiële fundament. Een helder overzicht van je vermogen, cashflow en bezittingen — vertaald naar opgeslagen levenstijd."
          href="/core"
          color="amber"
          icon={<FhinAvatar size={100} />}
        />
        <DomainCard
          title="De Wil"
          subtitle="Wat ga je doen?"
          description="Je bewuste keuzes en acties. Strategieën, doelen en optimalisaties — de wilskracht om je financiële koers te sturen."
          href="/will"
          color="teal"
          icon={<FinnAvatar size={100} />}
        />
        <DomainCard
          title="De Horizon"
          subtitle="Waar ga je naartoe?"
          description="Je financiële toekomst in beeld. Projecties, scenario's en simulaties die laten zien wanneer vrijheid bereikbaar is."
          href="/horizon"
          color="purple"
          icon={<FfinAvatar size={100} />}
        />
      </div>
    </div>
  )
}
