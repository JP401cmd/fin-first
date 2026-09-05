'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Compass, Lock } from 'lucide-react'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { GuideScreenView } from '@/components/overview/guide-screen-view'
import { getVisibleScreens, hasMoreScreens } from '@/lib/welcome-guide'
import {
  RONDLEIDING_COACHMARK_ID,
  RONDLEIDING_QUERY_PARAM,
  RONDLEIDING_ROUTE,
  requestRondleiding,
} from '@/lib/rondleiding/signal'
import { useChatContext } from '../chat-provider'
import { useWelcomeGuide } from './welcome-guide-provider'

/**
 * GidsView — de welkomstgids ín Fin (ADR 0130).
 *
 * De gids stond tot dat besluit als banner op /overzicht, met een geminimaliseerd
 * punt naast de pagina-'i'. Twee bezwaren van de eigenaar: de takenlijst was het
 * dominantste blok op het hoofdscherm, en hij had twee vormen op één pagina.
 * Sinds dit besluit heeft hij één thuis: een vierde icoon in de chat-kop, naast
 * de megafoon — dezelfde vorm als de meldmodus, en dus ook bewust BUITEN alle
 * AI-gates: de gids hoort te werken zonder AI-abonnement.
 *
 * Wat dat betekent voor de vorm:
 *  - Geen sluitkruis en geen "inklappen": de chat-kop draagt die knoppen al.
 *  - Geen "Scherm N van M"-teller — de stippen dragen de positie, en de kop
 *    zegt al "Welkomstgids · N open".
 *  - Altijd de COMPACTE stapweergave. Het paneel is 480px breed; de
 *    proces-layout van scherm 1 legt zijn kaarten op `lg:` naast elkaar en zou
 *    daar op vier smalle kolommen uitkomen. Dit is dus geen weergavemodus-keuze
 *    maar een ruimte-feit — de APP-2-regel over de weergavekeuze staat er
 *    daarom nog steeds onder, en volgt wél de echte modus.
 *  - Een stap-link navigeert: dan sluit de chat, tenzij hij gepind is (dan is
 *    hij een zijbalk naast de pagina en hoort hij te blijven staan).
 *
 * Toegankelijkheid: de kop van het chatpaneel draagt de titel, dus dit component
 * begint bij `h3` — dat is de kop die `GuideScreenView` per scherm rendert.
 */
