'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, MessagesSquare } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { useChatContextOptional } from '@/components/app/chat/chat-provider'
import { createChatHistoryFacade } from '@/lib/chat/history/facade'
import {
  CHAT_HISTORY_OPTIES,
  CHAT_HISTORY_VLOER_REGEL,
  parseChatHistoryMode,
} from '@/lib/chat/history-copy'
import type { ChatHistoryMode } from '@/lib/chat/history/types'

/**
 * "Gesprekken met Fin" op /mijn/privacy — de volledige uitleg bij de keuze die
 * je óók compact in het chatvenster kunt maken (W-004, B15).
 *
 * TWEE BEDIENINGEN, ÉÉN ADMINISTRATIE. De teksten komen uit
 * `lib/chat/history-copy.ts`, de waarde uit `/api/chat/history-settings` —
 * dezelfde route die de popover leest en schrijft. Deze pagina is de plek voor
 * de uitleg en de onomkeerbare handeling; de popover is de snelle schakelaar.
 *
 * EEN INSTELLING IS NOOIT EEN DESTRUCTIEVE HANDELING. Wie "niet bewaren" kiest
 * krijgt daarom expliciet de vraag wat er met de bestaande gesprekken moet
 * gebeuren — twee uitgangen, en annuleren zet de instelling niet om. Raden wat
 * iemand bedoelde is hier het verkeerde antwoord: wie de knop omzet om te zien
 * wát hij doet, mag geen maand aan gesprekken kwijtraken.
 *
 * "MIJN GESPREKKEN" ZIJN ER TWEE STAPELS. De route telt alleen wat er op het
 * ACCOUNT staat; de gesprekken op dít toestel wonen in IndexedDB en worden via
 * de facade gewist. Zonder die tweede stapel bood dit scherm "Verwijder ze nu"
 * aan iemand met nul servergesprekken en twintig lokale — een knop die belooft
 * te wissen wat hij niet aanraakt. De teksten benoemen daarom altijd allebei.
 */

type Stand =
  | { fase: 'laden' }
  | { fase: 'klaar'; mode: ChatHistoryMode; aantalOpAccount: number }
  | { fase: 'mislukt' }

