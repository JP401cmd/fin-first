'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FinDots } from '@/components/app/fin-dots'
import {
  RONDLEIDING_HOOFDSTUK_LABEL,
  RONDLEIDING_KICKER_DEFAULT,
  RONDLEIDING_KNOP,
  type RondleidingHoofdstuk,
  type RondleidingPlatform,
  type RondleidingStap,
  type RondleidingStapBody,
} from '@/lib/rondleiding/steps'
import type { SpotlightRect } from './use-spotlight-rect'

/**
 * RondleidingKaart — Fins spreekwolk (ADR 0130, fase 3b).
 *
 * ══ Waarom dit géén gewone tooltip is ═════════════════════════════════════
 *
 * De rondleiding heeft één verteller: Fin. De kaart draagt daarom zijn avatar
 * (`FinDots`, `talking` bij binnenkomst → `listening`) en dezelfde visuele taal
 * als zijn proactieve melding (`components/app/fin/coach-melding.tsx`,
 * `.wh-melding-card`): paper, hairline-rand, platen-kop met een label in
 * kleinkapitaal, stippellijn boven de acties. Wie de tour doorloopt en later
 * een tip van Fin krijgt, herkent dezelfde stem in dezelfde vorm.
 *
 * Eén ding komt erbij: een `border-left` van 4px in het route-accent
 * (`--color-kern-500`, /overzicht = Kern). Dat is module-identiteit, dus een
 * token — nooit een Tailwind-standaardkleur.
 *
 * ══ Positionering ═════════════════════════════════════════════════════════
 *
 *  - **Desktop**: popover bij het gat, in de volgorde onder → boven → rechts,
 *    met 16px viewport-marge. De zijbalk-stap gaat altijd naar rechts: onder of
 *    boven een kolom van volle schermhoogte bestaat geen ruimte.
 *  - **Mobiel**: een vaste kaart onderin, want een popover van 22rem naast een
 *    element van 45% schermbreedte past nergens. Ligt het gat zelf in de onderste
 *    40% (de nav-pill-stap), dan verhuist de kaart naar bóven — anders dekt hij
 *    precies af wat hij uitlicht.
 *
 * ══ Afscheid ═════════════════════════════════════════════════════════════
 *
 * Bij `voltooid` glijdt de kaart naar Fins eigen knop en vervaagt: de verteller
 * gaat naar huis, en je ziet wáár hij woont. Motion-safe; bij
 * `prefers-reduced-motion` slaat de provider deze fase over.
 */

/** Stabiele ids zodat de overlay-dialoog ernaar kan wijzen. */
export const RONDLEIDING_TITEL_ID = 'rondleiding-kaart-titel'
export const RONDLEIDING_BODY_ID = 'rondleiding-kaart-body'

/** Breedte van de desktop-popover. */
const KAART_BREEDTE = 352
/** Marge tot de viewport-rand en tot het gat. */
const MARGE = 16
const GAT_AFSTAND = 12
/** Hoe lang de avatar "praat" na een stapwissel. */
const TALKING_MS = 600

const HOOFDSTUK_VOLGORDE: readonly RondleidingHoofdstuk[] = ['hefbomen', 'stand', 'gereedschap']

type Positie =
  | { top: number; left: number; width: number }
  /** Vaste kaart tegen de onder- of bovenrand, met `zij` px marge links en rechts. */
  | { onderin: boolean; zij: number }

function isVast(p: Positie): p is { onderin: boolean; zij: number } {
  return 'onderin' in p
}

/**
 * Maximale breedte van de vaste kaart. Zonder deze grens rekt hij op een breed
 * "mobiel" venster (768–1023px, tablet-staand) uit tot een strook van bijna een
 * meter tekst — één regel van rand tot rand leest slecht en oogt als een
 * cookiebalk, niet als Fin die iets vertelt.
 */
const VASTE_KAART_MAX = 560

/**
 * Waar de popover komt te staan. Pure functie zodat de plaatsingsregel te lezen
 * (en te herzien) is zonder door de JSX te hoeven.
 */
