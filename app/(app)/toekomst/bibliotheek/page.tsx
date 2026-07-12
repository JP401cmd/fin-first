import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import {
  buildUserDataContext,
  checkRequirements,
  inferRequirements,
} from '@/lib/calculator/requirements'
import type { CustomCalculatorRow } from '@/lib/calculator/types'
import {
  prefabTierForName,
  PREFAB_TIER_ORDER,
  PREFAB_TIER_LABELS,
  type PrefabTier,
} from '@/lib/calculator/prefab-definitions'
import { LibraryCard } from '@/components/future/library-card'
import { LibraryFilter } from '@/components/future/library-filter'
import { DisclaimerStrip } from '@/components/future/disclaimer-strip'
import { Button } from '@/components/editorial/button'
import { PageOpening } from '@/components/editorial'

/**
 * /toekomst/bibliotheek — publieke Rekenhulp-bibliotheek.
 *
 * Server-component. Drie databronnen:
 *  1. `custom_calculators` met `is_public = true` (top 50, geordend op
 *     like_count DESC, published_at DESC; RLS staat dit toe voor
 *     iedere ingelogde user).
 *  2. Auteur-display-names via een aparte profiles-query op de
 *     verzamelde `user_id`s (één round-trip; RLS staat `marketplace_display_name`
 *     read toe — fallback "Anoniem" wanneer null).
 *  3. User-context (assets/debts/profile via loadHorizonData) voor de
 *     "ontbrekende vereisten"-indicator + de optionele filter.
 *
 * Filter `?filter=usable` wordt client-side getoggled door `<LibraryFilter>`
 * en hier server-side toegepast in JS (vereisten zijn een afgeleide
 * eigenschap van `definition.inputs`, niet een DB-kolom).
 */

export const metadata: Metadata = {
  title: 'Rekenhulp-bibliotheek — TriFinity',
  description:
    'Ontdek rekenhulpen die andere TriFinity-gebruikers gemaakt hebben. Dupliceer wat je interessant vindt en pas aan op je eigen situatie.',
}

const LIST_LIMIT = 50

type SearchParams = Promise<{ filter?: string }>

interface ProfileRow {
  id: string
  marketplace_display_name: string | null
}

interface LikeRow {
  calculator_id: string
}

interface PublicCalculatorRow extends CustomCalculatorRow {
  user_id: string
}