export function GidsView() {
  const { data, display, mutate, refresh, dismissForever, reactivate } = useWelcomeGuide()
  const { close, isPinned } = useChatContext()
  // SINGLE SOURCE OF TRUTH voor de weergavemodus — stuurt alleen de APP-2-zin
  // hieronder, nooit de data.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // Bij openen één verse GET: de seed is zo oud als de laatste harde
  // shell-render, en juist in de gids zie je stappen die je net hebt afgerond.
  useEffect(() => {
    refresh()
  }, [refresh])

  // Een stap-link navigeert weg — dan hoort het modale paneel dicht. Gepind is
  // het een gedokte zijbalk naast de pagina: die blijft staan.
  const handleNavigate = () => {
    if (!isPinned) close()
  }

  if (display === 'dismissed') {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="gids-view">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <GidsKicker>Welkomstgids</GidsKicker>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
            Je hebt de gids afgesloten.
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-3)]">
            Wil je de gids er toch weer bij, dan pak ik de draad op waar je gebleven was.
          </p>
          <button
            type="button"
            onClick={reactivate}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 bg-wil-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500 active:scale-[0.99]"
          >
            Gids opnieuw tonen
          </button>
        </div>
      </div>
    )
  }

  if (display !== 'available' || !data) return null

  const { config, state, derived } = data
  const visible = getVisibleScreens(config, state)
  if (visible.length === 0) return null

  const totalEnabled = config.screens.filter((s) => s.enabled).length
  const idx = Math.min(state.currentScreen, visible.length - 1)
  const screen = visible[idx]
  const isLast = idx === visible.length - 1
  const canReveal = hasMoreScreens(config, state)

  // ── Acties (optimistisch via `mutate`; de route echoot de nieuwe staat) ──
  const toggle = (stepId: string) =>
    mutate({ action: 'toggleStep', stepId }, (s) => {
      const ids = s.completedStepIds.includes(stepId)
        ? s.completedStepIds.filter((i) => i !== stepId)
        : [...s.completedStepIds, stepId]
      return { ...s, completedStepIds: ids }
    })

  const goNext = () =>
    mutate({ action: 'nextScreen' }, (s) => ({
      ...s,
      currentScreen: Math.min(s.currentScreen + 1, visible.length - 1),
    }))

  const goPrev = () =>
    mutate({ action: 'prevScreen' }, (s) => ({
      ...s,
      currentScreen: Math.max(0, s.currentScreen - 1),
    }))

  const reveal = () =>
    mutate({ action: 'revealScreen' }, (s) => ({
      ...s,
      revealedScreens: s.revealedScreens + 1,
      currentScreen: visible.length, // nieuw ontgrendeld scherm
    }))

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="gids-view">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <GidsKicker>{config.kicker}</GidsKicker>
          <ScreenDots
            total={totalEnabled}
            revealedCount={visible.length}
            activeIndex={idx}
            canReveal={canReveal}
          />
        </div>

        <div className="mt-3">
          <GuideScreenView
            screen={screen}
            completedStepIds={state.completedStepIds}
            derived={derived}
            onToggle={toggle}
            compact
            onNavigate={handleNavigate}
          />
        </div>

        <RondleidingKnop />
      </div>

      <div
        className="border-t border-[var(--border-ed)] px-4 pt-3"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={idx === 0}
            className="inline-flex min-h-[44px] items-center gap-1.5 px-2.5 py-2 text-[13px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500 disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Vorige
          </button>

          {!isLast ? (
            <PrimaryButton onClick={goNext}>
              Volgend scherm
              <ArrowRight className="h-4 w-4" aria-hidden />
            </PrimaryButton>
          ) : canReveal ? (
            <PrimaryButton onClick={reveal}>
              Volgend scherm ontgrendelen
              <ArrowRight className="h-4 w-4" aria-hidden />
            </PrimaryButton>
          ) : null}
        </div>

        {/* APP-2 — de enige plek waar de app zelf vertelt dát er een
            weergavekeuze is. Eén regel, in beide modi, met de tegenovergestelde
            stand als aanbod. Verhuisde met de gids mee vanuit de banner; de
            keuze uit ADR 0026 (géén per-sectie-hint op de pagina's) blijft. */}
        <p className="mt-2 text-[11px] leading-snug text-[var(--ink-4)]">
          {simple
            ? 'Je kijkt in de eenvoudige weergave. Meer detail zet je aan bij '
            : 'Je kijkt in de volledige weergave. Rustiger kan bij '}
          <Link
            href="/mijn/uiterlijk"
            onClick={handleNavigate}
            className="font-semibold text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline"
          >
            Mijn → Weergave en uiterlijk
          </Link>
          .
        </p>

        {/* Klaar met de gids — de aparte, secundaire uitgang (L11). Geen
            tussenvraag; er is een weg terug ("Gids opnieuw tonen") en die staat
            in de lege staat van deze weergave. */}
        <div className="mt-1">
          <button
            type="button"
            onClick={dismissForever}
            // Tekstueel klein (secundaire uitgang), maar met een volwaardig
            // raakvlak: de tekstregel zelf is ~16px hoog en dat is onder de
            // 44px-raakdrempel van de ui-ux-toets.
            className="inline-flex min-h-[44px] items-center text-[11px] font-semibold leading-snug text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500"
          >
            Ik ben klaar met de gids
          </button>
          <p className="text-[11px] leading-snug text-[var(--ink-4)]">
            Fin herinnert je dan niet meer aan volgende stappen.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Bouwstenen ──────────────────────────────────────────────────────────────

/**
 * De ingang naar de interactieve rondleiding op /overzicht (ADR 0130).
 *
 * ── Waarom hier ─────────────────────────────────────────────────────────────
 * De gids en de rondleiding beantwoorden dezelfde vraag ("waar begin ik?") in
 * twee vormen: een checklist en een wandeling. Ze horen dus in hetzelfde huis.
 * De tweede ingang is de pagina-`i` op /overzicht zelf.
 *
 * ── Het label volgt de afloop ───────────────────────────────────────────────
 * `GET /api/coachmark` zegt of de rondleiding al eens liep en hóé hij eindigde.
 * Iemand die 'm halverwege onderbrak, krijgt "Rondleiding afmaken" — dat is een
 * andere belofte dan "opnieuw", en precies waarom de PUT een `outcome` draagt.
 * Eén GET, en alleen wanneer deze weergave daadwerkelijk opent (een bewuste
 * klik op het vierde icoon); mislukt hij, dan blijft het neutrale startlabel
 * staan in plaats van dat de knop verdwijnt.
 *
 * ── Navigatie ───────────────────────────────────────────────────────────────
 * Sta je al op /overzicht, dan volstaat het module-signaal (geen navigatie, geen
 * herladen). Sta je elders, dan is `?rondleiding=start` nodig: de provider leeft
 * op die route en moet het verzoek ná de navigatie nog kunnen lezen — een
 * module-signaal overleeft de route-wissel niet.
 */
