import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Heart, GitFork, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import {
  buildUserDataContext,
  checkRequirements,
  inferRequirements,
} from '@/lib/calculator/requirements'
import { buildPrefillValues } from '@/lib/calculator/user-data-keys'
import type { CustomCalculatorRow } from '@/lib/calculator/types'
import { CalculatorRunner } from '@/components/future/calculator-runner'
import { RequirementsChecklist } from '@/components/future/requirements-checklist'
import { DisclaimerStrip } from '@/components/future/disclaimer-strip'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageOpening } from '@/components/editorial'
import { DetailActions } from './detail-actions'

/**
 * /toekomst/bibliotheek/[id] — detail-preview van een publieke rekenhulp.
 *
 * Server-component. RLS staat read-access toe op alle `custom_calculators`
 * met `is_public=true` (zie migratie 20260529100000). Wanneer de rij
 * niet bestaat of niet publiek is → `notFound()` (Next.js 404).
 *
 * De pagina toont:
 *  - Titel + Wil-kicker + auteur ("Door {display_name | 'Anoniem'}")
 *  - Like/duplicate-counters
 *  - Action-row: Dupliceren (`<DuplicateConfirmSheet>` van Agent C),
 *    Like (`<LikeButton>` van Agent C), Melden (`<ReportSheet>` van Agent C)
 *  - Vereisten-checklist met deep-links waar de user gegevens kan
 *    aanvullen
 *  - Read-only voorbeeld van de runner (sliders & scenario-tabs werken,
 *    maar geen Opslaan/Verfijnen)
 *  - Aannames + Wft-disclaimer onderaan
 *
 * De action-row leeft in een aparte client-component (`DetailActions`)
 * omdat zowel Like, Dupliceer-sheet als Report-sheet hun eigen state
 * beheren. Server houden we daardoor zuiver presentatie.
 */

interface PublicCalculatorRow extends CustomCalculatorRow {
  user_id: string
}

interface ProfileRow {
  marketplace_display_name: string | null
}

interface LikeRow {
  user_id: string
}

type PageParams = Promise<{ id: string }>

export async function generateMetadata({
  params,
}: {
  params: PageParams
}): Promise<Metadata> {
  // Voor de title halen we alleen de naam op (lichtgewicht select).
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('custom_calculators')
    .select('name, description, is_public')
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle()
  if (!data) {
    return { title: 'Rekenhulp niet gevonden — TriFinity' }
  }
  return {
    title: `${data.name} — Rekenhulp-bibliotheek`,
    description:
      data.description ??
      'Bekijk een publieke rekenhulp uit de TriFinity-bibliotheek.',
  }
}