export default async function BibliotheekPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { filter } = await searchParams
  const showOnlyUsable = filter === 'usable'

  const supabase = await createClient()

  // Horizon-data levert effective-input + assets/debts/housingContext —
  // alles wat we nodig hebben voor `buildUserDataContext`. We hebben
  // het hele bundle hier niet nodig; één call is goedkoper dan een
  // losse parallelle profile/assets/debts-fetch én blijft consistent
  // met andere /toekomst-routes.
  const horizonData = await loadHorizonData(supabase)
  const userCtx = buildUserDataContext({
    effectiveInput: horizonData.effectiveInput,
    unlinkedCash: horizonData.unlinkedCash,
    assets: horizonData.assets,
    debts: horizonData.debts,
    housingContext: horizonData.housingContext,
  })

  // 1. Publieke calculators — RLS-policy "Public calculators are readable"
  //    laat ons rijen zien met is_public=true zonder eigenaar te zijn.
  const { data: calcRows } = await supabase
    .from('custom_calculators')
    .select(
      'id, user_id, name, description, definition, created_by_ai, sort_order, created_at, is_public, published_at, forked_from, like_count, duplicate_count',
    )
    .eq('is_public', true)
    .order('like_count', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(LIST_LIMIT)

  const calculators = (calcRows ?? []) as PublicCalculatorRow[]

  // 2. Auteur-display-names — één query, dedup op user_id. We accepteren
  //    een lege array als profiles-RLS geen leesrechten geeft (graceful
  //    fallback naar "Anoniem" overal).
  const authorIds = Array.from(new Set(calculators.map((c) => c.user_id)))
  let authorMap = new Map<string, string | null>()
  if (authorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, marketplace_display_name')
      .in('id', authorIds)
    const profiles = (profileRows ?? []) as ProfileRow[]
    authorMap = new Map(
      profiles.map((p) => [p.id, p.marketplace_display_name ?? null]),
    )
  }

  // 3. User's likes voor de huidige set calculators (heart-vulling).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let likedIds = new Set<string>()
  if (user && calculators.length > 0) {
    const { data: likeRows } = await supabase
      .from('calculator_likes')
      .select('calculator_id')
      .eq('user_id', user.id)
      .in(
        'calculator_id',
        calculators.map((c) => c.id),
      )
    likedIds = new Set(((likeRows ?? []) as LikeRow[]).map((l) => l.calculator_id))
  }

  // Vereisten-check per calculator. We bouwen `requirements` één keer per
  // rij; de filter past dezelfde lijst toe — geen dubbel werk.
  const enriched = calculators.map((calc) => {
    const reqs = inferRequirements(calc.definition)
    const checks = checkRequirements(reqs, userCtx)
    const userMeetsAll = checks.every((c) => c.met)
    return {
      calc,
      reqs,
      checks,
      userMeetsAll,
      isLiked: likedIds.has(calc.id),
      authorDisplayName: authorMap.get(calc.user_id) ?? null,
    }
  })

  const visible = showOnlyUsable
    ? enriched.filter((e) => e.userMeetsAll)
    : enriched

  // Groepeer in tier-secties. Curated prefabs (herkend op naam) vallen in
  // Starters/Verdieping/Specialist; user-gepubliceerde calcs in "community".
  type EnrichedItem = (typeof enriched)[number]
  const groups: { key: PrefabTier | 'community'; label: string; items: EnrichedItem[] }[] = [
    ...PREFAB_TIER_ORDER.map((tier) => ({
      key: tier,
      label: PREFAB_TIER_LABELS[tier],
      items: visible.filter((e) => prefabTierForName(e.calc.name) === tier),
    })),
    {
      key: 'community' as const,
      label: 'Van de community',
      items: visible.filter((e) => prefabTierForName(e.calc.name) === null),
    },
  ]
  const nonEmptyGroups = groups.filter((g) => g.items.length > 0)

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12 pt-4">
      {/* Breadcrumb terug — geen tab-balk; bibliotheek is een aparte route. */}
      <Link
        href="/toekomst?tab=rekenhulp"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-3)] hover:text-[var(--ink-2)] mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Terug naar rekenhulpen
      </Link>

      {/* Editorial pagina-opening — module-accent via --module-active-* (horizon) */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageOpening
          className="min-w-0"
          kicker="Toekomst · Bibliotheek"
          titleBefore="Wat anderen al hebben "
          emphasis="uitgerekend"
          titleAfter=""
          deck="Bekijk rekenhulpen die andere TriFinity-gebruikers met Will hebben gemaakt en gedeeld. Dupliceer wat je raakt — je eigen cijfers worden meteen ingevuld zodat je 'm op jouw situatie kunt beoordelen."
        />
        <LibraryFilter defaultEnabled={showOnlyUsable} />
      </div>

      {/* Lijst (per tier-sectie) of empty state */}
      {visible.length === 0 ? (
        <EmptyState showOnlyUsable={showOnlyUsable && enriched.length > 0} />
      ) : (
        <div className="space-y-8">
          {nonEmptyGroups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-3 text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--ink-3)] border-b border-[var(--border-ed)] pb-1.5">
                {group.label}
                <span className="ml-2 text-[var(--ink-3)]/60 normal-case tracking-normal">
                  {group.items.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map(({ calc, checks, userMeetsAll, isLiked, authorDisplayName }) => (
                  <LibraryCard
                    key={calc.id}
                    calculator={calc}
                    authorDisplayName={authorDisplayName}
                    isLiked={isLiked}
                    requirements={checks}
                    userMeetsAll={userMeetsAll}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <DisclaimerStrip variant="card" />
    </section>
  )
}

/**
 * EmptyState — twee modi:
 *  - Geen publieke rekenhulpen in het systeem → editorial uitnodiging
 *  - Filter aan, maar niets matcht → context-zin met reset-link
 */
function EmptyState({ showOnlyUsable }: { showOnlyUsable: boolean }) {
  if (showOnlyUsable) {
    return (
      <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-8 text-center">
        <span className="inline-flex w-10 h-10 rounded-xl bg-horizon-50 items-center justify-center mb-3">
          <Sparkles
            className="w-5 h-5 text-horizon-700"
            aria-hidden="true"
          />
        </span>
        <h2 className="font-serif text-lg text-[var(--ink)] mb-2">
          Geen rekenhulpen passen volledig bij je gegevens
        </h2>
        <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4 max-w-md mx-auto">
          Vul je profiel verder aan of zet de filter uit om alle publieke
          rekenhulpen te zien.
        </p>
        <Button href="/toekomst/bibliotheek" variant="secondary">
          Toon alles
        </Button>
      </article>
    )
  }

  return (
    <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-8 text-center">
      <span className="inline-flex w-10 h-10 rounded-xl bg-horizon-50 items-center justify-center mb-3">
        <BookOpen
          className="w-5 h-5 text-horizon-700"
          aria-hidden="true"
        />
      </span>
      <h2 className="font-serif text-lg text-[var(--ink)] mb-2">
        De bibliotheek is nog leeg
      </h2>
      <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4 max-w-md mx-auto">
        Word de eerste die een rekenhulp deelt. Maak er een met Will, en
        publiceer &apos;m zodat anderen op jouw inzicht kunnen voortbouwen.
      </p>
      <Button href="/toekomst?tab=rekenhulp" variant="primary" className="gap-1.5">
        <Sparkles className="w-4 h-4" aria-hidden="true" />
        Maak je eerste rekenhulp
      </Button>
    </article>
  )
}
