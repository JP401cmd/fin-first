'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, ImagePlus, Loader2, Send, X } from 'lucide-react'
import type { MeldingType } from './melding-type-kiezer'

/**
 * Stap 2 van de meldflow: één formulier, per type een andere set velden.
 *
 * Uitgangspunt (best practice bij testmeldingen): zo min mogelijk uitvragen en
 * de technische context automatisch meesturen. Alles wat we zélf kunnen weten —
 * pagina, browser, viewport, app-versie — staat níet in dit formulier; dat
 * verzamelt de container en vermeldt de microcopy onderaan.
 */

export interface MeldingFormWaarden {
  screen: string
  description: string
  expected: string
  consent: boolean
  screenshot: File | null
}

interface MeldingFormProps {
  type: MeldingType
  /** Voorgevulde, bewerkbare schermnaam (routetitel of pathname). */
  standaardScherm: string
  onTerug: () => void
  onVerstuur: (waarden: MeldingFormWaarden) => void
  bezig: boolean
  /** Foutmelding van de server (platte envelope: `data.error`). */
  foutmelding: string | null
}

const TOEGESTANE_MIMES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Tekstlimieten — exact gelijk aan het zod-schema van `/api/user-reports`
 * (`screen` 120, `description` 5–4000, `expected` 4000). Ze staan hier als
 * `maxLength` op de velden zodat iemand die een console-log plakt — precies de
 * melding die we het liefste krijgen — nooit op een serverfout stuit.
 */
const MAX_SCHERM = 120
const MAX_BESCHRIJVING = 4000
const MAX_VERWACHT = 4000
/** Vanaf hier tonen we de resterende ruimte; daaronder is een teller ruis. */
const TELLER_VANAF = 3500

type TypeConfig = {
  /** Kop, gesplitst zodat het tweede woord het italic-accent krijgt. */
  kopEerste: string
  kopAccent: string
  scherm: boolean
  beschrijvingLabel: string
  beschrijvingPlaceholder: string
  verwacht: boolean
  consentLabel: string | null
  schermafbeelding: boolean
}

/**
 * Wat er feitelijk gebeurt — en dus wat er onder de keuze staat.
 *
 * De melding zelf, de technische context en een eventuele schermafbeelding gaan
 * hoe dan ook naar de werklijst; de keuze zet één boolean. Die boolean gaat over
 * contact opnemen en samen kijken, niet over toegang tot het account — die
 * toegang bestaat technisch niet. De eerdere tekst ("we kijken alleen mee als je
 * ja kiest") beloofde iets anders dan de code doet.
 */
const CONSENT_UITLEG =
  'Je melding, de technische context en een eventuele schermafbeelding gaan altijd mee naar onze werklijst. Met ‘ja’ mogen we je benaderen en samen met jou meekijken — toegang tot je account krijgen we daar niet mee.'

const TYPE_CONFIG: Record<MeldingType, TypeConfig> = {
  bug: {
    kopEerste: 'Bug',
    kopAccent: 'melden',
    scherm: true,
    beschrijvingLabel: 'Wat ging er mis?',
    beschrijvingPlaceholder: 'Beschrijf wat je deed en wat er daarna gebeurde.',
    verwacht: true,
    consentLabel: 'Mogen we contact met je opnemen en samen meekijken?',
    schermafbeelding: true,
  },
  vraag: {
    kopEerste: 'Vraag',
    kopAccent: 'stellen',
    scherm: true,
    beschrijvingLabel: 'Wat is je vraag?',
    beschrijvingPlaceholder: 'Stel je vraag zo concreet mogelijk.',
    verwacht: false,
    consentLabel: 'Mogen we contact met je opnemen om je vraag te beantwoorden?',
    schermafbeelding: true,
  },
  aanbeveling: {
    kopEerste: 'Aanbeveling',
    kopAccent: 'doen',
    scherm: false,
    beschrijvingLabel: 'Wat zou je willen?',
    beschrijvingPlaceholder: 'Beschrijf je idee of wens — en waarom het je zou helpen.',
    verwacht: false,
    consentLabel: null,
    schermafbeelding: false,
  },
}

