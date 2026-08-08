'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { resolveRouteTitle } from '@/lib/nav-config'
import { MeldingTypeKiezer, type MeldingType } from './melding-type-kiezer'
import { MeldingForm, type MeldingFormWaarden } from './melding-form'

/**
 * Meldmodus van het chatvenster: bug, vraag of aanbeveling → één kaartje op de
 * werklijst.
 *
 * Bewust hier en niet op een aparte pagina: melden moet kunnen op het moment dat
 * je iets zíet, zonder je plek kwijt te raken. Daarom staat deze weergave ook
 * volledig BUITEN de AI-gates — een testgebruiker zonder AI-abonnement moet
 * kunnen melden, anders horen we juist van die groep niets.
 *
 * De technische context (pagina, routetitel, browser, viewport, app-versie)
 * verzamelen we hier automatisch; die vragen we nooit uit.
 */

type Stap = 'type' | 'formulier' | 'succes'

/** Wat de route als `payload`-JSON verwacht (multipart-veld `payload`). */
interface MeldingPayload {
  type: MeldingType
  screen?: string
  description: string
  expected?: string
  consent: boolean
  context: {
    pathname: string
    pageTitle: string | null
    userAgent: string
    viewport: string
    appVersion: string
  }
}

interface MeldingViewProps {
  onClose: () => void
  /**
   * Meldt aan de container dat er een verzending loopt. Nodig omdat de knoppen
   * die dit component kunnen wéghalen (megafoon-toggle, sluitkruis, mobiele
   * backdrop) in ChatPanel leven: zonder dit signaal unmount de melding
   * halverwege de fetch, ziet de gebruiker geen bevestiging en meldt hij
   * hetzelfde nog een keer — dubbel kaartje, twee van zijn vijf pogingen weg.
   *
   * Bewust géén AbortController: de POST kan server-side al geland zijn, dus
   * afbreken maakt het dubbele kaartje juist waarschijnlijker. Blokkeren is
   * hier het antwoord, niet annuleren.
   */
  onBezigChange?: (bezig: boolean) => void
}