function RondleidingKnop() {
  const { close } = useChatContext()
  const router = useRouter()
  const pathname = usePathname()
  const [outcome, setOutcome] = useState<'onbekend' | 'nieuw' | 'onderbroken' | 'gezien'>(
    'onbekend',
  )

  useEffect(() => {
    let afgebroken = false
    ;(async () => {
      try {
        const res = await fetch('/api/coachmark')
        if (!res.ok) return
        const data = (await res.json()) as {
          dismissed?: Record<string, boolean>
          outcome?: Record<string, string | null>
        }
        if (afgebroken) return
        const gezien = data.dismissed?.[RONDLEIDING_COACHMARK_ID] === true
        if (!gezien) setOutcome('nieuw')
        else if (data.outcome?.[RONDLEIDING_COACHMARK_ID] === 'onderbroken') {
          setOutcome('onderbroken')
        } else setOutcome('gezien')
      } catch {
        /* label blijft neutraal */
      }
    })()
    return () => {
      afgebroken = true
    }
  }, [])

  const label =
    outcome === 'onderbroken'
      ? 'Rondleiding afmaken'
      : outcome === 'gezien'
        ? 'Rondleiding opnieuw'
        : 'Start de rondleiding'

  const start = () => {
    if (pathname === RONDLEIDING_ROUTE) {
      requestRondleiding()
    } else {
      router.push(`${RONDLEIDING_ROUTE}?${RONDLEIDING_QUERY_PARAM}=start`)
    }
    // Ook gepind gaat het paneel dicht — anders dekt de gedokte zijbalk precies
    // de zijbalk-stap af die de rondleiding wil uitlichten.
    close()
  }

  return (
    <div className="mt-4 border-t border-[var(--border-ed)] pt-3">
      <GidsKicker>Rondleiding</GidsKicker>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
        Ik loop in twee minuten met je langs je overzicht en vertel wat je cijfers
        betekenen.
      </p>
      <button
        type="button"
        onClick={start}
        className="mt-2.5 inline-flex min-h-[44px] items-center gap-1.5 border border-[var(--border-md)] px-3.5 py-2 text-[13px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500"
      >
        <Compass className="h-4 w-4" aria-hidden />
        {label}
      </button>
    </div>
  )
}

/**
 * De kicker van het chatpaneel: hairline + label in het Wil-accent. Bewust niet
 * de gedeelde `<Kicker>` uit components/editorial — die volgt
 * `--module-active-*` (de route), terwijl dit paneel altijd Fin is en dus altijd
 * Wil. Spiegelt `MeldingView`.
 */
function GidsKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
      <span className="mr-2.5 inline-block h-px w-7 bg-wil-500 align-middle" aria-hidden="true" />
      {children}
    </p>
  )
}

/**
 * Scherm-stippen: één stip per ingeschakeld scherm, de actieve als streepje,
 * nog-niet-ontgrendelde schermen lichter, met een slotje als er nog schermen
 * achter zitten. Draagt hier in z'n eentje de positie-informatie — de "Scherm N
 * van M"-teller uit de oude banner is vervallen.
 */
function ScreenDots({
  total,
  revealedCount,
  activeIndex,
  canReveal,
}: {
  total: number
  revealedCount: number
  activeIndex: number
  canReveal: boolean
}) {
  return (
    <span className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const revealed = i < revealedCount
        const active = i === activeIndex
        return (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              active
                ? 'w-6 bg-wil-600'
                : revealed
                  ? 'w-1.5 bg-[var(--border-md)]'
                  : 'w-1.5 bg-[var(--border-ed)]'
            }`}
            aria-hidden
          />
        )
      })}
      {canReveal && <Lock className="ml-1 h-3 w-3 text-[var(--ink-4)]" aria-hidden />}
    </span>
  )
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-1.5 bg-wil-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-wil-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500 active:scale-[0.99]"
    >
      {children}
    </button>
  )
}