/** Client-validatie van de afbeelding; spiegelt wat de route ook afdwingt. */
function valideerAfbeelding(bestand: File): string | null {
  if (!TOEGESTANE_MIMES.includes(bestand.type)) {
    return 'Alleen PNG, JPEG of WebP. Kies een ander bestand.'
  }
  if (bestand.size > MAX_BYTES) {
    return 'De afbeelding is groter dan 4 MB. Kies een kleinere afbeelding.'
  }
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Zelfde labelstijl als de overige formulieren in de app (action-edit-modal,
// module-activation-modal): sentence case, want deze labels zijn vragen.
const LABEL_CLASS = 'block text-xs font-medium text-[var(--ink-2)]'
const VELD_CLASS =
  'mt-1.5 w-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-4)] focus:border-wil-400 focus:ring-1 focus:ring-wil-200 disabled:opacity-60'

export function MeldingForm({
  type,
  standaardScherm,
  onTerug,
  onVerstuur,
  bezig,
  foutmelding,
}: MeldingFormProps) {
  const config = TYPE_CONFIG[type]

  // `maxLength` remt alleen wat de gebruiker zélf typt of plakt; een
  // voorgevulde waarde glipt eromheen. Daarom hier al inkorten.
  const [scherm, setScherm] = useState(() => standaardScherm.slice(0, MAX_SCHERM))
  const [beschrijving, setBeschrijving] = useState('')
  const [verwacht, setVerwacht] = useState('')
  const [consent, setConsent] = useState(false)
  const [afbeelding, setAfbeelding] = useState<File | null>(null)
  const [voorbeeldUrl, setVoorbeeldUrl] = useState<string | null>(null)
  const [afbeeldingFout, setAfbeeldingFout] = useState<string | null>(null)
  const [aangeraakt, setAangeraakt] = useState(false)

  const bestandInputRef = useRef<HTMLInputElement>(null)
  // Voor focusverplaatsing naar het eerste ongeldige veld bij een mislukte submit.
  const schermRef = useRef<HTMLInputElement>(null)
  const beschrijvingRef = useRef<HTMLTextAreaElement>(null)
  /** Actieve object-URL — buiten de state-updater, zodat React StrictMode geen URL laat lekken. */
  const urlRef = useRef<string | null>(null)

  // Object-URL vrijgeven bij vervangen, verwijderen én unmount.
  const zetAfbeelding = useCallback((bestand: File | null) => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    const url = bestand ? URL.createObjectURL(bestand) : null
    urlRef.current = url
    setVoorbeeldUrl(url)
    setAfbeelding(bestand)
  }, [])

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [])

  const kiesAfbeelding = useCallback(
    (bestand: File) => {
      const fout = valideerAfbeelding(bestand)
      if (fout) {
        setAfbeeldingFout(fout)
        return
      }
      setAfbeeldingFout(null)
      zetAfbeelding(bestand)
    },
    [zetAfbeelding],
  )

  const verwijderAfbeelding = useCallback(() => {
    setAfbeeldingFout(null)
    zetAfbeelding(null)
    if (bestandInputRef.current) bestandInputRef.current.value = ''
  }, [zetAfbeelding])

  /**
   * Plakken (Ctrl/⌘+V) ergens in het formulier: pak het eerste klembord-item dat
   * een afbeelding is. Dit is de snelste route van "ik zie iets raars" naar een
   * bruikbare melding — een schermafbeelding maken en opslaan is dat niet.
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLFormElement>) => {
      if (!config.schermafbeelding) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const bestand = item.getAsFile()
        if (!bestand) continue
        e.preventDefault()
        kiesAfbeelding(bestand)
        return
      }
    },
    [config.schermafbeelding, kiesAfbeelding],
  )

  const valideer = useCallback(
    (waarden: { scherm: string; beschrijving: string }) => {
      const fouten: { scherm?: string; beschrijving?: string } = {}
      if (config.scherm && !waarden.scherm.trim()) {
        fouten.scherm = 'Vul in op welk scherm dit speelt.'
      }
      if (waarden.beschrijving.trim().length < 5) {
        fouten.beschrijving = 'Schrijf in een paar woorden waar het over gaat.'
      }
      return fouten
    },
    [config.scherm],
  )

  // Afgeleide state hoort in de render, niet in een effect: zodra het formulier
  // is aangeraakt her-valideren we bij elke toetsaanslag (de fout verdwijnt dus
  // zodra de invoer geldig wordt) zónder extra state en zonder cascading render.
  const veldFouten = aangeraakt ? valideer({ scherm, beschrijving }) : {}

  const toonTeller = beschrijving.length >= TELLER_VANAF
  const resterend = MAX_BESCHRIJVING - beschrijving.length

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (bezig) return
    const fouten = valideer({ scherm, beschrijving })
    setAangeraakt(true)
    if (Object.keys(fouten).length > 0) {
      // Zonder deze sprong blijft de focus op de verzendknop staan: een
      // schermlezergebruiker hoort dan niets gebeuren. Het veld draagt al
      // aria-invalid + aria-describedby, dus bij focus volgt de foutregel.
      if (fouten.scherm) schermRef.current?.focus()
      else if (fouten.beschrijving) beschrijvingRef.current?.focus()
      return
    }
    onVerstuur({
      screen: config.scherm ? scherm.trim() : '',
      description: beschrijving.trim(),
      expected: config.verwacht ? verwacht.trim() : '',
      consent: config.consentLabel ? consent : false,
      screenshot: config.schermafbeelding ? afbeelding : null,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      onPaste={handlePaste}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      {/* Scrollbare inhoud — de knoppen blijven eronder staan (sticky footer). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="flex items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
          <span className="mr-2.5 inline-block h-px w-7 bg-wil-500 align-middle" aria-hidden="true" />
          Melding
        </p>
        <h2 className="mt-2 font-display text-[20px] leading-tight text-[var(--ink)]">
          {config.kopEerste}{' '}
          <em className="font-serif font-normal italic text-wil-700">{config.kopAccent}</em>
        </h2>

        <div className="mt-4 space-y-4">
          {config.scherm && (
            <div>
              <label htmlFor="melding-scherm" className={LABEL_CLASS}>
                Scherm
              </label>
              <input
                ref={schermRef}
                id="melding-scherm"
                type="text"
                value={scherm}
                onChange={(e) => setScherm(e.target.value)}
                onBlur={() => setAangeraakt(true)}
                disabled={bezig}
                maxLength={MAX_SCHERM}
                aria-invalid={veldFouten.scherm ? true : undefined}
                aria-describedby={veldFouten.scherm ? 'melding-scherm-fout' : undefined}
                className={VELD_CLASS}
              />
              {veldFouten.scherm && (
                <p
                  id="melding-scherm-fout"
                  className="mt-1 flex items-center gap-1 text-xs text-negative"
                >
                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {veldFouten.scherm}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="melding-beschrijving" className={LABEL_CLASS}>
              {config.beschrijvingLabel}
            </label>
            <textarea
              ref={beschrijvingRef}
              id="melding-beschrijving"
              value={beschrijving}
              onChange={(e) => setBeschrijving(e.target.value)}
              onBlur={() => setAangeraakt(true)}
              disabled={bezig}
              rows={4}
              maxLength={MAX_BESCHRIJVING}
              placeholder={config.beschrijvingPlaceholder}
              aria-invalid={veldFouten.beschrijving ? true : undefined}
              aria-describedby={
                [
                  veldFouten.beschrijving ? 'melding-beschrijving-fout' : null,
                  toonTeller ? 'melding-beschrijving-teller' : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              className={`${VELD_CLASS} resize-none leading-relaxed`}
            />
            {veldFouten.beschrijving && (
              <p
                id="melding-beschrijving-fout"
                className="mt-1 flex items-center gap-1 text-xs text-negative"
              >
                <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                {veldFouten.beschrijving}
              </p>
            )}
            {/* Pas zichtbaar dicht bij de grens — een teller die altijd meeloopt
                is ruis, en een console-log plakken moet gewoon kunnen. */}
            {toonTeller && (
              <p
                id="melding-beschrijving-teller"
                className={`mt-1 text-right font-mono text-[11px] tabular-nums ${
                  resterend === 0 ? 'text-negative' : 'text-[var(--ink-4)]'
                }`}
              >
                Nog {resterend} van de {MAX_BESCHRIJVING} tekens
              </p>
            )}
          </div>

          {config.verwacht && (
            <div>
              <label htmlFor="melding-verwacht" className={LABEL_CLASS}>
                Wat had je verwacht? <span className="font-normal text-[var(--ink-4)]">(optioneel)</span>
              </label>
              <textarea
                id="melding-verwacht"
                value={verwacht}
                onChange={(e) => setVerwacht(e.target.value)}
                disabled={bezig}
                rows={2}
                maxLength={MAX_VERWACHT}
                placeholder="Wat had er volgens jou moeten gebeuren?"
                className={`${VELD_CLASS} resize-none leading-relaxed`}
              />
            </div>
          )}

          {/* De schermafbeelding staat bewust BOVEN de toestemmingsvraag: de
              uitleg eronder benoemt 'm, en alles wat de gebruiker meegeeft moet
              zichtbaar zijn vóórdat hij de keuze maakt. */}
          {config.schermafbeelding && (
            <div>
              <span className={LABEL_CLASS}>
                Schermafbeelding <span className="font-normal text-[var(--ink-4)]">(optioneel)</span>
              </span>

              {voorbeeldUrl && afbeelding ? (
                <div className="mt-1.5 flex items-center gap-3 border border-[var(--border-ed)] bg-[var(--paper)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={voorbeeldUrl}
                    alt="Voorbeeld van de gekozen schermafbeelding"
                    className="h-14 w-14 shrink-0 border border-[var(--border-ed)] object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-[var(--ink-2)]">{afbeelding.name}</p>
                    <p className="font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
                      {formatBytes(afbeelding.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={verwijderAfbeelding}
                    disabled={bezig}
                    aria-label="Schermafbeelding verwijderen"
                    className="touch-target flex shrink-0 items-center justify-center text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => bestandInputRef.current?.click()}
                  disabled={bezig}
                  className="mt-1.5 flex w-full items-center gap-3 border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-3 py-3 text-left transition-colors hover:border-wil-300 hover:bg-wil-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500 disabled:opacity-60"
                >
                  <ImagePlus className="h-5 w-5 shrink-0 text-[var(--ink-4)]" aria-hidden="true" />
                  <span className="text-xs leading-snug text-[var(--ink-3)]">
                    <span className="text-wil-700 underline underline-offset-2">Kies een bestand</span>{' '}
                    of plak er een met Ctrl+V (⌘+V).
                    <span className="mt-0.5 block text-[var(--ink-4)]">
                      PNG, JPEG of WebP tot 4 MB.
                    </span>
                  </span>
                </button>
              )}

              <input
                ref={bestandInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const bestand = e.target.files?.[0]
                  if (bestand) kiesAfbeelding(bestand)
                }}
              />

              {afbeeldingFout && (
                <p className="mt-1 flex items-center gap-1 text-xs text-negative">
                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {afbeeldingFout}
                </p>
              )}
            </div>
          )}

          {config.consentLabel && (
            <fieldset className="border-0 p-0">
              {/* De vraag staat ín de legend, zodat een schermlezer 'm bij elke
                  keuzeknop meeleest (een losse <p> ernaast wordt overgeslagen). */}
              <legend className={LABEL_CLASS}>
                Toestemming
                <span className="mt-1.5 block text-[13px] font-normal leading-relaxed text-[var(--ink-2)]">
                  {config.consentLabel}
                </span>
              </legend>
              <div className="mt-2 flex gap-2">
                {[
                  { waarde: true, label: 'Ja' },
                  { waarde: false, label: 'Nee' },
                ].map(({ waarde, label }) => (
                  <label key={label} className="cursor-pointer">
                    <input
                      type="radio"
                      name="melding-consent"
                      className="peer sr-only"
                      checked={consent === waarde}
                      onChange={() => setConsent(waarde)}
                      disabled={bezig}
                    />
                    <span className="block border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.10em] text-[var(--ink-3)] transition-colors hover:border-wil-300 peer-checked:border-wil-500 peer-checked:bg-wil-50 peer-checked:text-wil-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-wil-500">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-4)]">
                {CONSENT_UITLEG}
              </p>
            </fieldset>
          )}
        </div>

        <p className="mt-4 border-t border-[var(--border-ed)] pt-3 text-[11px] leading-snug text-[var(--ink-4)]">
          We sturen automatisch mee: pagina, browser en app-versie.
        </p>
      </div>

      {/* Sticky footer: knoppen scrollen nooit weg, ook niet op mobiel. */}
      <div
        className="border-t border-[var(--border-ed)] bg-[var(--paper)] px-4 pt-3"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        {/* Serverfout (platte envelope) — assertief, want de gebruiker wacht erop. */}
        <div aria-live="assertive">
          {foutmelding && (
            <p
              role="alert"
              className="mb-2.5 flex items-start gap-1.5 border border-negative/30 bg-negative-bg px-3 py-2 text-xs leading-snug text-negative"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {foutmelding}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTerug}
            disabled={bezig}
            className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] px-3 py-2.5 text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500 disabled:opacity-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Terug
          </button>
          <button
            type="submit"
            disabled={bezig}
            className="inline-flex flex-1 items-center justify-center gap-2 bg-wil-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500 active:scale-[0.99] disabled:bg-zinc-300 disabled:text-[var(--ink-3)]"
          >
            {bezig ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Versturen…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                Verstuur melding
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
