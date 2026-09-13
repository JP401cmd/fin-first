'use client'

/**
 * PlanReviewPane — de vijf stappen van de plan-review Toekomst (TPR-01, ADR 0142).
 *
 * Eén stap tegelijk, elk met drie zichtbare blokken (eigenaarsnorm formulier-uitleg):
 *  - "De app rekent nu met …"  — de keuze zoals de kern er nu mee rekent (A3);
 *  - "Wat het doet"            — de uitkomst in leeftijd, met een vergelijking (A4);
 *  - "Waarom dit ertoe doet".
 *
 * Inhoud komt per stap van `GET /api/plan-review?stap=` (server bouwt 'm uit de
 * canonieke kernel-run; hier wordt niets gerekend). "Bevestigen" schrijft eerst de
 * huidige (of gekozen) waarde via de bestaande domeinroute en zet daarna de markering
 * via `PUT /api/plan-review` (A5). "Overslaan" gaat door zonder te bevestigen; de pane
 * is op elk moment te sluiten en bevestigde stappen blijven bevestigd (A6).
 *
 * Na de laatste stap: het afsluitscherm "Voor wie wil" met verwijzingen naar de
 * bestaande Voorkeuren-kaarten en het bezittingenoverzicht (laag 2, alleen doorverwijzen).
 *
 * Overlay via `ShellOverlay kind="pane"` (z-[70]); de Tijdas blijft op desktop zichtbaar
 * naast de pane (A12). Kopniveau: de pane-titel is h3, de stapnaam h4.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Circle, Minus } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { noteOverlayNavigation } from '@/lib/overlay-history'
import { derivePlanReviewProgress } from '@/lib/plan-review/progress'
import {
  PLAN_REVIEW_LAAG2,
  PLAN_REVIEW_STAPPEN,
  PLAN_REVIEW_STAP_TITELS,
  parsePlanReviewState,
  type PlanReviewFacts,
  PLAN_REVIEW_NAAM,
  type PlanReviewProgress,
  type PlanReviewStap,
  type PlanReviewStapStatus,
} from '@/lib/plan-review/types'
import type { PlanReviewSchrijfActie, PlanReviewStapOverzicht } from '@/lib/plan-review/overzicht'

type Scherm = PlanReviewStap | 'afsluiten'

interface StapAntwoord {
  overzicht: PlanReviewStapOverzicht
  progress: PlanReviewProgress
  facts: PlanReviewFacts
}

/** De volgende stap die meetelt, ná `huidig`; `'afsluiten'` wanneer er geen meer is. */
export function volgendScherm(progress: PlanReviewProgress, huidig: PlanReviewStap): Scherm {
  const idx = PLAN_REVIEW_STAPPEN.indexOf(huidig)
  const volgende = progress.stappen.slice(idx + 1).find((s) => s.status !== 'nvt')
  return volgende?.stap ?? 'afsluiten'
}

async function schrijf(actie: PlanReviewSchrijfActie): Promise<string | null> {
  const res = await fetch(actie.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actie.body),
  })
  if (res.ok) return null
  const data = (await res.json().catch(() => ({}))) as { error?: unknown }
  return typeof data.error === 'string' ? data.error : 'Opslaan is niet gelukt.'
}