export default async function BibliotheekDetailPage({
  params,
}: {
  params: PageParams
}) {
  const { id } = await params
  const supabase = await createClient()

  // 1. De publieke calculator. RLS-policy zorgt dat niet-publieke rijen
  //    niet teruggegeven worden, maar we filteren expliciet voor de
  //    duidelijkheid (en mocht een eigenaar zijn eigen rij benaderen
  //    voor preview, dan willen we ook 404 wanneer 'm nog niet publiek
  //    staat — anders zou een private rij hier ongewenst preview-baar
  //    worden).
  const { data: calcRow } = await supabase
    .from('custom_calculators')
    .select(
      'id, user_id, name, description, definition, created_by_ai, sort_order, created_at, is_public, published_at, forked_from, like_count, duplicate_count',
    )
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle()

  if (!calcRow) {
    notFound()
  }
  const calculator = calcRow as PublicCalculatorRow

  // 2. Auteur-displayname. Een join via PostgREST is fragiel met RLS;
  //    een aparte query op profiles is simpeler en doet RLS netjes
  //    voor ons (graceful fallback naar Anoniem).
  let authorDisplayName: string | null = null
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('marketplace_display_name')
    .eq('id', calculator.user_id)
    .maybeSingle()
  if (profileRow) {
    authorDisplayName = (profileRow as ProfileRow).marketplace_display_name ?? null
  }

  // 3. Like-state voor de huidige user (alleen ingelogd zinvol).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let isLiked = false
  if (user) {
    const { data: likeRow } = await supabase
      .from('calculator_likes')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('calculator_id', calculator.id)
      .maybeSingle()
    isLiked = Boolean((likeRow as LikeRow | null)?.user_id)
  }

  // 4. User-data voor vereisten-checks + prefill van de read-only runner.
  const horizonData = await loadHorizonData(supabase)
  const userCtx = buildUserDataContext({
    effectiveInput: horizonData.effectiveInput,
    unlinkedCash: horizonData.unlinkedCash,
    assets: horizonData.assets,
    debts: horizonData.debts,
    housingContext: horizonData.housingContext,
  })
  const prefill = buildPrefillValues({
    effectiveInput: horizonData.effectiveInput,
    unlinkedCash: horizonData.unlinkedCash,
    assets: horizonData.assets,
    housingContext: horizonData.housingContext,
    fireParams: horizonData.fireParams,
  })

  const reqs = inferRequirements(calculator.definition)
  const checks = checkRequirements(reqs, userCtx)

  const likeCount = calculator.like_count ?? 0
  const duplicateCount = calculator.duplicate_count ?? 0
  const description =
    calculator.description ?? calculator.definition.description ?? ''

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-12 pt-4">
      {/* Runtime-afhankelijke titel — dynamische route, niet via de statische
          resolver te dekken. Hergebruikt de calculatornaam uit de header. */}
      <NavStackMeta title={calculator.name} bottomBar={{ kind: 'tabs' }} />

      {/* Breadcrumb */}
      <Link
        href="/toekomst/bibliotheek"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-3)] hover:text-[var(--ink-2)] mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Terug naar bibliotheek
      </Link>

      {/* Editorial pagina-opening — dynamische naam als accent, module-accent
          via --module-active-* (horizon). */}
      <PageOpening
        className="mb-6"
        kicker="Toekomst · Bibliotheek"
        titleBefore="Alvast voor je "
        emphasis="nagerekend"
        titleAfter="."
        deck={
          <>
            <strong className="font-semibold not-italic text-[var(--ink)]">
              {calculator.name}
            </strong>
            {description ? ` — ${description}` : ''}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--ink-3)]">
          <span className="inline-flex items-center gap-1">
            <User className="w-3.5 h-3.5" aria-hidden="true" />
            Door {authorDisplayName ?? 'Anoniem'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart
              className={[
                'w-3.5 h-3.5',
                isLiked ? 'fill-rose-500 text-rose-500' : '',
              ].join(' ')}
              aria-hidden="true"
            />
            <span className="font-mono tabular-nums">{likeCount}</span> likes
          </span>
          <span className="inline-flex items-center gap-1">
            <GitFork className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{duplicateCount}</span>{' '}
            duplicaten
          </span>
        </div>
      </PageOpening>

      {/* Acties (Like/Dupliceer/Melden) — client-component met sheets */}
      <DetailActions
        calculator={calculator}
        checks={checks}
        initiallyLiked={isLiked}
        initialLikeCount={likeCount}
        canInteract={Boolean(user)}
      />

      {/* Vereisten-checklist */}
      <div className="my-6">
        <RequirementsChecklist checks={checks} />
      </div>

      {/* Read-only preview van de runner */}
      <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
        <h2 className="font-serif text-lg text-[var(--ink)] mb-3">
          Voorbeeld
        </h2>
        <p className="text-xs text-[var(--ink-3)] mb-4 leading-snug">
          Speel met de sliders om te zien hoe de uitkomsten reageren. Wil
          je deze rekenhulp echt opslaan met je eigen gegevens? Klik dan
          op <strong className="text-[var(--ink-2)]">Dupliceer</strong>.
        </p>
        <CalculatorRunner
          definition={calculator.definition}
          prefill={prefill}
          readOnly
        />
      </div>

      <DisclaimerStrip variant="card" />
    </section>
  )
}
