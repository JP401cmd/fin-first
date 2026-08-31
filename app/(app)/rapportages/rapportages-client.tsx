'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RapportageArchiveItem, RapportagesData } from '@/lib/rapportages-data-loader'
import { FileText, Trash2, Eye, Sparkles, Scale, BarChart3, Layers, Compass, Users, FileStack, Lock } from 'lucide-react'
import {
  Kicker,
  EditorialHeadline,
  EditorialDeck,
  CardEditorial,
  RekeningTag,
  OrnamentColophon,
  SectionLabel,
  TogglePill,
  PageInfoButton,
} from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { SectionDivider } from '@/components/app/section-divider'
import { DepthSection } from '@/components/app/depth-section'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { formatTimestamp } from '@/lib/format'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

type PeriodType = 'month' | 'quarter' | 'year'

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'month', label: 'Maand' },
  { value: 'quarter', label: 'Kwartaal' },
  { value: 'year', label: 'Jaar' },
]

// Romeinse cijfers — bestaande report_configs query is gecapt op 20.
const ROMAN = [
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
  'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
]

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']

  // Last 24 months
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({ value, label: `${months[d.getMonth()]} ${d.getFullYear()}` })
  }
  return options
}

function getQuarterOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  const currentQ = Math.floor(now.getMonth() / 3)

  for (let i = 0; i < 8; i++) {
    const totalQ = currentQ - i
    const year = now.getFullYear() + Math.floor(totalQ / 4)
    const q = ((totalQ % 4) + 4) % 4
    const monthStart = q * 3
    const label = `Q${q + 1} ${year}`
    options.push({ value: `${year}-${String(monthStart + 1).padStart(2, '0')}`, label })
  }
  return options
}

function getYearOptions(): { value: string; label: string }[] {
  const now = new Date()
  const options: { value: string; label: string }[] = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
    options.push({ value: String(y), label: String(y) })
  }
  return options
}

function computeDateRange(periodType: PeriodType, selection: string): { from: string; to: string; name: string } {
  if (periodType === 'month') {
    const [year, month] = selection.split('-').map(Number)
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const toDate = new Date(year, month, 1)
    const to = toDate.toISOString().split('T')[0]
    const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']
    return { from, to, name: `${months[month - 1]} ${year}` }
  }

  if (periodType === 'quarter') {
    const [year, monthStr] = selection.split('-').map(Number)
    const q = Math.floor((monthStr - 1) / 3) + 1
    const from = `${year}-${String(monthStr).padStart(2, '0')}-01`
    const toMonth = monthStr + 3
    const toYear = toMonth > 12 ? year + 1 : year
    const toM = toMonth > 12 ? toMonth - 12 : toMonth
    const to = `${toYear}-${String(toM).padStart(2, '0')}-01`
    return { from, to, name: `Q${q} ${year}` }
  }

  // year
  const year = parseInt(selection, 10)
  return { from: `${year}-01-01`, to: `${year + 1}-01-01`, name: `Jaarbericht ${year}` }
}

