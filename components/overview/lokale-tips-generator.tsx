'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, ShieldOff, Check } from 'lucide-react'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import { generateLocalTips, type LocalTipsProgress } from '@/lib/ai/local/local-tips-resolver'
import type { LocalTipCandidate, LocalTipCandidates } from '@/lib/ai/local/local-tips-context'
import type { ResolvedLocalTip } from '@/lib/ai/local/parse-tip'

/**
 * LokaleTipsGenerator — de naad waar de gebruiker on-device tips laat maken.
 *
 * Staat op /overzicht/tips náást `TipsLijst`. Alleen zichtbaar wanneer de groep
 * 'tips' op 'lokaal' staat; in cloud-modus rendert dit component NIETS en blijft
 * de bestaande "Vraag Fin om tips"-CTA (die de chat opent) de weg.
 *
 * FAIL-CLOSED (de kern, `useExecutionMode`): er wordt alléén gegenereerd bij
 * status 'lokaal'. Bij 'resolving' weten we de voorkeur nog niet en tonen we
 * niets — een knop die in dat venster al iets zou starten is precies het lek dat
 * de hook moet dichten. Bij 'blocked' (lokaal gewenst, maar dit toestel kan het
 * niet) tonen we de eerlijke reden en is er GEEN uitwijk naar de cloud.
 *
 * NOOIT BLOKKEREND: bij ~9-12 tok/s duurt een ronde van drie tips ~60-75 s. Er
 * komt dus geen modal overheen; de tips verschijnen één voor één in deze sectie
 * (`onTip`) en worden per stuk opgeslagen, zodat wegnavigeren midden in een ronde
 * niet alles weggooit.
 */
interface LokaleTipsGeneratorProps {
  /** Wordt aangeroepen als er ten minste één tip is opgeslagen, zodat de parent ververst. */
  onGenerated?: () => void
}

type Fase = 'idle' | 'laden' | 'genereren' | 'klaar' | 'fout'

/** Eén regel per opgeslagen tip — bewust minimaal; de echte kaart komt van TipsLijst. */
interface ToonTip {
  candidateId: string
  title: string
}

