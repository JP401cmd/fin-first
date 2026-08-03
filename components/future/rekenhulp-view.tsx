'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calculator,
  Sparkles,
  ArrowLeft,
  Save,
  Trash2,
  Wand2,
  Loader2,
  MoreHorizontal,
  Globe2,
  EyeOff,
  Library,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import type { LocalCalcProgress } from '@/lib/ai/local/local-calculator-resolver'
import { CalculatorRunner } from './calculator-runner'
import { CalculatorToLifeEventSheet } from './calculator-to-life-event-sheet'
import { PublishCurationSheet } from './publish-curation-sheet'
import { OwnerStatsBadge } from './owner-stats-badge'
import { RateLimitBadge } from './rate-limit-badge'
import type { CalculatorDefinition, CustomCalculatorRow } from '@/lib/calculator/types'
import type { PrefillValues } from '@/lib/calculator/user-data-keys'
import { CalendarPlus } from 'lucide-react'

/**
 * RekenhulpView — eigen plek (/toekomst?tab=rekenhulp) waar Fin helpt
 * een custom calculator te bouwen. Drie modi:
 *   - 'list':    opgeslagen calculators + "Nieuwe met Fin"-knop
 *   - 'build':   prompt-veld → AI-generatie → preview (Opslaan/Verfijnen)
 *   - 'run':     opgeslagen calculator interactief draaien
 *
 * Calculatie staat los van de projectie (plan-beslissing). Een
 * levensgebeurtenis-export volgt als losse eindstap (fase 2).
 */

const EXAMPLE_PROMPTS = [
  'Aflossen op mijn hypotheek vs. hetzelfde bedrag beleggen over 15 jaar',
  'Agio storten in mijn BV en daar beleggen vs. privé beleggen in box 3',
  'Mijn deel van de woning verhuren: belast in box 1 vs. box 3',
]

type Mode = 'list' | 'build' | 'run'