function berekenPositie(
  rect: SpotlightRect | null,
  maat: { w: number; h: number },
  platform: RondleidingPlatform,
  altijdRechts: boolean,
): Positie {
  if (typeof window === 'undefined') return { onderin: true, zij: 12 }
  const vw = window.innerWidth
  const vh = window.innerHeight

  const breedte = Math.min(KAART_BREEDTE, vw - 2 * MARGE)
  const zij = Math.max(12, (vw - Math.min(VASTE_KAART_MAX, vw - 24)) / 2)

  if (!rect) {
    // Geen gat = de welkomstkaart, één vol scrim-paneel. Op desktop staat hij
    // dan GECENTREERD: een volle-breedte strook onderin leest daar als een
    // cookiebalk, niet als het begin van een gesprek. Op mobiel is de vaste
    // kaart onderin juist de natuurlijke plek (duimbereik).
    if (platform === 'desktop') {
      return {
        top: Math.max(MARGE, vh / 2 - maat.h / 2),
        left: Math.max(MARGE, vw / 2 - breedte / 2),
        width: breedte,
      }
    }
    return { onderin: true, zij }
  }

  if (platform === 'mobiel') {
    // Vaste kaart: een popover van 22rem naast een element van bijna
    // schermbreedte past nergens. Onderin, tenzij het gat daar zelf ligt (de
    // nav-pill-stap) — anders dekt de kaart af wat hij uitlicht.
    return { onderin: !(rect.top > vh * 0.6), zij }
  }
  const midden = rect.left + rect.width / 2
  const left = Math.min(Math.max(MARGE, midden - breedte / 2), vw - breedte - MARGE)

  const onder = rect.top + rect.height + GAT_AFSTAND
  const boven = rect.top - GAT_AFSTAND - maat.h

  if (!altijdRechts && onder + maat.h <= vh - MARGE) return { top: onder, left, width: breedte }
  if (!altijdRechts && boven >= MARGE) return { top: boven, left, width: breedte }

  // Rechts naast het gat, verticaal gecentreerd en geklemd binnen de viewport.
  const rechtsLeft = Math.min(rect.left + rect.width + GAT_AFSTAND, vw - breedte - MARGE)
  const rechtsTop = Math.min(
    Math.max(MARGE, rect.top + rect.height / 2 - maat.h / 2),
    Math.max(MARGE, vh - maat.h - MARGE),
  )
  return { top: rechtsTop, left: Math.max(MARGE, rechtsLeft), width: breedte }
}