export function MeldingView({ onClose, onBezigChange }: MeldingViewProps) {
  const pathname = usePathname()

  const [stap, setStap] = useState<Stap>('type')
  const [type, setType] = useState<MeldingType | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [appVersie, setAppVersie] = useState('onbekend')

  const stapRef = useRef<HTMLDivElement>(null)

  // App-versie: /api/version geeft { sha, env }. Lukt het niet, dan melden we
  // 'onbekend' — een melding mag daar nooit op stuklopen.
  useEffect(() => {
    let afgebroken = false
    fetch('/api/version')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { sha?: string } | null) => {
        if (afgebroken) return
        if (data && typeof data.sha === 'string' && data.sha) setAppVersie(data.sha)
      })
      .catch(() => {
        /* stil: 'onbekend' blijft staan */
      })
    return () => {
      afgebroken = true
    }
  }, [])

  // Focus verplaatst mee met de stap, zodat toetsenbord- en schermlezergebruikers
  // niet achterblijven bij de vorige stap.
  useEffect(() => {
    stapRef.current?.focus()
  }, [stap])

  // Verzendstatus doorgeven aan de container (zie MeldingViewProps). De cleanup
  // geeft 'm vrij zodra de verzending klaar is én bij een onverhoopte unmount,
  // zodat het paneel nooit permanent op slot komt te staan.
  useEffect(() => {
    onBezigChange?.(bezig)
    return () => {
      if (bezig) onBezigChange?.(false)
    }
  }, [bezig, onBezigChange])

  const routeTitel = resolveRouteTitle(pathname)
  const standaardScherm = routeTitel ?? pathname

  const kiesType = useCallback((gekozen: MeldingType) => {
    setFout(null)
    setType(gekozen)
    setStap('formulier')
  }, [])

  const terugNaarTypekeuze = useCallback(() => {
    setFout(null)
    setType(null)
    setStap('type')
  }, [])

  const verstuur = useCallback(
    async (waarden: MeldingFormWaarden) => {
      if (!type || bezig) return
      setBezig(true)
      setFout(null)

      const payload: MeldingPayload = {
        type,
        description: waarden.description,
        consent: waarden.consent,
        context: {
          pathname,
          pageTitle: routeTitel,
          userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
          viewport:
            typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}`,
          appVersion: appVersie,
        },
      }
      if (waarden.screen) payload.screen = waarden.screen
      if (waarden.expected) payload.expected = waarden.expected

      const formData = new FormData()
      formData.append('payload', JSON.stringify(payload))
      if (waarden.screenshot) formData.append('screenshot', waarden.screenshot)

      try {
        const res = await fetch('/api/user-reports', { method: 'POST', body: formData })
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) {
          const melding =
            data && typeof (data as { error?: unknown }).error === 'string'
              ? ((data as { error: string }).error)
              : 'Versturen is niet gelukt. Probeer het zo nog een keer.'
          setFout(melding)
          return
        }
        setStap('succes')
      } catch {
        setFout('We konden je melding niet versturen. Controleer je verbinding en probeer het opnieuw.')
      } finally {
        setBezig(false)
      }
    },
    [type, bezig, pathname, routeTitel, appVersie],
  )

  return (
    <div
      ref={stapRef}
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col outline-none"
      data-testid="melding-view"
    >
      {/* Permanent gemounte live-regio (meldingen-conventie): een aria-live-regio
          die pas mét zijn inhoud in de DOM verschijnt wordt door schermlezers
          meestal niet aangekondigd. Alleen het kind wisselt — dát is de trigger.
          Kort gehouden, want de zichtbare bevestiging volgt hieronder. */}
      <div aria-live="polite" className="sr-only">
        {stap === 'succes' ? 'Je melding is verstuurd en staat op onze werklijst.' : ''}
      </div>

      {/* ── Stap 1: welk soort melding? ── */}
      {stap === 'type' && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <p className="flex items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
              <span
                className="mr-2.5 inline-block h-px w-7 bg-wil-500 align-middle"
                aria-hidden="true"
              />
              Melding
            </p>
            <h2 className="mt-2 font-display text-[20px] leading-tight text-[var(--ink)]">
              Wat wil je{' '}
              <em className="font-serif font-normal italic text-wil-700">melden</em>?
            </h2>
            <p className="mt-2 border-l-2 border-wil-500 pl-3 font-serif text-[13px] italic leading-relaxed text-[var(--ink-2)]">
              Je zit in de testperiode. Wat je hier meldt komt rechtstreeks op onze werklijst.
            </p>

            <div className="mt-4">
              <MeldingTypeKiezer onKies={kiesType} />
            </div>
          </div>

          <div
            className="border-t border-[var(--border-ed)] px-4 pt-3"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Terug naar de chat
            </button>
          </div>
        </>
      )}

      {/* ── Stap 2: het formulier ── */}
      {stap === 'formulier' && type && (
        <MeldingForm
          type={type}
          standaardScherm={standaardScherm}
          onTerug={terugNaarTypekeuze}
          onVerstuur={verstuur}
          bezig={bezig}
          foutmelding={fout}
        />
      )}

      {/* ── Stap 3: bevestiging ── */}
      {stap === 'succes' && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
            <span className="flex h-10 w-10 items-center justify-center border border-wil-200 bg-wil-50 text-wil-700">
              <Check className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-3 font-display text-[20px] leading-tight text-[var(--ink)]">
              Bedankt, we hebben je melding{' '}
              <em className="font-serif font-normal italic text-wil-700">ontvangen</em>
            </h2>
            <p className="mt-2 border-l-2 border-wil-500 pl-3 font-serif text-[13px] italic leading-relaxed text-[var(--ink-2)]">
              Je melding staat nu op onze werklijst.
            </p>

            <div className="mt-4 border-t border-[var(--border-ed)] pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                Wat er nu gebeurt
              </p>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
                <li className="flex items-start gap-2">
                  <span
                    className="mt-[7px] block h-1 w-1 shrink-0 bg-wil-500"
                    aria-hidden="true"
                  />
                  We lezen elke melding zelf en bepalen wat er als eerste opgepakt wordt.
                </li>
                <li className="flex items-start gap-2">
                  <span
                    className="mt-[7px] block h-1 w-1 shrink-0 bg-wil-500"
                    aria-hidden="true"
                  />
                  Bugs gaan naar de reparatielijst, vragen krijgen een antwoord en wensen wegen
                  mee in wat we bouwen.
                </li>
                <li className="flex items-start gap-2">
                  <span
                    className="mt-[7px] block h-1 w-1 shrink-0 bg-wil-500"
                    aria-hidden="true"
                  />
                  Je hoeft verder niets te doen. Kom je nog iets tegen? Meld het gerust
                  opnieuw.
                </li>
              </ul>
            </div>
          </div>

          <div
            className="border-t border-[var(--border-ed)] px-4 pt-3"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={terugNaarTypekeuze}
                className="flex-1 bg-wil-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500 active:scale-[0.99]"
              >
                Nog een melding
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border border-[var(--border-ed)] px-3 py-2.5 text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500"
              >
                Terug naar de chat
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