export function LokaleTipsGenerator({ onGenerated }: LokaleTipsGeneratorProps) {
  const mode = useExecutionMode('tips')
  const [fase, setFase] = useState<Fase>('idle')
  const [voortgang, setVoortgang] = useState<LocalTipsProgress | null>(null)
  const [gemaakt, setGemaakt] = useState<ToonTip[]>([])
  const [foutmelding, setFoutmelding] = useState<string | null>(null)
  /**
   * Hoeveel kansen deze ronde werden aangeboden. Nodig om "er wáren geen kansen"
   * te onderscheiden van "er waren kansen, maar er kwam niets doorheen" — die
   * twee voelen voor de gebruiker totaal verschillend, zeker na een minuut wachten.
   */
  const [kandidatenAantal, setKandidatenAantal] = useState(0)

  // Afbreken bij unmount: een halve ronde mag geen generatie op de achtergrond
  // laten doorlopen op een pagina die de gebruiker verlaten heeft.
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  /** Sla één tip meteen op. Faalt dat, dan is die ene tip weg — de ronde loopt door. */
  const bewaarTip = useCallback(async (tip: ResolvedLocalTip): Promise<boolean> => {
    try {
      const res = await fetch('/api/local-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // BEWUST alleen tekst: de server leidt élk bedrag zelf af uit de
          // canonieke kandidaat (zie app/api/local-tips/route.ts).
          tips: [
            {
              candidateId: tip.candidateId,
              title: tip.title,
              description: tip.description,
              actions: tip.actions,
            },
          ],
        }),
      })
      if (!res.ok) return false
      // 200 betekent NIET automatisch "opgeslagen": de route slaat een kans
      // fail-closed over wanneer die tussen ophalen en opslaan uit de canonieke
      // lijst verdween, en antwoordt dan met een lege `recommendations`. Een
      // groen vinkje zetten op zo'n antwoord zou succes melden voor een kaart die
      // nooit verschijnt.
      const data = (await res.json()) as { recommendations?: unknown[] }
      return (data.recommendations?.length ?? 0) > 0
    } catch {
      return false
    }
  }, [])

  const start = useCallback(async () => {
    // Harde poort: alleen het lokale pad mag hier iets starten.
    if (!mode.canUseLocal) return

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    setFase('laden')
    setFoutmelding(null)
    setGemaakt([])
    setVoortgang(null)
    setKandidatenAantal(0)

    let candidates: LocalTipCandidate[]
    try {
      const res = await fetch('/api/local-tips-candidates', { cache: 'no-store' })
      if (!res.ok) {
        // 403 = kill-switch uit of abonnement weg; die reden verdient een eerlijk
        // eigen antwoord, net als de rest van het lokale pad.
        setFase('fout')
        setFoutmelding(
          res.status === 403
            ? 'Tips maken is nu niet beschikbaar voor je account.'
            : 'Je financiële gegevens konden niet worden opgehaald. Probeer het zo opnieuw.',
        )
        return
      }
      const data = (await res.json()) as LocalTipCandidates
      candidates = data.candidates ?? []
    } catch {
      setFase('fout')
      setFoutmelding('Je financiële gegevens konden niet worden opgehaald. Probeer het zo opnieuw.')
      return
    }

    setKandidatenAantal(candidates.length)
    if (candidates.length === 0) {
      setFase('klaar')
      return
    }

    setFase('genereren')
    let bewaard = 0
    try {
      await generateLocalTips(candidates, {
        signal: controller.signal,
        onProgress: (p) => setVoortgang(p),
        onTip: async (tip) => {
          const ok = await bewaarTip(tip)
          if (!ok) return
          bewaard++
          setGemaakt((prev) => [...prev, { candidateId: tip.candidateId, title: tip.title }])
        },
      })
    } catch (err) {
      console.error('[lokale-ai] tips-ronde afgebroken:', err)
      setFase('fout')
      setFoutmelding('Het maken van de tips is onderbroken. Probeer het opnieuw.')
      if (bewaard > 0) onGenerated?.()
      return
    }

    if (controller.signal.aborted) return
    setVoortgang(null)
    setFase('klaar')
    if (bewaard > 0) onGenerated?.()
  }, [mode.canUseLocal, bewaarTip, onGenerated])

  /** Stoppen: de lopende tip loopt nog af, daarna stopt de ronde. */
  const stop = useCallback(() => {
    abortRef.current?.abort()
    setVoortgang(null)
    setFase('klaar')
  }, [])

  // 'resolving' → we weten de bestemming nog niet: niets tonen, niets starten.
  // 'cloud' → de bestaande cloud-CTA in TipsLijst doet het werk.
  if (mode.status === 'resolving' || mode.status === 'cloud') return null

  if (mode.status === 'blocked') {
    return (
      <section
        aria-label="Tips op dit apparaat"
        className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4"
      >
        <div className="flex items-start gap-2">
          <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="font-serif text-base text-[var(--ink)]">Tips maken kan hier niet</h3>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              {mode.message ??
                'Je hebt gekozen om tips op je eigen apparaat te maken, maar dat lukt hier niet.'}
            </p>
          </div>
        </div>
      </section>
    )
  }

  const bezig = fase === 'laden' || fase === 'genereren'

  return (
    <section
      aria-label="Tips op dit apparaat"
      className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
            Tips maken op dit apparaat
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Fin rekent je kansen door en verwoordt ze hier — je gegevens blijven op je eigen apparaat.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void start()}
            disabled={bezig}
            className="inline-flex items-center gap-1.5 rounded-lg bg-wil-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bezig ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {bezig ? 'Bezig…' : 'Maak tips'}
          </button>
          {/* Een ronde duurt ~60-75 s. Zonder stopknop is wegnavigeren de enige
              uitweg — dat is geen keuze, dat is ontsnappen. */}
          {bezig && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              Stoppen
            </button>
          )}
        </div>
      </div>

      {/* Altijd gemount zodat schermlezers elke voortgangsstap horen. */}
      <div aria-live="polite" className="mt-3 space-y-1.5">
        {fase === 'laden' && (
          <p className="text-xs text-[var(--ink-3)]">Je kansen worden doorgerekend…</p>
        )}
        {fase === 'genereren' && voortgang && (
          <p className="text-xs text-[var(--ink-3)]">
            Tip {voortgang.huidige} van {voortgang.totaal} — {voortgang.titel}
          </p>
        )}
        {gemaakt.map((t) => (
          <p key={t.candidateId} className="flex items-start gap-1.5 text-xs text-[var(--ink-2)]">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-wil-600" aria-hidden="true" />
            <span className="min-w-0">{t.title}</span>
          </p>
        ))}
        {fase === 'klaar' && gemaakt.length === 0 && kandidatenAantal === 0 && (
          <p className="text-xs text-[var(--ink-3)]">
            Er zijn nu geen nieuwe kansen om over te tippen. Voeg gegevens toe of kom later terug.
          </p>
        )}
        {fase === 'klaar' && gemaakt.length === 0 && kandidatenAantal > 0 && (
          // Er wáren kansen — er kwam alleen geen bruikbare tekst uit (alles
          // fail-closed afgekeurd, of het opslaan lukte niet). Dat eerlijk
          // benoemen; "geen kansen" zou hier het tegenovergestelde beweren.
          <p className="text-xs text-negative">
            Er kwam deze keer geen bruikbare tip uit. Probeer het opnieuw.
          </p>
        )}
        {fase === 'fout' && foutmelding && (
          <p className="text-xs text-negative">{foutmelding}</p>
        )}
      </div>
    </section>
  )
}