export function RekenhulpView({
  saved,
  prefill,
}: {
  saved: CustomCalculatorRow[]
  prefill: PrefillValues
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('list')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<CalculatorDefinition | null>(null)
  const [running, setRunning] = useState<CustomCalculatorRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [lifeEventSeed, setLifeEventSeed] = useState<{
    name: string
    amount: number
  } | null>(null)
  // Bibliotheek-flow: welke calculator zit op dit moment in de
  // publish-sheet (open ↔ null). We bewaren de volledige row zodat de
  // sheet meteen toegang heeft tot `definition.inputs` zonder een
  // extra query.
  const [publishing, setPublishing] = useState<CustomCalculatorRow | null>(null)
  // Welke "..."-menu is open in de lijst-modus (id of null). We
  // sluiten 'm automatisch zodra de gebruiker een actie kiest.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  // Verandert na elke succesvolle generate-call zodat `<RateLimitBadge>`
  // zijn verbruik opnieuw ophaalt — anders ziet de gebruiker pas bij
  // een page-reload dat zijn quotum is verlaagd.
  const [usageRefreshKey, setUsageRefreshKey] = useState(0)

  // Waar mag deze functie draaien? Alleen actief in build-modus: buiten dat
  // scherm is er niets te genereren en hoeft er dus ook geen GPU-check of
  // voorkeur-fetch te gebeuren.
  const exec = useExecutionMode('rapporten', mode === 'build')
  const lokaal = exec.status === 'lokaal'
  // Voortgang van de lokale bouw (vier deelstappen). Bij ~9-12 tok/s duurt dat
  // een paar minuten; zonder deze regel staat de gebruiker naar een spinner te
  // kijken zonder te weten of er iets gebeurt.
  const [localStap, setLocalStap] = useState<LocalCalcProgress | null>(null)

  /**
   * On-device variant. Levert exact hetzelfde `BuildCalculatorResult`-contract
   * als de route, dus vanaf `setDraft` is het pad identiek.
   *
   * WEEKLIMIET BEWUST NIET: `lib/calculator/rate-limit.ts` remt het cloudpad
   * omdat elke generatie daar een providerrekening is. Lokaal draait het op het
   * toestel van de gebruiker — er is geen rekening om te beschermen, en een limiet
   * zou hem betalen voor iets wat hij zelf al levert. Dat is een keuze, geen
   * vergeten stap.
   */
  async function generateLokaal(refine: boolean) {
    if (refine) {
      // EERLIJK MELDEN, NIET STIL DEGRADEREN. Verfijnen stuurt de bestaande
      // definitie mee terug de prompt in; samen met de instructies past dat niet
      // in de 8192 tokens die het lokale model in TOTAAL heeft (in + out samen).
      setError(
        'Verfijnen kan niet in privé-modus: de bestaande rekenhulp past er dan niet meer bij in het geheugen van het lokale model. Stel je vraag opnieuw voor een nieuwe rekenhulp, of zet "Rapporten & rekenhulpen" op cloud-AI via Mijn → Privacy.',
      )
      return
    }
    setLoading(true)
    setError(null)
    setLocalStap(null)
    try {
      // Dynamische import: de lokale bouwer (en daarachter de LiteRT-runtime)
      // komt pas binnen wanneer iemand 'm echt gebruikt — nooit in het
      // reguliere cloudpad.
      const { buildLocalCalculator } = await import('@/lib/ai/local/local-calculator-resolver')
      const res = await buildLocalCalculator(prompt, { onProgress: setLocalStap })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDraft(res.definition)
    } catch (err) {
      console.error('[lokale-ai] rekenhulp bouwen mislukt in de UI:', err)
      setError('De lokale AI kon geen rekenhulp maken. Probeer het opnieuw.')
    } finally {
      setLoading(false)
      setLocalStap(null)
    }
  }

  async function generate(refine = false) {
    if (!prompt.trim()) return

    // FAIL-CLOSED. Zowel 'resolving' als 'blocked' betekent: er vertrekt niets —
    // ook niet "even via de cloud". In 'resolving' weten we nog niet of iemand
    // privé-modus aan heeft staan, en dat is precies het venster waarin een
    // stille cloud-call de belofte breekt.
    if (exec.status === 'resolving') {
      setError('Nog even geduld — we bepalen waar deze functie mag draaien.')
      return
    }
    if (exec.status === 'blocked') {
      setError(exec.message ?? 'Lokale AI is nu niet beschikbaar op dit toestel.')
      return
    }
    if (exec.canUseLocal) {
      await generateLokaal(refine)
      return
    }
    if (!exec.canUseCloud) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/build-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          refineFrom: refine ? draft : undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'Genereren mislukt.')
        return
      }
      setDraft(data.definition)
      if (refine) setPrompt('')
      // Bump de refresh-key zodat de RateLimitBadge zijn quotum opnieuw
      // ophaalt — net na een succesvolle generate-call is dat het meest
      // relevante moment om de teller te zien zakken.
      setUsageRefreshKey((k) => k + 1)
    } catch {
      setError('Netwerkfout — probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Unpublish-flow: trekt de calculator uit de bibliotheek zonder hem
   * te verwijderen. `is_public` gaat naar false, `published_at` naar
   * NULL. Bestaande forks (door anderen) blijven leven omdat dat
   * deep-clones zijn — zie `/api/calculators/duplicate`.
   */
  async function unpublishCalculator(id: string) {
    try {
      const res = await fetch('/api/calculators/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calculatorId: id }),
      })
      if (res.ok) {
        router.refresh()
      }
    } catch {
      // Stille no-op: een netwerkfout hier laten we voor wat het is;
      // de gebruiker ziet dat zijn status niet veranderde en kan
      // opnieuw klikken. Geen alert-melding voor zo'n laagfrequente
      // actie.
    }
  }

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd.')
      setSaving(false)
      return
    }
    const { error: insertError } = await supabase.from('custom_calculators').insert({
      user_id: user.id,
      name: draft.name,
      description: draft.description ?? null,
      definition: draft,
      created_by_ai: true,
    })
    setSaving(false)
    if (insertError) {
      setError(`Opslaan mislukt: ${insertError.message}`)
      return
    }
    setDraft(null)
    setPrompt('')
    setMode('list')
    router.refresh()
  }

  async function deleteSaved(id: string) {
    const supabase = createClient()
    const { error: delError } = await supabase
      .from('custom_calculators')
      .delete()
      .eq('id', id)
    if (!delError) router.refresh()
  }

  // ── Build-modus ──────────────────────────────────────────────
  if (mode === 'build') {
    return (
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-10">
        <button
          type="button"
          onClick={() => {
            setMode('list')
            setDraft(null)
            setError(null)
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-3)] hover:text-[var(--ink-2)] mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Terug
        </button>

        <header className="mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-horizon-700">
              {lokaal ? 'Rekenhulp bouwen op je eigen toestel' : 'Rekenhulp bouwen met Fin'}
            </div>
            {/* Verbruik-badge — geeft de gebruiker zicht op zijn weekquotum
                vóór hij submit. `usageRefreshKey` bumpt na een succesvolle
                generate zodat de teller meteen zakt. Lokaal is er geen quotum
                (zie generateLokaal), dus dan tonen we 'm niet. */}
            {exec.status === 'cloud' && (
              <RateLimitBadge
                refreshKey={usageRefreshKey}
                mode={draft ? 'refinements' : 'generations'}
              />
            )}
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Beschrijf je vraagstuk
          </h2>
          <p className="text-sm text-[var(--ink-2)] mt-1 leading-relaxed">
            Fin maakt er een rekenhulp van met jouw gegevens al ingevuld.
          </p>

          {/* VERWACHTINGSMANAGEMENT — een lokale rekenhulp is aantoonbaar armer
              dan een cloud-rekenhulp. Dat is geen storing maar een eigenschap
              van de privé-modus, en dus benoemen we het vooraf in plaats van de
              gebruiker het te laten ontdekken. */}
          {lokaal && (
            <p className="mt-2 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--ink-2)] leading-relaxed">
              In privé-modus rekent je eigen toestel. Dat blijft binnen de deur,
              maar levert een <strong className="font-semibold">kleinere rekenhulp</strong>: één
              berekening, hooguit vier invoervelden en drie uitkomsten — geen
              scenario-vergelijking. Reken op een paar minuten. Wil je een
              uitgebreide rekenhulp, zet &lsquo;Rapporten &amp; rekenhulpen&rsquo; dan op
              cloud-AI via Mijn → Privacy.
            </p>
          )}

          {exec.status === 'blocked' && (
            <p
              role="status"
              className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed"
            >
              {exec.message}
            </p>
          )}
        </header>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="bv. Aflossen op mijn hypotheek vs. beleggen over 15 jaar"
          className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--ink-3)] resize-none"
        />

        {!draft && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="text-[11px] rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-[var(--ink-3)] hover:border-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => generate(!!draft && !lokaal)}
            disabled={loading || !prompt.trim() || exec.status === 'resolving' || exec.status === 'blocked'}
            className="inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="w-4 h-4" aria-hidden="true" />
            )}
            {draft && !lokaal ? 'Verfijnen' : 'Genereer rekenhulp'}
          </button>
        </div>

        {/* Voortgang van de vier deelstappen. `aria-live` zodat een schermlezer
            de stapwissel meekrijgt — bij minutenlange generatie is stilte geen
            optie. */}
        {loading && lokaal && (
          <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--ink-3)]">
            {localStap
              ? `Stap ${localStap.step} van ${localStap.totaal} — ${localStap.label}`
              : 'Het model wordt klaargezet…'}
          </p>
        )}

        {/* Verfijnen bestaat lokaal niet (zie generateLokaal). Dat melden we
            zichtbaar naast de knop in plaats van het stil weg te laten. */}
        {draft && lokaal && (
          <p className="mt-2 text-xs text-[var(--ink-3)] leading-relaxed">
            Verfijnen kan alleen met cloud-AI — de bestaande rekenhulp past er
            lokaal niet bij in het geheugen. Stel je vraag opnieuw voor een
            nieuwe rekenhulp.
          </p>
        )}

        {error && (
          <div role="alert" className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </div>
        )}

        {draft && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="font-serif text-lg text-[var(--ink)]">{draft.name}</h3>
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving}
                className="inline-flex items-center gap-1.5 bg-horizon-700 text-white px-3 py-2 text-sm font-semibold hover:bg-horizon-800 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Opslaan
              </button>
            </div>
            <CalculatorRunner definition={draft} prefill={prefill} />
          </div>
        )}
      </section>
    )
  }

  // ── Run-modus ────────────────────────────────────────────────
  if (mode === 'run' && running) {
    return (
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-10">
        <button
          type="button"
          onClick={() => {
            setMode('list')
            setRunning(null)
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-3)] hover:text-[var(--ink-2)] mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Terug naar rekenhulpen
        </button>
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Rekenhulp
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">{running.name}</h2>
        </header>
        <CalculatorRunner
          definition={running.definition}
          prefill={prefill}
          footer={({ winner, values }) => {
            // Voorgevuld bedrag: de compare-output van het winnende
            // scenario (indien aanwezig), anders 0.
            const compareKey = running.definition.compare?.outputKey
            const seedAmount =
              winner && compareKey ? values[winner]?.[compareKey] ?? 0 : 0
            return (
              <button
                type="button"
                onClick={() =>
                  setLifeEventSeed({
                    name: running.definition.name,
                    amount: Math.abs(seedAmount ?? 0),
                  })
                }
                className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-2)] hover:border-[var(--ink-3)] transition-colors"
              >
                <CalendarPlus className="w-4 h-4" aria-hidden="true" />
                Maak hier een levensgebeurtenis van
              </button>
            )
          }}
        />
        {lifeEventSeed && (
          <CalculatorToLifeEventSheet
            defaultName={lifeEventSeed.name}
            defaultAmount={lifeEventSeed.amount}
            defaultAge={prefill.current_age ? Math.round(prefill.current_age) : null}
            onClose={() => setLifeEventSeed(null)}
          />
        )}
      </section>
    )
  }

  // ── Lijst-modus (default) ────────────────────────────────────
  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-10">
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — rekenhulp
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Jouw rekenhulpen
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Brug naar de publieke marktplaats — anderen hun gepubliceerde
              rekenhulpen ontdekken en kopiëren. Bewust een tekstlink (geen
              primary CTA) zodat de "Nieuwe met Fin"-actie de hoofdfocus
              blijft. */}
          <Link
            href="/toekomst/bibliotheek"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-horizon-700 hover:text-horizon-800 transition-colors"
          >
            <Library className="w-4 h-4" aria-hidden="true" />
            Open bibliotheek →
          </Link>
          <button
            type="button"
            onClick={() => {
              setMode('build')
              setDraft(null)
              setError(null)
            }}
            className="inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Nieuwe met Fin
          </button>
        </div>
      </header>

      {saved.length === 0 ? (
        <article className="border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
          <span className="inline-flex w-10 h-10 bg-horizon-50 items-center justify-center mb-3">
            <Calculator className="w-5 h-5 text-horizon-700" aria-hidden="true" />
          </span>
          <h3 className="font-serif text-lg text-[var(--ink)] mb-2">
            Nog geen rekenhulpen
          </h3>
          <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">
            Laat Fin een rekenhulp maken voor je eigen vraagstuk — aflossen
            vs. beleggen, verhuurregimes, of agio naar je BV. Je gegevens zijn
            al ingevuld; je past alleen de aannames aan.
          </p>
          <button
            type="button"
            onClick={() => setMode('build')}
            className="inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Maak je eerste rekenhulp
          </button>
        </article>
      ) : (
        <CategorizedCalcGrid
          saved={saved}
          openMenuId={openMenuId}
          setOpenMenuId={setOpenMenuId}
          onRun={(calc) => {
            setRunning(calc)
            setMode('run')
          }}
          onPublish={setPublishing}
          onUnpublish={(id) => void unpublishCalculator(id)}
          onDelete={(id) => void deleteSaved(id)}
        />
      )}

      {/* Publish-flow modal — alleen gerenderd als er een geselecteerde
          calculator is. De sheet beheert zijn eigen submit-state; bij
          succes doet hij router.refresh zodat de lijst de nieuwe
          is_public-status oppikt. */}
      {publishing && (
        <PublishCurationSheet
          open={publishing !== null}
          onClose={() => setPublishing(null)}
          calculator={publishing}
        />
      )}
    </section>
  )
}