export function PlanReviewPane({
  open,
  startStap,
  initialProgress,
  onClose,
  onChanged,
}: {
  open: boolean
  startStap: PlanReviewStap
  initialProgress: PlanReviewProgress
  onClose: () => void
  /** Na een geslaagde bevestiging — de page ververst grafiek en kaart. */
  onChanged: () => void
}) {
  const router = useRouter()
  const [scherm, setScherm] = useState<Scherm>(startStap)
  const [progress, setProgress] = useState<PlanReviewProgress>(initialProgress)
  const [cache, setCache] = useState<Partial<Record<PlanReviewStap, StapAntwoord>>>({})
  const [laadFout, setLaadFout] = useState<string | null>(null)
  const [keuzeId, setKeuzeId] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [opslaanFout, setOpslaanFout] = useState<string | null>(null)

  const huidigAntwoord = scherm === 'afsluiten' ? null : cache[scherm]

  // Een trage lezing van een stap die de gebruiker al verliet mag de huidige stap
  // niet overschrijven (voortgang, foutregel): alleen de laatste lezing voor het
  // scherm dat nú open staat telt. Het antwoord zelf mag wel in de cache (per stap).
  const schermRef = useRef<Scherm>(scherm)
  const laadIdRef = useRef(0)
  useEffect(() => {
    schermRef.current = scherm
  }, [scherm])

  const laad = useCallback(async (stap: PlanReviewStap) => {
    const id = ++laadIdRef.current
    const actueel = () => id === laadIdRef.current && schermRef.current === stap
    setLaadFout(null)
    try {
      const res = await fetch(`/api/plan-review?stap=${stap}`)
      const data = (await res.json().catch(() => ({}))) as Partial<StapAntwoord> & { error?: string }
      if (!res.ok || !data.overzicht || !data.progress || !data.facts) {
        if (actueel()) setLaadFout(typeof data.error === 'string' ? data.error : 'Deze stap kon niet geladen worden.')
        return
      }
      setCache((c) => ({ ...c, [stap]: data as StapAntwoord }))
      if (actueel()) setProgress(data.progress)
    } catch {
      if (actueel()) setLaadFout('Deze stap kon niet geladen worden.')
    }
  }, [])

  useEffect(() => {
    if (!open || scherm === 'afsluiten' || cache[scherm]) return
    void laad(scherm)
  }, [open, scherm, cache, laad])

  // Keuze volgt de stap: bij binnenkomst de huidige optie (als die er is). Bewust
  // alleen op het antwoord van DEZE stap: een lezing van een andere stap mag een
  // gemaakte keuze niet wissen.
  useEffect(() => {
    setOpslaanFout(null)
    setKeuzeId(huidigAntwoord?.overzicht.keuzes.find((k) => k.huidig)?.id ?? null)
  }, [scherm, huidigAntwoord])

  const gaNaar = (s: Scherm) => setScherm(s)

  async function bevestig() {
    if (scherm === 'afsluiten' || !huidigAntwoord) return
    const { overzicht, facts } = huidigAntwoord
    const keuze = overzicht.keuzes.find((k) => k.id === keuzeId)
    const acties = keuze ? keuze.schrijf : overzicht.schrijf
    setBezig(true)
    setOpslaanFout(null)
    try {
      for (const actie of acties) {
        const fout = await schrijf(actie)
        if (fout) {
          setOpslaanFout(fout)
          return
        }
      }
      const res = await fetch('/api/plan-review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stap: scherm, bevestigd: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { plan_review_state?: unknown; error?: unknown }
      if (!res.ok) {
        setOpslaanFout(typeof data.error === 'string' ? data.error : 'Bevestigen is niet gelukt.')
        return
      }
      // Het enige feit dat een review-write zelf verandert: een woonstrategie is nu
      // opgeslagen. Zonder deze bijwerking bleef de woningstap lokaal 'open' tot de
      // volgende lezing.
      const nieuweFacts: PlanReviewFacts = acties.some((a) => a.url === '/api/housing-strategy')
        ? { ...facts, housingConfigured: true }
        : facts
      const nieuw = derivePlanReviewProgress(parsePlanReviewState(data.plan_review_state), nieuweFacts)
      setProgress(nieuw)
      // Een write kan de uitkomst van andere stappen verschuiven: die opnieuw laden.
      if (acties.length > 0) setCache({})
      onChanged()
      gaNaar(volgendScherm(nieuw, scherm))
    } catch {
      setOpslaanFout('Bevestigen is niet gelukt.')
    } finally {
      setBezig(false)
    }
  }

  function naarAanpassen(href: string) {
    // Programmatische navigatie uit een overlay: meld het vóór het sluiten, anders
    // breekt de history-release de lopende navigatie af (vijfde sluitroute).
    noteOverlayNavigation()
    onClose()
    router.push(href)
  }

  const overzicht = huidigAntwoord?.overzicht ?? null
  const kanBevestigen =
    !!overzicht && !bezig && overzicht.blokkade == null && !(overzicht.keuzeVerplicht && keuzeId == null)

  const isAfsluiten = scherm === 'afsluiten'
  const stapStatus = (stap: PlanReviewStap): PlanReviewStapStatus =>
    progress.stappen.find((s) => s.stap === stap)?.status ?? 'open'

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="pane"
      title={PLAN_REVIEW_NAAM}
      mobileBackCloses
      primaryAction={
        isAfsluiten
          ? { label: 'Sluiten', onClick: onClose }
          : { label: 'Bevestigen', onClick: () => void bevestig(), disabled: !kanBevestigen, loading: bezig }
      }
      secondaryAction={
        isAfsluiten
          ? undefined
          : { label: 'Overslaan', onClick: () => gaNaar(volgendScherm(progress, scherm)), disabled: bezig }
      }
      footerInfo={
        <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
          {progress.bevestigd} van {progress.totaal} bevestigd
        </span>
      }
    >
      <div className="space-y-5 px-4 py-4 sm:px-6">
        <ol aria-label="Stappen" className="flex flex-wrap gap-1.5">
          {PLAN_REVIEW_STAPPEN.map((stap, i) => {
            const status = stapStatus(stap)
            const actief = stap === scherm
            const Icon = status === 'bevestigd' ? Check : status === 'nvt' ? Minus : Circle
            return (
              <li key={stap}>
                <button
                  type="button"
                  onClick={() => gaNaar(stap)}
                  disabled={status === 'nvt' || bezig}
                  aria-current={actief ? 'step' : undefined}
                  className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                    actief
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  <span>
                    {i + 1}. {PLAN_REVIEW_STAP_TITELS[stap]}
                  </span>
                  <span className="sr-only">
                    {status === 'bevestigd' ? ' (bevestigd)' : status === 'nvt' ? ' (niet van toepassing)' : ' (open)'}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {isAfsluiten ? (
          <VoorWieWil progress={progress} />
        ) : laadFout ? (
          <div className="space-y-2 text-sm text-[var(--ink-2)]">
            <p role="alert" className="text-negative">{laadFout}</p>
            <button
              type="button"
              onClick={() => void laad(scherm)}
              className="text-xs font-semibold text-[var(--ink-2)] underline hover:text-[var(--ink)]"
            >
              Opnieuw proberen
            </button>
          </div>
        ) : !overzicht ? (
          <p className="text-sm text-[var(--ink-3)]" aria-live="polite">
            De app rekent deze stap door…
          </p>
        ) : (
          <StapInhoud
            overzicht={overzicht}
            index={PLAN_REVIEW_STAPPEN.indexOf(overzicht.stap)}
            keuzeId={keuzeId}
            onKeuze={setKeuzeId}
            onAanpassen={naarAanpassen}
            bezig={bezig}
          />
        )}

        {opslaanFout && (
          <p role="alert" className="text-sm text-negative">
            {opslaanFout}
          </p>
        )}
      </div>
    </ShellOverlay>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">{children}</p>
  )
}

function StapInhoud({
  overzicht,
  index,
  keuzeId,
  onKeuze,
  onAanpassen,
  bezig,
}: {
  overzicht: PlanReviewStapOverzicht
  index: number
  keuzeId: string | null
  onKeuze: (id: string) => void
  onAanpassen: (href: string) => void
  bezig: boolean
}) {
  return (
    <article className="space-y-5 text-sm leading-relaxed text-[var(--ink-2)]">
      <header>
        <Kicker>
          Stap {index + 1} van {PLAN_REVIEW_STAPPEN.length}
        </Kicker>
        <h4 className="mt-1 font-serif text-xl text-[var(--ink)]">{overzicht.titel}</h4>
      </header>

      {/* KEUZE */}
      <section aria-label="Waar de app nu mee rekent" className="space-y-2">
        <Kicker>Waar de app nu mee rekent</Kicker>
        <p className="text-[var(--ink)]">{overzicht.rekentNu}</p>
        {overzicht.details.length > 0 && (
          <dl className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
            {overzicht.details.map((d) => (
              <div key={d.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-xs text-[var(--ink-3)]">{d.label}</dt>
                <dd className="text-right font-mono text-xs tabular-nums text-[var(--ink)]">{d.waarde}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* EFFECT */}
      <section aria-label="Wat het doet" className="space-y-2">
        <Kicker>Wat het doet</Kicker>
        {overzicht.effect.map((zin) => (
          <p key={zin}>{zin}</p>
        ))}
        {overzicht.vergelijking.length > 0 && (
          <dl className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
            {overzicht.vergelijking.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-xs text-[var(--ink-3)]">{r.label}</dt>
                <dd className="text-right font-mono text-xs tabular-nums text-[var(--ink)]">{r.waarde}</dd>
              </div>
            ))}
          </dl>
        )}
        {overzicht.keuzes.length > 0 && (
          <fieldset className="space-y-2" disabled={bezig}>
            <legend className="mb-1 text-xs text-[var(--ink-3)]">
              {overzicht.keuzeVerplicht ? 'Kies waarmee de app rekent:' : 'De keuzes naast elkaar:'}
            </legend>
            {overzicht.keuzes.map((k) => (
              <label
                key={k.id}
                className={`flex cursor-pointer gap-3 border p-3 transition-colors ${
                  keuzeId === k.id
                    ? 'border-[var(--ink)] bg-[var(--subtle)]'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--ink-3)]'
                }`}
              >
                <input
                  type="radio"
                  name={`plan-review-${overzicht.stap}`}
                  value={k.id}
                  checked={keuzeId === k.id}
                  onChange={() => onKeuze(k.id)}
                  className="mt-1"
                />
                <span className="min-w-0 space-y-1">
                  <span className="block font-semibold text-[var(--ink)]">
                    {k.label}
                    {k.huidig && <span className="ml-2 text-[11px] font-normal text-[var(--ink-3)]">nu</span>}
                  </span>
                  <span className="block text-xs">{k.beschrijving}</span>
                  <span className="block font-mono text-xs tabular-nums text-[var(--ink)]">{k.uitkomst}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </section>

      {/* WAAROM */}
      <section aria-label="Waarom dit ertoe doet" className="space-y-2">
        <Kicker>Waarom dit ertoe doet</Kicker>
        <p>{overzicht.waarom}</p>
      </section>

      {overzicht.beperking && <p className="text-xs italic text-[var(--ink-3)]">{overzicht.beperking}</p>}
      {overzicht.blokkade && <p className="text-xs font-semibold text-[var(--ink)]">{overzicht.blokkade}</p>}

      {overzicht.aanpassen.length > 0 && (
        <div className="flex flex-wrap gap-x-4 border-t border-[var(--border-ed)] pt-1">
          {overzicht.aanpassen.map((a) => (
            <button
              key={a.href}
              type="button"
              onClick={() => onAanpassen(a.href)}
              disabled={bezig}
              className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--ink-2)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
            >
              {a.label} →
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

function VoorWieWil({ progress }: { progress: PlanReviewProgress }) {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-[var(--ink-2)]">
      <header>
        <Kicker>
          {progress.bevestigd} van {progress.totaal} stappen bevestigd
        </Kicker>
        <h4 className="mt-1 font-serif text-xl text-[var(--ink)]">Voor wie wil</h4>
      </header>
      <p>
        {progress.voltooid
          ? 'Je hebt alle keuzes van je plan nagelopen. '
          : 'Stappen die je oversloeg blijven open; je kunt ze later afmaken via de Voorkeuren-kaart. '}
        Wie verder wil kijken, vindt de aannames onder je plan op deze plekken. De review past ze niet aan.
      </p>
      <ul className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
        {PLAN_REVIEW_LAAG2.map((l) => (
          <li key={l.label} className="py-2">
            <Link href={l.href} className="font-semibold text-[var(--ink)] hover:underline">
              {l.label}
            </Link>
            <p className="text-xs text-[var(--ink-3)]">{l.uitleg}</p>
          </li>
        ))}
      </ul>
    </article>
  )
}