export function RondleidingKaart({
  stap,
  body,
  index,
  totaal,
  rect,
  platform,
  afscheid,
  onVorige,
  onVolgende,
  onOverslaan,
  onEersteStap,
  onRondkijken,
  onStart,
  kaartRef,
}: {
  stap: RondleidingStap
  body: RondleidingStapBody
  /** 0-based positie in de stappenlijst van dit platform. */
  index: number
  totaal: number
  rect: SpotlightRect | null
  platform: RondleidingPlatform
  /** Slotanimatie: de kaart glijdt naar Fins knop en vervaagt. */
  afscheid: boolean
  onVorige: () => void
  onVolgende: () => void
  onOverslaan: () => void
  onEersteStap: () => void
  onRondkijken: () => void
  onStart: () => void
  /** Voor de focus-trap in de overlay. */
  kaartRef: React.RefObject<HTMLDivElement | null>
}) {
  const isWelkom = stap.id === 'welkom'
  const isLaatste = index === totaal - 1
  const kicker = body.kicker
    ?? (stap.hoofdstuk ? RONDLEIDING_HOOFDSTUK_LABEL[stap.hoofdstuk] : RONDLEIDING_KICKER_DEFAULT)

  // ── Avatar: praat bij binnenkomst, luistert daarna ────────────────────────
  const [avatar, setAvatar] = useState<'talking' | 'listening'>('listening')
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setAvatar('listening')
      return
    }
    setAvatar('talking')
    const t = setTimeout(() => setAvatar('listening'), TALKING_MS)
    return () => clearTimeout(t)
  }, [stap.id])

  // ── Maat meten → positie berekenen ───────────────────────────────────────
  const [maat, setMaat] = useState({ w: KAART_BREEDTE, h: 220 })
  useLayoutEffect(() => {
    const el = kaartRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    setMaat((vorige) =>
      Math.abs(vorige.w - r.width) < 1 && Math.abs(vorige.h - r.height) < 1
        ? vorige
        : { w: r.width, h: r.height },
    )
  })

  const positie = useMemo(
    () => berekenPositie(rect, maat, platform, stap.id === 'zijbalk'),
    [rect, maat, platform, stap.id],
  )

  // ── Afscheid: verplaatsing richting Fins knop ─────────────────────────────
  const [verschuiving, setVerschuiving] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!afscheid) {
      setVerschuiving(null)
      return
    }
    const doel = document.querySelector('[data-tour="fin"], [data-mobile-floating-nav]')
    const kaart = kaartRef.current
    if (!doel || !kaart) {
      setVerschuiving({ x: 0, y: 0 })
      return
    }
    const d = doel.getBoundingClientRect()
    const k = kaart.getBoundingClientRect()
    setVerschuiving({
      x: d.left + d.width / 2 - (k.left + k.width / 2),
      y: d.top + d.height / 2 - (k.top + k.height / 2),
    })
  }, [afscheid, kaartRef])

  const stijl: React.CSSProperties = isVast(positie)
    ? {
        position: 'fixed',
        left: positie.zij,
        right: positie.zij,
        ...(positie.onderin
          ? { bottom: 'max(12px, env(safe-area-inset-bottom))' }
          : { top: 'max(12px, env(safe-area-inset-top))' }),
      }
    : { position: 'fixed', top: positie.top, left: positie.left, width: positie.width }

  if (verschuiving) {
    stijl.transform = `translate(${verschuiving.x}px, ${verschuiving.y}px) scale(0.35)`
    stijl.opacity = 0
  }

  return (
    <div
      ref={kaartRef}
      data-testid="rondleiding-kaart"
      style={stijl}
      className={[
        'pointer-events-auto z-[1] bg-[var(--paper)] shadow-[var(--s2)]',
        'border border-[var(--border-ed)] border-l-4 border-l-[var(--color-kern-500)]',
        'motion-safe:transition-all motion-safe:duration-[400ms] motion-safe:ease-out',
      ].join(' ')}
    >
      {/* Platen-kop: hoofdstuk links, teller rechts, avatar ernaast. Zelfde
          maatvoering als `CoachMelding` zodat de twee als één familie lezen. */}
      <div className="flex min-h-[2.75rem] items-center gap-2 border-b border-[var(--border-ed)] pl-3.5 pr-3">
        <span className="shrink-0" aria-hidden="true">
          <FinDots size={26} state={avatar} />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-kern-700)]">
          {kicker}
        </span>
        {!isWelkom && (
          <span className="flex shrink-0 items-center gap-2">
            <HoofdstukStippen actief={stap.hoofdstuk} />
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              {index + 1} van {totaal}
            </span>
          </span>
        )}
      </div>

      <div className="px-3.5 py-3">
        <h3
          id={RONDLEIDING_TITEL_ID}
          className="font-serif text-base font-semibold leading-snug text-[var(--ink)]"
        >
          {stap.titel}
        </h3>
        <p
          id={RONDLEIDING_BODY_ID}
          className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]"
        >
          {body.tekst}
        </p>

        <div className="my-2.5 border-t border-dotted border-[var(--border-md)]" />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {isWelkom ? (
            <PrimairKnop onClick={onStart}>{RONDLEIDING_KNOP.start}</PrimairKnop>
          ) : isLaatste ? (
            <span className="flex flex-wrap items-center gap-2">
              <PrimairKnop onClick={onEersteStap}>{RONDLEIDING_KNOP.eersteStap}</PrimairKnop>
              <TekstKnop onClick={onRondkijken}>{RONDLEIDING_KNOP.rondkijken}</TekstKnop>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <TekstKnop onClick={onVorige} disabled={index === 0}>
                {RONDLEIDING_KNOP.vorige}
              </TekstKnop>
              <PrimairKnop onClick={onVolgende}>{RONDLEIDING_KNOP.volgende}</PrimairKnop>
            </span>
          )}

          {/* Overslaan is ALTIJD zichtbaar en altijd één tik — geen tussenvraag.
              Wie eruit wil, wil er meteen uit. */}
          {!isLaatste && (
            <TekstKnop onClick={onOverslaan}>{RONDLEIDING_KNOP.overslaan}</TekstKnop>
          )}
        </div>
      </div>
    </div>
  )
}

/** Drie stippen — één per hoofdstuk, de actieve als streepje. */
function HoofdstukStippen({ actief }: { actief?: RondleidingHoofdstuk }) {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {HOOFDSTUK_VOLGORDE.map((h) => (
        <span
          key={h}
          className={`h-1.5 rounded-full transition-all ${
            h === actief ? 'w-4 bg-[var(--color-kern-600)]' : 'w-1.5 bg-[var(--border-md)]'
          }`}
        />
      ))}
    </span>
  )
}

function PrimairKnop({
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
      className="inline-flex min-h-[44px] items-center gap-1.5 bg-[var(--color-kern-600)] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-kern-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-kern-500)] active:scale-[0.99]"
    >
      {children}
    </button>
  )
}

function TekstKnop({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[44px] items-center px-2.5 py-2 text-[13px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-kern-500)] disabled:invisible"
    >
      {children}
    </button>
  )
}