export function ChatGeschiedenisInstelling() {
  const [stand, setStand] = useState<Stand>({ fase: 'laden' })
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  /** 'uit' = de bevestiging vóór het uitzetten · 'wissen' = losse wisactie. */
  const [bevestiging, setBevestiging] = useState<'uit' | 'wissen' | null>(null)
  /** Hoeveel gesprekken staan er op DIT toestel (IndexedDB)? */
  const [aantalOpApparaat, setAantalOpApparaat] = useState(0)

  // De apparaatrug. Buiten de app-shell (unit-test, SSR-fragment) is er geen
  // ChatProvider en dus geen userId — dan telt en wist dit scherm alleen de
  // serverkant, precies zoals voorheen.
  const chatCtx = useChatContextOptional()
  const userId = chatCtx?.userId ?? null
  const chatHistoryMode = chatCtx?.chatHistoryMode ?? 'account'
  const facade = useMemo(
    () => (userId ? createChatHistoryFacade({ userId, mode: chatHistoryMode }) : null),
    [userId, chatHistoryMode],
  )

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/history-settings')
      if (!res.ok) throw new Error('laden mislukt')
      const data = (await res.json()) as { mode?: unknown; serverConversationCount?: unknown }
      setStand({
        fase: 'klaar',
        mode: parseChatHistoryMode(data.mode),
        aantalOpAccount:
          typeof data.serverConversationCount === 'number' ? data.serverConversationCount : 0,
      })
    } catch {
      setStand({ fase: 'mislukt' })
    }
  }, [])

  const telApparaat = useCallback(async () => {
    if (!facade) {
      setAantalOpApparaat(0)
      return
    }
    setAantalOpApparaat(await facade.deviceAantal())
  }, [facade])

  useEffect(() => {
    void laad()
  }, [laad])

  useEffect(() => {
    void telApparaat()
  }, [telApparaat])

  const schrijf = useCallback(
    async (
      mode: ChatHistoryMode,
      deleteExisting: boolean,
      bevestigingsTekst: string,
      /** Wis óók de gesprekken op dit toestel — de tweede stapel (zie de kop). */
      ookApparaat = false,
    ) => {
      setBezig(true)
      setFout(null)
      setMelding(null)
      try {
        const res = await fetch('/api/chat/history-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, ...(deleteExisting ? { deleteExisting: true } : {}) }),
        })
        if (!res.ok) throw new Error('opslaan mislukt')
        const data = (await res.json()) as { mode?: unknown; deleted?: unknown }
        const gewistOpAccount = typeof data.deleted === 'number' ? data.deleted : 0
        let gewistOpApparaat = 0
        if (ookApparaat && facade) {
          // Bewust ná de server-call en apart afgevangen: mislukt het wissen op
          // dit toestel, dan is de serverkant wél weg en moet de gebruiker dat
          // horen — niet een groene bevestiging voor iets dat half gebeurde.
          gewistOpApparaat = aantalOpApparaat
          await facade.removeAllDevice()
          setAantalOpApparaat(0)
        }
        setStand((s) =>
          s.fase === 'klaar'
            ? {
                fase: 'klaar',
                mode: parseChatHistoryMode(data.mode ?? mode),
                aantalOpAccount: deleteExisting ? 0 : s.aantalOpAccount,
              }
            : s,
        )
        const gewist = gewistOpAccount + gewistOpApparaat
        setMelding(
          deleteExisting && gewist > 0
            ? `${bevestigingsTekst} ${gewist} ${gewist === 1 ? 'gesprek is' : 'gesprekken zijn'} verwijderd.`
            : bevestigingsTekst,
        )
      } catch {
        setFout('Deze keuze kon niet worden opgeslagen. Probeer het zo nog eens.')
        void telApparaat()
      } finally {
        setBezig(false)
        setBevestiging(null)
      }
    },
    [facade, aantalOpApparaat, telApparaat],
  )

  const kies = useCallback(
    (mode: ChatHistoryMode) => {
      if (stand.fase !== 'klaar' || mode === stand.mode) return
      if (mode === 'uit') {
        // Niet meteen omzetten: eerst de vraag wat er met het bestaande moet
        // gebeuren. Annuleren laat de instelling staan zoals hij stond.
        setBevestiging('uit')
        return
      }
      const tekst =
        mode === 'apparaat'
          ? 'Nieuwe gesprekken blijven op dit apparaat. Wat je eerder bewaarde blijft staan waar het staat.'
          : 'Nieuwe gesprekken bewaren we op je account. Wat je op dit apparaat bewaarde blijft daar staan.'
      void schrijf(mode, false, tekst)
    },
    [stand, schrijf],
  )

  const huidige = stand.fase === 'klaar' ? stand.mode : null
  const aantal = stand.fase === 'klaar' ? stand.aantalOpAccount : 0
  const totaal = aantal + aantalOpApparaat

  /** "3 gesprekken" / "1 gesprek" — één plek, want dit staat op vier regels. */
  const gesprekken = (n: number) => `${n} ${n === 1 ? 'gesprek' : 'gesprekken'}`

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
      <section className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0 text-fin-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              Gesprekken met Fin
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
              Je kunt je gesprekken met Fin terugvinden en hervatten. Waar ze bewaard worden,
              bepaal je zelf.
            </p>
          </div>
        </div>

        {stand.fase === 'laden' && (
          <p className="mt-4 flex items-center gap-2 text-[11px] text-[var(--ink-3)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Je keuze wordt opgehaald…
          </p>
        )}

        {stand.fase === 'mislukt' && (
          <p className="mt-4 text-[11px] text-[var(--ink-3)]">
            Je keuze kon niet worden opgehaald.{' '}
            <button
              type="button"
              onClick={() => void laad()}
              className="underline underline-offset-2 hover:text-[var(--ink)]"
            >
              Opnieuw proberen
            </button>
          </p>
        )}

        {stand.fase === 'klaar' && (
          <>
            <div
              className="mt-4 space-y-2"
              role="radiogroup"
              aria-label="Waar bewaren we je gesprekken met Fin?"
            >
              {CHAT_HISTORY_OPTIES.map((optie) => {
                const gekozen = huidige === optie.mode
                return (
                  <button
                    key={optie.mode}
                    type="button"
                    role="radio"
                    aria-checked={gekozen}
                    disabled={bezig}
                    onClick={() => kies(optie.mode)}
                    className={`flex w-full items-start gap-3 border px-3 py-2.5 text-left transition-colors ${
                      gekozen
                        ? 'border-[var(--ink)] bg-[var(--subtle)]'
                        : 'border-[var(--rule-soft)] hover:bg-[var(--subtle)]'
                    } disabled:opacity-50`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-[var(--ink)]">
                        {optie.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--ink-3)]">
                        {optie.uitleg}
                      </span>
                    </span>
                    {gekozen && (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink)]" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>

            <p className="mt-3 border-l-2 border-fin-200 pl-3 text-[11px] leading-relaxed text-[var(--ink-3)]">
              {CHAT_HISTORY_VLOER_REGEL}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-ed)] pt-3">
              <p className="text-[11px] text-[var(--ink-3)]">
                {totaal === 0
                  ? 'Je hebt nu geen bewaarde gesprekken.'
                  : `Je hebt ${gesprekken(aantal)} op je account en ${gesprekken(aantalOpApparaat)} op dit apparaat.`}
              </p>
              <button
                type="button"
                disabled={bezig || totaal === 0}
                onClick={() => setBevestiging('wissen')}
                className="text-[11px] font-medium text-negative underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Verwijder mijn gesprekken
              </button>
            </div>

            {melding && (
              <p role="status" className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
                {melding}
              </p>
            )}
            {fout && (
              <p role="alert" className="mt-3 text-[11px] font-medium text-negative">
                {fout}
              </p>
            )}
          </>
        )}
      </section>

      {/* Twee uitgangen, allebei even duidelijk: laten staan of nu verwijderen.
          Annuleren (knop, Esc, backdrop) zet de instelling NIET om. */}
      <ShellOverlay
        open={bevestiging === 'uit'}
        onClose={() => {
          if (bezig) return
          setBevestiging(null)
        }}
        kind="confirm"
        title="Gesprekken niet meer bewaren?"
        /* De knoppen horen in de sticky footer, óók op klein scherm
           (modal-conventie): onderaan de scroll-content zouden ze meeschuiven en
           bij een lange tekst buiten beeld vallen. */
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              disabled={bezig}
              onClick={() => setBevestiging(null)}
              className="min-h-11 rounded-lg px-4 text-sm font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] disabled:opacity-50"
            >
              Annuleren
            </button>
            <button
              type="button"
              disabled={bezig}
              onClick={() =>
                void schrijf(
                  'uit',
                  false,
                  'Fin bewaart je gesprekken niet meer. Je bestaande gesprekken blijven staan.',
                )
              }
              className="min-h-11 rounded-lg border border-[var(--border-ed)] px-4 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
            >
              Laat ze staan
            </button>
            <button
              type="button"
              disabled={bezig || totaal === 0}
              aria-busy={bezig || undefined}
              onClick={() =>
                void schrijf('uit', true, 'Fin bewaart je gesprekken niet meer.', true)
              }
              className="min-h-11 rounded-lg bg-negative px-4 text-sm font-medium text-white transition-colors hover:bg-negative/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bezig ? 'Bezig…' : 'Verwijder ze nu'}
            </button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            Vanaf nu bewaart Fin je gesprekken niet meer — zodra je het venster sluit is het
            gesprek weg. Wat wil je met{' '}
            {totaal === 0
              ? 'de gesprekken die je eerder bewaarde'
              : `je ${gesprekken(totaal)} van hiervoor`}
            ?
          </p>
          {totaal > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
              {`Verwijderen raakt allebei de plekken: ${gesprekken(aantal)} op je account en ${gesprekken(aantalOpApparaat)} op dit apparaat.`}
            </p>
          )}
        </div>
      </ShellOverlay>

      {/* Losse wisactie: de instelling blijft staan zoals hij stond. */}
      <ShellOverlay
        open={bevestiging === 'wissen'}
        onClose={() => {
          if (bezig) return
          setBevestiging(null)
        }}
        kind="confirm"
        destructive
        title="Je gesprekken verwijderen?"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={bezig}
              onClick={() => setBevestiging(null)}
              className="min-h-11 rounded-lg border border-[var(--border-ed)] px-4 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
            >
              Annuleren
            </button>
            <button
              type="button"
              disabled={bezig || huidige === null}
              aria-busy={bezig || undefined}
              onClick={() => {
                if (huidige === null) return
                void schrijf(huidige, true, 'Je bewaarde gesprekken zijn verwijderd.', true)
              }}
              className="min-h-11 rounded-lg bg-negative px-4 text-sm font-medium text-white transition-colors hover:bg-negative/90 disabled:opacity-60"
            >
              {bezig ? 'Bezig…' : 'Ja, verwijderen'}
            </button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            {totaal === 1 ? 'Dit gesprek wordt' : `Deze ${gesprekken(totaal)} worden`} definitief
            verwijderd: {gesprekken(aantal)} op je account en {gesprekken(aantalOpApparaat)} op dit
            apparaat. Gesprekken op een ánder toestel raken we hiermee niet — die verwijder je in
            de gesprekkenlijst van dat toestel.
          </p>
        </div>
      </ShellOverlay>
    </div>
  )
}