export function RapportagesClient({ data }: { data: RapportagesData }) {
  const router = useRouter()
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'
  // De AI-inleiding is het énige betaalde onderdeel van dit hele scherm; de zeven
  // rapporten zelf zijn deterministisch en gratis (H28/S9). Een slot tonen mag
  // daarom alleen bij die ene toggle — en alleen als de add-on ook echt te koop
  // is: zolang Polar niet live staat (`available: false`) zou een slotje een muur
  // zijn zonder deur.
  const aiLocked = data.aiAddonAvailable && !data.hasAiSubscription
  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [selection, setSelection] = useState('')
  const [savedConfigs, setSavedConfigs] = useState<RapportageArchiveItem[]>(data.archive)
  const [generating, setGenerating] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [useAi, setUseAi] = useState(false)
  const [balansDate, setBalansDate] = useState(new Date().toISOString().split('T')[0])
  const [budgetMonth, setBudgetMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  // Peildatum voor het Vermogensoverzicht (Kern-rapport). Default = vandaag,
  // analoog aan Balansstaat hierboven.
  const [vermogenDate, setVermogenDate] = useState(new Date().toISOString().split('T')[0])

  // Set default selection when period type changes
  useEffect(() => {
    const options = periodType === 'month' ? getMonthOptions()
      : periodType === 'quarter' ? getQuarterOptions()
        : getYearOptions()
    if (options.length > 0) {
      setSelection(options[0].value)
    }
  }, [periodType])

  // Het archief komt server-side mee (`loadRapportagesData`); deze component
  // haalt zelf niets meer op. De lokale state bestaat alleen nog om een
  // verwijderde rij direct te laten verdwijnen zonder herlaadbeurt.
  useEffect(() => {
    setSavedConfigs(data.archive)
  }, [data.archive])

  const handleGenerate = async () => {
    if (!selection) return
    setGenerating(true)

    try {
      const { from, to, name } = computeDateRange(periodType, selection)

      // Duplicate check — navigate to existing report if same period exists
      const existing = savedConfigs.find(c => c.date_from === from && c.date_to === to)
      if (existing) {
        router.push(`/rapportages/${existing.id}?type=${existing.period_type}&from=${existing.date_from}&to=${existing.date_to}&ai=${existing.use_ai}`)
        return
      }

      // Save config
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          period_type: periodType,
          date_from: from,
          date_to: to,
          use_ai: useAi,
        }),
      })

      if (res.ok) {
        const config = await res.json()
        router.push(`/rapportages/${config.id}?type=${periodType}&from=${from}&to=${to}&ai=${useAi}`)
      } else {
        // Navigate anyway, the report viewer will fetch data directly
        router.push(`/rapportages/new?type=${periodType}&from=${from}&to=${to}&ai=${useAi}`)
      }
    } catch {
      const { from, to } = computeDateRange(periodType, selection)
      router.push(`/rapportages/new?type=${periodType}&from=${from}&to=${to}&ai=${useAi}`)
    } finally {
      setGenerating(false)
    }
  }

  // De rij verdween eerder ALTIJD uit de lijst, ook als de server het verzoek
  // weigerde: het antwoord werd niet gelezen. Een 403 of 500 zag er dan uit als
  // een geslaagde verwijdering tot de volgende herlaadbeurt de rij terugbracht
  // ("spookverwijdering"). We filteren nu pas ná een bevestigd `res.ok`, en
  // laten anders zien wát er misging.
  const handleDelete = async (id: string) => {
    setDeleteError(null)
    try {
      const res = await fetch(`/api/report?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        setDeleteError(
          (payload as { error?: string } | null)?.error || 'Verwijderen mislukt. Probeer het opnieuw.',
        )
        return
      }
      setSavedConfigs(prev => prev.filter(c => c.id !== id))
    } catch {
      setDeleteError('Verwijderen mislukt — geen verbinding met de server.')
    }
  }

  const handleView = (config: RapportageArchiveItem) => {
    router.push(`/rapportages/${config.id}?type=${config.period_type}&from=${config.date_from}&to=${config.date_to}&ai=${config.use_ai}`)
  }

  const options = periodType === 'month' ? getMonthOptions()
    : periodType === 'quarter' ? getQuarterOptions()
      : getYearOptions()

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <NavStackMeta title="Rapportages" bottomBar={{ kind: 'tabs' }} />
      {/* Editorial header — Type 1 Module-landing */}
      <header className="relative mb-6 space-y-3">
        <PageInfoButton
          description={PAGE_INFO['/rapportages']}
          className="absolute right-0 top-0"
        />
        <Kicker>Rapportages</Kicker>
        <EditorialHeadline level="h2" size="lg" emphasis="archief">
          Jouw financieel archief
        </EditorialHeadline>
        <EditorialDeck>
          Genereer een overzicht van elke periode in je financiele leven.
        </EditorialDeck>
      </header>

      <SectionDivider variant="double-rule" />

      {/* ── Duiding vóór de keuze ───────────────────────────────────────────
          Zeven rapportvormen naast elkaar zeggen een beginner niets. Deze regel
          zegt wat er vooraan staat en waarom, zodat "minder tonen" ook
          "begrijpelijker tonen" wordt. In Volledig is de rangorde overbodig —
          daar staat alles toch open. */}
      {simple && (
        <p
          className="mt-6 italic text-[15px] leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Twee rapporten staan vooraan: een <strong className="font-semibold not-italic">balansstaat</strong> (wat
          je hebt en wat je verschuldigd bent op één dag) en je{' '}
          <strong className="font-semibold not-italic">persoonlijk plan</strong> (de aannames waarmee we je
          toekomst doorrekenen). Allebei direct klaar, zonder invoer. De overige
          vijf vormen staan eronder.
        </p>
      )}

      {/* === Vooraan — de twee vormen die zonder voorbereiding klaarstaan === */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* === II. Persoonlijke balans === */}
        <CardEditorial accent className="flex flex-col">
          <div className="flex flex-1 flex-col p-6 sm:p-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Kicker size="small">
                <Scale className="h-3 w-3" aria-hidden />
                <span>Balansstaat</span>
              </Kicker>
              <span
                className="italic text-sm text-[var(--module-active-700)]"
                style={{ fontFamily: 'var(--font-playfair, serif)' }}
                aria-hidden
              >
                i.
              </span>
            </div>

            <EditorialHeadline level="h2" size="sm" emphasis="zaken" className="mb-2">
              Een staat van zaken
            </EditorialHeadline>

            <EditorialDeck className="mb-5">
              Wat je hebt, wat je verschuldigd bent, en wat er overblijft op een peildatum.
            </EditorialDeck>

            <div className="mb-5">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">Peildatum</label>
              <input
                type="date"
                value={balansDate}
                onChange={(e) => setBalansDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-inter text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--module-active-500)]"
              />
            </div>

            <div className="mt-auto">
              <button
                type="button"
                onClick={() => router.push(`/rapportages/balans?date=${balansDate}`)}
                className="flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-4 py-3 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)]"
              >
                <Scale className="h-4 w-4" />
                Genereer balans
              </button>

              <p
                className="mt-4 italic text-[12px] leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Activa, passiva en netto vermogen op een moment vastgelegd.
              </p>
            </div>
          </div>
        </CardEditorial>

        {/* === V. Persoonlijk plan === */}
        <CardEditorial accent className="flex flex-col">
          <div className="flex flex-1 flex-col p-6 sm:p-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Kicker size="small">
                <Compass className="h-3 w-3" aria-hidden />
                <span>Persoonlijk plan</span>
              </Kicker>
              <span
                className="italic text-sm text-[var(--module-active-700)]"
                style={{ fontFamily: 'var(--font-playfair, serif)' }}
                aria-hidden
              >
                ii.
              </span>
            </div>

            <EditorialHeadline level="h2" size="sm" emphasis="uitgangspunten" className="mb-2">
              Jouw uitgangspunten op een rij
            </EditorialHeadline>

            <EditorialDeck className="mb-5">
              De aannames waarmee TriFinity je toekomst doorrekent — demografie, inkomen, AOW, uitgaven, rendement, eindstrategie. Om te delen met partner of adviseur.
            </EditorialDeck>

            <div className="mt-auto">
              <button
                type="button"
                onClick={() => router.push('/rapportages/persoonlijk-plan')}
                className="flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-4 py-3 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)]"
              >
                <Compass className="h-4 w-4" />
                Genereer persoonlijk plan
              </button>

              <p
                className="mt-4 italic text-[12px] leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Geen prognoses — alleen de input-zijde, zodat je kunt controleren of de parameters nog kloppen.
              </p>
            </div>
          </div>
        </CardEditorial>
      </div>

      {/* === Verdieping — de overige vijf vormen ===
          DepthSection i.p.v. HideInSimple: in Eenvoudig staat dit blok dicht
          (rust), maar het is één klik weg en de samenvatting vertelt wát erin
          zit. Hard verbergen zou de vormen onbereikbaar maken voor precies de
          gebruiker die standaard in Eenvoudig landt. In Volledig staat de
          sectie open — alle zeven vormen zichtbaar. */}
      <div className="mt-6">
        <DepthSection
          title="Meer rapportvormen"
          summary="Periodiek rapport, maandbudget, vermogensoverzicht, de spiegel en het totaalplan — vijf vormen die om een periode of peildatum vragen."
          icon={<FileStack className="h-4 w-4 text-[var(--ink-3)]" aria-hidden />}
        >
          <div className="space-y-6">
            {/* === I. Periodiek rapport — lead/hoofdartikel (volle breedte) === */}
            <CardEditorial accent className="mt-6">
              <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-2 lg:gap-10">
                {/* Links — redactionele intro */}
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Kicker size="small">
                      <FileText className="h-3 w-3" aria-hidden />
                      <span>Periodiek rapport</span>
                    </Kicker>
                    <span
                      className="italic text-sm text-[var(--module-active-700)]"
                      style={{ fontFamily: 'var(--font-playfair, serif)' }}
                      aria-hidden
                    >
                      iii.
                    </span>
                  </div>

                  <EditorialHeadline level="h2" size="sm" emphasis="samenvatting" className="mb-2">
                    Een redactionele samenvatting
                  </EditorialHeadline>

                  <EditorialDeck className="mb-0">
                    Hoe groei je vermogen, waar gaat je geld heen, en hoeveel dichter bij je horizon ben je gekomen?
                  </EditorialDeck>
                </div>

                {/* Rechts — generator-formulier */}
                <div>
                  {/* Periode-segmented + dropdown */}
                  <div className="mb-4">
                    <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">Periode</label>
                    <div className="flex gap-1 border border-[var(--border-ed)] bg-[var(--subtle)] p-1">
                      {PERIOD_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPeriodType(opt.value)}
                          className={`flex-1 px-3 py-1.5 font-inter text-xs font-medium transition-all ${
                            periodType === opt.value
                              ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s0)]'
                              : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-5">
                    <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                      {periodType === 'month' ? 'Maand' : periodType === 'quarter' ? 'Kwartaal' : 'Jaar'}
                    </label>
                    <select
                      value={selection}
                      onChange={(e) => setSelection(e.target.value)}
                      className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-inter text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--module-active-500)]"
                    >
                      {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* AI-toggle als TogglePill-row */}
                  {/* Inleiding — het énige betaalde onderdeel van dit scherm.
                      Het rapport zelf is deterministisch en blijft gratis; de
                      vergrendeling hoort dus HIER en niet op de knop eronder,
                      en ze is vóór de klik zichtbaar in plaats van pas ná het
                      genereren (S9). Zolang de add-on niet te koop is toont de
                      hub niets — `aiLocked` leest dat uit de catalogus. */}
                  <div className="mb-5">
                    <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">Inleiding</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <TogglePill on={!useAi} label="standaard" onClick={() => setUseAi(false)} />
                      {aiLocked ? (
                        <span
                          data-testid="ai-inleiding-slot"
                          className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-1.5 font-inter text-xs text-[var(--ink-3)]"
                        >
                          <Lock className="h-3 w-3" aria-hidden />
                          met ai-inleiding
                        </span>
                      ) : (
                        <TogglePill on={useAi} label="met ai-inleiding" onClick={() => setUseAi(true)} />
                      )}
                      {useAi && !aiLocked && <Sparkles className="h-3.5 w-3.5 text-[var(--module-active-700)]" aria-hidden />}
                    </div>
                    {aiLocked && (
                      <p className="mt-2 font-inter text-[12px] leading-snug text-[var(--ink-3)]">
                        De AI-inleiding hoort bij de AI-add-on. Het rapport zelf — alle cijfers, grafieken en
                        vergelijkingen — krijg je zonder abonnement volledig.{' '}
                        <Link href="/mijn/account" className="underline underline-offset-2 hover:text-[var(--ink)]">
                          Bekijk de add-on
                        </Link>
                      </p>
                    )}
                  </div>

                  {/* Primary CTA — bestaande button-stijl */}
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-4 py-3 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)] disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--paper)] border-t-transparent" />
                        Pagina&apos;s worden opgesteld...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        Genereer rapport
                      </>
                    )}
                  </button>

                  <p
                    className="mt-4 italic text-[12px] leading-snug text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {useAi ? 'Fin leest je cijfers en schrijft een korte editie. +5–10 seconden.' : 'Direct beschikbaar — een redactionele samenvatting in jouw context.'}
                  </p>
                </div>
              </div>
            </CardEditorial>

            <div className="grid gap-6 sm:grid-cols-2">
              {/* === III. Budgetrapport === */}
              <CardEditorial accent className="flex flex-col">
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Kicker size="small">
                      <BarChart3 className="h-3 w-3" aria-hidden />
                      <span>Maandbudget</span>
                    </Kicker>
                    <span
                      className="italic text-sm text-[var(--module-active-700)]"
                      style={{ fontFamily: 'var(--font-playfair, serif)' }}
                      aria-hidden
                    >
                      iv.
                    </span>
                  </div>

                  <EditorialHeadline level="h2" size="sm" emphasis="werkelijkheid" className="mb-2">
                    Budget tegenover de werkelijkheid
                  </EditorialHeadline>

                  <EditorialDeck className="mb-5">
                    Hoe je budget zich verhield tot de werkelijkheid. Met de vrijheidstijd-impact onderaan.
                  </EditorialDeck>

                  <div className="mb-5">
                    <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">Maand</label>
                    <select
                      value={budgetMonth}
                      onChange={(e) => setBudgetMonth(e.target.value)}
                      className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-inter text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--module-active-500)]"
                    >
                      {getMonthOptions().map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => router.push(`/rapportages/budget?month=${budgetMonth}`)}
                      className="flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-4 py-3 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)]"
                    >
                      <BarChart3 className="h-4 w-4" />
                      Genereer budgetrapport
                    </button>

                    <p
                      className="mt-4 italic text-[12px] leading-snug text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      Per categorie en per maand, inclusief trendanalyse over zes maanden.
                    </p>
                  </div>
                </div>
              </CardEditorial>

              {/* === IV. Vermogensoverzicht (Kern-rapport) === */}
              <CardEditorial accent className="flex flex-col">
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Kicker size="small">
                      <Layers className="h-3 w-3" aria-hidden />
                      <span>Vermogensoverzicht</span>
                    </Kicker>
                    <span
                      className="italic text-sm text-[var(--module-active-700)]"
                      style={{ fontFamily: 'var(--font-playfair, serif)' }}
                      aria-hidden
                    >
                      v.
                    </span>
                  </div>

                  <EditorialHeadline level="h2" size="sm" emphasis="inventaris" className="mb-2">
                    Een inventaris van het bezit
                  </EditorialHeadline>

                  <EditorialDeck className="mb-5">
                    Elke bezitting en schuld met alle kenmerken. Plus een diepere blik per actieve app: budgetten, holdings, verhuurrendement, hypotheekplanner.
                  </EditorialDeck>

                  <div className="mb-5">
                    <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">Peildatum</label>
                    <input
                      type="date"
                      value={vermogenDate}
                      onChange={(e) => setVermogenDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-inter text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--module-active-500)]"
                    />
                  </div>

                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => router.push(`/rapportages/vermogen?date=${vermogenDate}`)}
                      className="flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-4 py-3 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)]"
                    >
                      <Layers className="h-4 w-4" />
                      Genereer vermogensoverzicht
                    </button>

                    <p
                      className="mt-4 italic text-[12px] leading-snug text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      Per asset-type gegroepeerd, met alle type-specifieke kenmerken. Verschijnt naast app-secties zodra er activatie is.
                    </p>
                  </div>
                </div>
              </CardEditorial>

              {/* === VI. Benchmark — de spiegel === */}
              <CardEditorial accent className="flex flex-col">
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Kicker size="small">
                      <Users className="h-3 w-3" aria-hidden />
                      <span>Spiegel</span>
                    </Kicker>
                    <span
                      className="italic text-sm text-[var(--module-active-700)]"
                      style={{ fontFamily: 'var(--font-playfair, serif)' }}
                      aria-hidden
                    >
                      vi.
                    </span>
                  </div>

                  <EditorialHeadline level="h2" size="sm" emphasis="náást anderen" className="mb-2">
                    Hoe je ervoor staat — náást anderen
                  </EditorialHeadline>

                  <EditorialDeck className="mb-5">
                    Je gezondheid, vrijheidsleeftijd, spaarquote, vermogen en inkomen naast een vergelijkbare doelgroep — en naast de wereld.
                  </EditorialDeck>

                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => router.push('/rapportages/benchmark')}
                      className="flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-4 py-3 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)]"
                    >
                      <Users className="h-4 w-4" />
                      Open de spiegel
                    </button>

                    <p
                      className="mt-4 italic text-[12px] leading-snug text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      Op basis van officiële NL-statistiek voor jouw leeftijd en huishoudtype. Geen data van andere gebruikers.
                    </p>
                  </div>
                </div>
              </CardEditorial>

              {/* === VII. Totaalplan — het plan-als-document === */}
              <CardEditorial accent className="flex flex-col">
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Kicker size="small">
                      <FileStack className="h-3 w-3" aria-hidden />
                      <span>Totaalplan</span>
                    </Kicker>
                    <span
                      className="italic text-sm text-[var(--module-active-700)]"
                      style={{ fontFamily: 'var(--font-playfair, serif)' }}
                      aria-hidden
                    >
                      vii.
                    </span>
                  </div>

                  <EditorialHeadline level="h2" size="sm" emphasis="volledige plan" className="mb-2">
                    Je volledige plan als document
                  </EditorialHeadline>

                  <EditorialDeck className="mb-5">
                    Aannames, vermogensprojectie én slagingskans in één deelbaar rapport — met je vermogenspad naar volledige vrijheid en concrete inzichten.
                  </EditorialDeck>

                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => router.push('/rapportages/totaalplan')}
                      className="flex w-full items-center justify-center gap-2 bg-[var(--ink)] px-4 py-3 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)]"
                    >
                      <FileStack className="h-4 w-4" />
                      Genereer totaalplan
                    </button>

                    <p
                      className="mt-4 italic text-[12px] leading-snug text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      Alle cijfers uit dezelfde rekenmotor als Toekomst en Overzicht. Druk af als PDF voor partner of adviseur.
                    </p>
                  </div>
                </div>
              </CardEditorial>
            </div>
          </div>
        </DepthSection>
      </div>

      <SectionDivider variant="line" className="mt-10" />

      {/* === Archief === */}
      <div className="mt-8">
        <RekeningTag label="archief">
          <SectionLabel>Eerder verschenen</SectionLabel>

          {/* Altijd gemount, zodat een screenreader de melding hoort zodra ze verschijnt. */}
          <div role="alert" aria-live="polite">
            {deleteError && (
              <p className="mb-3 border-l-2 border-negative bg-negative-bg px-3 py-2 font-inter text-[13px] leading-snug text-negative">
                {deleteError}
              </p>
            )}
          </div>

          {/* Geen laad-spinner meer: het archief komt met de eerste render mee
              uit de server-loader, dus er is geen tussenstand om te tonen. */}
          {savedConfigs.length === 0 ? (
            // Type 9 Empty-state
            <div className="mx-auto max-w-md py-12 px-4 text-center">
              <FileText className="mx-auto mb-4 h-8 w-8 text-[var(--ink-3)]" aria-hidden />
              <p
                className="mb-2 text-xl text-[var(--ink)]"
                style={{ fontFamily: 'var(--font-playfair, serif)' }}
              >
                Je archief is leeg.
              </p>
              <p
                className="italic text-[15px] leading-relaxed text-[var(--ink-2)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Genereer je eerste rapport hierboven. Het verschijnt hier zodra het klaar is.
              </p>
            </div>
          ) : (
            // 2-koloms editorial index — vult de breedte als krant-"back-issues"-lijst
            <ul className="grid gap-x-10 sm:grid-cols-2">
              {savedConfigs.map((config, idx) => (
                <li
                  key={config.id}
                  className="group flex items-center gap-3 border-b border-dotted border-[var(--rule-soft)] px-2 py-3 transition-colors hover:bg-[var(--subtle)]"
                >
                  <span
                    className="mr-1 min-w-[2.5ch] shrink-0 italic text-sm text-[var(--module-active-700)]"
                    style={{ fontFamily: 'var(--font-playfair, serif)' }}
                    aria-hidden
                  >
                    {ROMAN[idx] ?? `${idx + 1}`}.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleView(config)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate text-sm text-[var(--ink)]"
                        style={{ fontFamily: 'var(--font-playfair, serif)' }}
                      >
                        {config.name}
                      </span>
                      {config.use_ai && (
                        <span className="shrink-0 border border-[var(--module-active-300)] bg-[var(--module-active-50)]/40 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--module-active-700)]">
                          AI
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--ink-3)]">
                      {formatTimestamp(config.date_from)} – {formatTimestamp(config.date_to)}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleView(config)}
                      className="p-2 text-[var(--ink-3)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                      title="Bekijken"
                      aria-label={`Bekijk ${config.name}`}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(config.id)}
                      className="p-2 text-[var(--ink-4)] transition-colors hover:bg-[var(--negative)]/10 hover:text-[var(--negative)]"
                      title="Verwijderen"
                      aria-label={`Verwijder ${config.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </RekeningTag>
      </div>

      {/* Footer */}
      <SectionDivider variant="double-rule" className="mt-10" />
      <OrnamentColophon
        module="Archief"
        text={formatTimestamp(new Date().toISOString())}
      />
    </div>
  )
}