/**
 * Categoriseer "Jouw rekenhulpen" in drie groepen zodat het verschil
 * tussen privé-werkbladen, eigen publicaties en aanpassingen-vanuit-de-
 * bibliotheek visueel helder is — én zodat een gepubliceerde calc niet
 * tegelijk als duplicate in de "privé"-sectie verschijnt (publish-flow
 * creëert bewust een snapshot-rij; die hoort onder "Mijn publicaties",
 * niet ernaast in "Werkbladen").
 *
 * Categorieën:
 *   - Werkbladen       : !is_public && !forked_from
 *   - Vanuit bibliotheek : forked_from != null (eventueel ook publiek)
 *   - Mijn publicaties : is_public && !forked_from
 */
type CalcCategory = 'private' | 'forked' | 'published'

function categorize(calc: CustomCalculatorRow): CalcCategory {
  if (calc.forked_from) return 'forked'
  if (calc.is_public) return 'published'
  return 'private'
}

function CategorizedCalcGrid({
  saved,
  openMenuId,
  setOpenMenuId,
  onRun,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  saved: CustomCalculatorRow[]
  openMenuId: string | null
  setOpenMenuId: (id: string | null) => void
  onRun: (calc: CustomCalculatorRow) => void
  onPublish: (calc: CustomCalculatorRow) => void
  onUnpublish: (id: string) => void
  onDelete: (id: string) => void
}) {
  const groups = useMemo(() => {
    const map: Record<CalcCategory, CustomCalculatorRow[]> = {
      private: [],
      forked: [],
      published: [],
    }
    for (const calc of saved) {
      map[categorize(calc)].push(calc)
    }
    return map
  }, [saved])

  const sections: Array<{
    key: CalcCategory
    label: string
    hint: string
    items: CustomCalculatorRow[]
  }> = [
    {
      key: 'private',
      label: 'Werkbladen',
      hint: 'Je eigen rekenhulpen — alleen voor jou zichtbaar.',
      items: groups.private,
    },
    {
      key: 'forked',
      label: 'Vanuit bibliotheek',
      hint: 'Gekopieerd uit de bibliotheek en aanpasbaar op jouw situatie.',
      items: groups.forked,
    },
    {
      key: 'published',
      label: 'Mijn publicaties',
      hint: 'Versies die je hebt gedeeld in de bibliotheek.',
      items: groups.published,
    },
  ]

  return (
    <div className="space-y-6">
      {sections.map((section) =>
        section.items.length === 0 ? null : (
          <section key={section.key} aria-labelledby={`calc-sec-${section.key}`}>
            <header className="flex items-baseline justify-between gap-3 mb-2 border-b border-[var(--border-ed)] pb-1">
              <h3
                id={`calc-sec-${section.key}`}
                className="text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--ink-3)]"
              >
                {section.label}
                <span className="ml-1.5 text-[var(--ink-3)] font-mono font-normal normal-case tracking-normal">
                  ({section.items.length})
                </span>
              </h3>
              <p className="text-[11px] italic text-[var(--ink-3)] leading-snug hidden sm:block">
                {section.hint}
              </p>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {section.items.map((calc) => (
                <SavedCalculatorCard
                  key={calc.id}
                  calc={calc}
                  category={section.key}
                  menuOpen={openMenuId === calc.id}
                  onOpenMenu={() => setOpenMenuId(calc.id)}
                  onCloseMenu={() => setOpenMenuId(null)}
                  onRun={() => onRun(calc)}
                  onPublish={() => {
                    setOpenMenuId(null)
                    onPublish(calc)
                  }}
                  onUnpublish={() => {
                    setOpenMenuId(null)
                    onUnpublish(calc.id)
                  }}
                  onDelete={() => {
                    setOpenMenuId(null)
                    onDelete(calc.id)
                  }}
                />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  )
}

const CATEGORY_BADGE: Record<
  CalcCategory,
  { label: string; className: string } | null
> = {
  // Geen badge nodig voor "private" — dat is de default state.
  private: null,
  forked: {
    label: 'Uit bibliotheek',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  published: {
    label: 'Gepubliceerd',
    className: 'bg-violet-50 text-violet-800 border-violet-200',
  },
}

/**
 * SavedCalculatorCard — één rij in de "Jouw rekenhulpen"-lijst. Bevat:
 *  - Naam + (indien publiek) `<OwnerStatsBadge>` met like/copy-tellers
 *  - "Openen"-knop (primary)
 *  - "..."-menu met Publiceren / Unpublishen / Verwijderen
 *
 * Het menu sluit automatisch bij klik buiten de kaart, escape, en bij
 * elke gekozen actie (de parent reset `openMenuId` na de mutatie).
 */
function SavedCalculatorCard({
  calc,
  category,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onRun,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  calc: CustomCalculatorRow
  category: CalcCategory
  menuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onRun: () => void
  onPublish: () => void
  onUnpublish: () => void
  onDelete: () => void
}) {
  const isPublic = Boolean(calc.is_public)
  const badge = CATEGORY_BADGE[category]
  const menuRef = useRef<HTMLDivElement>(null)

  // Click-outside + Escape sluiten het menu. We binden alleen wanneer
  // het menu daadwerkelijk open is om onnodige globale listeners te
  // voorkomen.
  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (e.target instanceof Node && !menuRef.current.contains(e.target)) {
        onCloseMenu()
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseMenu()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, onCloseMenu])

  return (
    <article className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 flex flex-col">
      {badge && (
        <span
          className={`self-start inline-block text-[9px] uppercase tracking-[0.12em] font-bold border px-1.5 py-0.5 mb-2 ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
      <div className="flex items-start gap-2 mb-2">
        <span className="inline-flex w-8 h-8 bg-horizon-50 text-horizon-700 items-center justify-center shrink-0">
          <Calculator className="w-4 h-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight flex-1 min-w-0">
          {calc.name}
        </h3>
      </div>

      {/* OwnerStatsBadge: zelf-rendert niets als is_public=false, dus
          we mogen 'm altijd plaatsen — geen conditional rendering nodig. */}
      <div className="mb-2">
        <OwnerStatsBadge
          likeCount={calc.like_count ?? 0}
          duplicateCount={calc.duplicate_count ?? 0}
          isPublic={isPublic}
          publishedAt={calc.published_at ?? null}
        />
      </div>

      {calc.description && (
        <p className="text-xs text-[var(--ink-2)] leading-snug mb-3 line-clamp-2">
          {calc.description}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onRun}
          className="flex-1 inline-flex items-center justify-center gap-1.5 border border-[var(--border-ed)] px-3 py-2 text-xs font-semibold text-[var(--ink-2)] hover:border-[var(--ink-3)] transition-colors"
        >
          Openen
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => (menuOpen ? onCloseMenu() : onOpenMenu())}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Meer acties voor ${calc.name}`}
            className="inline-flex items-center justify-center w-9 h-9 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 bottom-full mb-1 z-10 min-w-[180px] border border-[var(--border-ed)] bg-[var(--paper)] shadow-lg overflow-hidden"
            >
              {isPublic ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={onUnpublish}
                  className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] text-left"
                >
                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  Uit bibliotheek halen
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={onPublish}
                  className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] text-left"
                >
                  <Globe2 className="w-3.5 h-3.5 text-horizon-700" aria-hidden="true" />
                  Publiceren in bibliotheek
                </button>
              )}
              <div className="border-t border-[var(--border-ed)]" />
              <button
                type="button"
                role="menuitem"
                onClick={onDelete}
                className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-negative hover:bg-negative/10 text-left"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Verwijderen
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
