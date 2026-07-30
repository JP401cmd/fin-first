'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, History, RefreshCw, ArrowRight, Info, Link2, PencilLine, Wallet } from 'lucide-react'
import { formatCurrencyDecimals, formatDateShort } from '@/lib/format'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { CarrierCorrection } from '@/components/app/bank-connect/carrier-correction'
import { CashflowAccountsExit } from '@/components/app/bank-connect/target-account-choice'
import type { LinkedAccountView } from '@/lib/truelayer/linked-account'

/**
 * Uitkomst van één sync, zoals `POST /api/bank-connect/sync` hem teruggeeft.
 * Alles komt uit die respons — bewust géén extra client-directe read voor de
 * voortgang of de ophaalgrens (ADR 0058).
 */
type SyncResult = {
  /** Dedup-laag 1: exact dezelfde hash (datum|bedrag|omschrijving). */
  duplicates: number
  /**
   * Dedup-laag 2: dezelfde boeking uit een andere bron (datum ±1 dag, bedrag
   * exact, tegenpartij gelijk) — een CSV-rij die de bank nu ook levert. Apart
   * geteld, want `duplicates` behoudt haar oorspronkelijke betekenis.
   */
  duplicates_cross_source: number
  new: number
  fetched_from: string | null
  truncated: boolean
  /** Het saldo dat deze sync heeft overgenomen, of `null` als dat niet lukte. */
  balance: number | null
  /** De waarde die het saldo verving — de "van" in "€a → €b". */
  balance_previous: number | null
  /**
   * Heeft deze sync een herwaardering weggeschreven? De server doet de
   * cent-vergelijking (`isSameBalance`); deze pagina herhaalt hem niet — anders
   * ontstaat er een tweede definitie van "het saldo is veranderd".
   */
  balance_revalued: boolean
}

/**
 * Hoeveel rekeningen uit deze consent geblokkeerd zijn, uit `?geblokkeerd=<n>`.
 *
 * Defensief: alles wat geen geheel getal > 0 is levert `null` en dus géén band.
 * Een querystring is gebruikersinvoer — "geblokkeerd=abc" of "geblokkeerd=0" mag
 * nooit een melding opleveren over iets dat niet gebeurd is, en `parseInt` alleen
 * zou van "3 rekeningen" stil "3" maken.
 */
function parseBlockedCount(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const n = Number.parseInt(raw, 10)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * Wélk saldo is er overgenomen, en waarvandaan? (fase 8, besluit 3 — een melding
 * achteraf, geen blokkerende dialoog.)
 *
 * Twee bronnen, in deze volgorde. **De sync van deze sessie wint**: die is het
 * meest recent, en haar respons draagt de uitkomst rechtstreeks. Anders het
 * server-feit uit `linked-accounts` — dat is de énige manier waarop de saldo-
 * schrijfactie van de CALLBACK zichtbaar wordt, want die gebeurt vóórdat deze
 * pagina laadt.
 */
function resolveBalanceChange(
  result: SyncResult | undefined,
  fromServer: LinkedAccountView['balance_change'],
): { previous: number; current: number } | null {
  if (result?.balance_revalued && result.balance !== null && result.balance_previous !== null) {
    return { previous: result.balance_previous, current: result.balance }
  }
  return fromServer
}

export default function ConnectSuccessPage() {
  const searchParams = useSearchParams()
  /**
   * Gedeeltelijk geslaagde consent (fase 6 → fase 7): sommige rekeningen zijn
   * gekoppeld, andere niet omdat hun beoogde TriFinity-rekening al een andere
   * bankkoppeling draagt (FR5). Tot fase 7 was die uitkomst alléén in de
   * serverlog te zien — de gebruiker zag een succespagina met minder rekeningen
   * dan hij bij zijn bank had aangevinkt, zonder uitleg.
   */
  const blockedCount = parseBlockedCount(searchParams.get('geblokkeerd'))

  const [accounts, setAccounts] = useState<LinkedAccountView[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({})
  /** Welke kaart heeft haar correctiepaneel open? Hooguit één, om de pagina rustig te houden. */
  const [correcting, setCorrecting] = useState<string | null>(null)

  // Lezen via de route, niet client-direct (ADR 0058): het correctiemoment heeft
  // er een tweede tabel bij nodig (wélke bank_accounts-rij draagt dit?), en dat is
  // het moment om de read te verhuizen in plaats van te verbreden. Deze pagina is
  // daarmee van de grandfather-allowlist af.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bank-connect/linked-accounts')
      if (res.ok) {
        const data = await res.json()
        setAccounts((data.accounts ?? []) as LinkedAccountView[])
      }
    } catch {
      // Stil: de koppeling is al gelukt: dit blok is bevestiging, geen voorwaarde.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSync(accountId: string) {
    setSyncing(accountId)
    try {
      const res = await fetch('/api/bank-connect/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_account_id: accountId }),
      })
      const data = await res.json()
      if (res.ok) {
        setSyncResults((prev) => ({
          ...prev,
          [accountId]: {
            new: data.new,
            duplicates: data.duplicates,
            duplicates_cross_source: data.duplicates_cross_source ?? 0,
            fetched_from: data.fetched_from ?? null,
            truncated: Boolean(data.truncated),
            balance: typeof data.balance === 'number' ? data.balance : null,
            balance_previous: typeof data.balance_previous === 'number' ? data.balance_previous : null,
            balance_revalued: Boolean(data.balance_revalued),
          },
        }))
      }
    } catch {
      // Silently handle
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-5 sm:px-6 sm:py-12 text-center">
      <NavStackMeta title="Bank gekoppeld" />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-positive-bg">
        <CheckCircle2 className="h-8 w-8 text-positive" />
      </div>

      {/* Editorial success-header */}
      <div className="inline-flex items-center justify-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] mt-4">
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        Cash · gelukt
      </div>
      <h1
        className="mt-2 font-bold text-2xl sm:text-3xl tracking-[-0.02em]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        Bank{' '}
        <em
          className="font-normal italic"
          style={{ color: 'var(--module-active-700)' }}
        >
          gekoppeld
        </em>
      </h1>
      <p
        className="mt-2 italic text-sm text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Je bankrekening is succesvol verbonden. Controleer hieronder waar de data
        landt en synchroniseer dan je transacties.
      </p>

      {/* Gedeeltelijk geblokkeerd (FR5). `--warning` en niet `--negative`: de
          koppelingen die er wél staan wérken — dit is aandacht, geen fout. Mét de
          uitweg, want "verbreek die koppeling eerst" zonder pad is een instructie
          zonder uitweg. */}
      {blockedCount !== null && (
        <div
          role="status"
          className="mt-6 border border-warning/30 bg-warning-bg px-4 py-3 text-left"
        >
          {/* Tekst op inkt, tint in rand/vlak/icoon: `text-warning` op
              `bg-warning-bg` haalt 4,48:1 (gemeten op de tokens in
              `app/globals.css`) en blijft daarmee onder de 4,5:1 die AA voor
              12px-tekst eist. Een icoon is een grafisch element en mag op 3:1. */}
          <p className="flex items-start gap-2 text-xs text-[var(--ink-2)]">
            <Link2 aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              {blockedCount === 1
                ? 'Eén rekening uit deze koppeling kon niet worden gekoppeld: de TriFinity-rekening waar hij op zou landen draagt al een andere bankkoppeling.'
                : `${blockedCount} rekeningen uit deze koppeling konden niet worden gekoppeld: de TriFinity-rekeningen waar ze op zouden landen dragen al een andere bankkoppeling.`}
            </span>
          </p>
          {/* Gedeelde uitweg — dezelfde tekst en bestemming die de koppelwizard
              gebruikt zodra hij de bezette rekening niet kan aanwijzen. */}
          <CashflowAccountsExit className="mt-2" />
        </div>
      )}

      {/* Linked accounts */}
      {!loading && accounts.length > 0 && (
        <div className="mt-8 space-y-3 text-left">
          {accounts.map((acc) => {
            const result = syncResults[acc.id]
            // De gate van het correctiemoment leunt op het SERVER-feit
            // (`last_synced_at`), niet alleen op de sync van deze render-sessie:
            // anders heropent één refresh de grens stilzwijgend en belooft de
            // knop iets dat `POST /api/bank-connect/relink` daarna weigert.
            const isSynced = Boolean(result) || Boolean(acc.last_synced_at)
            // `bank_account_id === null` betekent dat de aanmaak van de rekening
            // is mislukt — er is niets om data op te zetten. Dat is een fout, geen
            // normale toestand, en mag dus niet als "een nieuwe rekening" klinken.
            const hasCarrier = Boolean(acc.bank_account_id)
            const balanceChange = resolveBalanceChange(result, acc.balance_change)

            return (
              <div key={acc.id} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {acc.provider_name ?? 'Bank'}
                    </p>
                    <p className="truncate text-xs text-[var(--ink-3)]">
                      {acc.account_name ?? 'Rekening'}
                      {acc.iban_tail ? ` · ···· ${acc.iban_tail}` : ''}
                    </p>
                  </div>

                  {result ? (
                    <span className="shrink-0 text-xs text-positive" aria-live="polite">
                      {/* "Al bekend" is één begrip voor de gebruiker: of een
                          boeking nu op de hash of cross-bron is herkend, ze stond
                          er al. De splitsing is techniek en staat hieronder. */}
                      {result.new} nieuw, {result.duplicates + result.duplicates_cross_source} al bekend
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSync(acc.id)}
                      // Zonder dragende rekening is er niets om transacties op te
                      // schrijven; de knop zou stil falen.
                      disabled={syncing === acc.id || !hasCarrier}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing === acc.id ? 'animate-spin' : ''}`} />
                      {syncing === acc.id ? 'Synchroniseren…' : 'Synchroniseer nu'}
                    </button>
                  )}
                </div>

                {/* ── Het correctiemoment (fase 5, SC-07) ───────────────────────
                    Voor ÉLKE gekoppelde rekening, niet alleen de expliciet
                    gekozene: de callback laat identiteit
                    (`external_account_id`) altijd van de keuze winnen, dus de
                    data kan ergens anders landen dan in de wizard aangewezen. Dat
                    stil laten gebeuren maakt die keuze tot schijnkeuze. */}
                <div className="mt-3 border-t border-[var(--border-ed)] pt-3">
                  {hasCarrier ? (
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex min-w-0 items-start gap-2 text-xs text-[var(--ink-2)]">
                        <Wallet aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
                        <span className="min-w-0">
                          Landt op{' '}
                          <span className="font-medium text-[var(--ink)]">
                            {acc.carrier_name ?? 'je TriFinity-rekening'}
                          </span>
                          {acc.carrier_iban_tail ? ` · ···· ${acc.carrier_iban_tail}` : ''}
                          {/* Na de eerste ophaal staan er transacties op deze
                              rekening. Verhangen zou de koppeling verplaatsen maar
                              die transacties achterlaten (her-attributie is bewust
                              buiten scope), dus de actie verdwijnt en de reden
                              staat op dezelfde regel — één blok minder op een toch
                              al volle kaart. */}
                          {/* `--ink-2`, niet `--ink-3`: op 12px haalt `--ink-3`
                              3,65:1 en dus geen AA. Deze regel is de énige
                              verklaring waarom de wijzig-actie verdween. */}
                          {isSynced && (
                            <span className="text-[var(--ink-2)]">
                              {' · '}vergrendeld nu er transacties zijn opgehaald
                            </span>
                          )}
                        </span>
                      </p>

                      {!isSynced && (
                        <button
                          type="button"
                          onClick={() => setCorrecting((prev) => (prev === acc.id ? null : acc.id))}
                          aria-expanded={correcting === acc.id}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-kern-700 underline underline-offset-2 hover:bg-kern-50"
                        >
                          <PencilLine aria-hidden className="h-3 w-3" />
                          {correcting === acc.id ? 'Sluiten' : 'Wijzigen'}
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Géén dragende rekening = de aanmaak is mislukt. Dat is een
                       fout, niet een variant van de gewone flow, dus hij leest ook
                       als fout — en er staat een uitweg bij in plaats van een
                       sync-knop die stil niets doet. */
                    <p role="alert" className="flex items-start gap-2 text-xs text-negative">
                      <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>
                        Deze rekening kon niet aan een TriFinity-rekening worden gekoppeld, dus
                        er is nog niets om transacties op te zetten.{' '}
                        <Link href="/core/cash/connect" className="underline underline-offset-2">
                          Probeer opnieuw te verbinden
                        </Link>
                        .
                      </span>
                    </p>
                  )}

                  {/* Saldo overgenomen (fase 8, FR8). Neutrale inkt en géén
                      stoplichtkleur: dit is een geslaagde feitelijke overname,
                      geen aandacht (`--warning`) en geen mislukking
                      (`--negative`). De tweede zin is er omdat het getal anders
                      uit de lucht komt vallen — het staat vanaf nu in de
                      herwaarderingshistorie en beweegt dus mee in het verloop
                      van je vermogen. */}
                  {hasCarrier && balanceChange && (
                    <p
                      className="mt-2 flex items-start gap-2 text-xs text-[var(--ink-2)]"
                      aria-live="polite"
                    >
                      {/* Eigen glyph, niet nóg een `Wallet`: die staat één regel
                          hoger voor "waar het landt". Twee identieke iconen onder
                          elkaar voor twee verschillende feiten vertraagt het
                          scannen. `History` zegt bovendien wat de tweede zin
                          belooft. */}
                      <History aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
                      <span>
                        Saldo overgenomen van de bank:{' '}
                        {/* Bedragen in DM Mono met tabular-nums — de twee getallen
                            staan naast elkaar en moeten op de komma uitlijnen. */}
                        <span className="font-mono tabular-nums">
                          {formatCurrencyDecimals(balanceChange.previous)}
                        </span>
                        {' → '}
                        <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
                          {formatCurrencyDecimals(balanceChange.current)}
                        </span>
                        . Vastgelegd in je vermogenshistorie.
                      </span>
                    </p>
                  )}

                  {correcting === acc.id && acc.bank_account_id && (
                    <CarrierCorrection
                      connectionAccountId={acc.id}
                      currentBankAccountId={acc.bank_account_id}
                      onDone={async () => {
                        setCorrecting(null)
                        await load()
                      }}
                      onCancel={() => setCorrecting(null)}
                    />
                  )}
                </div>

                {/* Voortgang. De eerste ophaal loopt in blokken tot twee jaar terug
                    en duurt daardoor merkbaar langer dan een gewone sync — zonder
                    deze regel lijkt de knop te hangen.

                    `--ink-2` op deze en alle uitkomstregels hieronder: `--ink-3`
                    haalt op 12px 3,65:1 en dus geen AA. */}
                {syncing === acc.id && (
                  <p className="mt-3 border-t border-[var(--border-ed)] pt-3 text-xs text-[var(--ink-2)]" aria-live="polite">
                    We halen zo veel mogelijk historie op bij je bank — dit duurt bij een
                    eerste koppeling even.
                  </p>
                )}

                {result && (
                  <div className="mt-3 space-y-2 border-t border-[var(--border-ed)] pt-3" aria-live="polite">
                    {result.fetched_from && (
                      <p className="text-xs text-[var(--ink-2)]">
                        Historie opgehaald vanaf {formatDateShort(result.fetched_from)}.
                      </p>
                    )}

                    {/* Laag 2 — dezelfde boeking die je eerder al importeerde. Dat
                        is de enige reden dat "al bekend" hoger kan uitvallen dan
                        wat je op grond van de hash zou verwachten; zonder deze
                        regel lijkt de teller onverklaarbaar. */}
                    {result.duplicates_cross_source > 0 && (
                      <p className="text-xs text-[var(--ink-2)]">
                        {result.duplicates_cross_source === 1
                          ? 'Eén transactie stond hier al vanuit een eerdere import en is niet nog eens toegevoegd.'
                          : `${result.duplicates_cross_source} transacties stonden hier al vanuit een eerdere import en zijn niet nog eens toegevoegd.`}
                      </p>
                    )}

                    {/* Afgekapte historie: de bánk stopte, niet wij. Eén regel die
                        zegt tot hoe ver het kwam en wat de route naar ouder is. */}
                    {result.truncated && (
                      <p className="flex items-start gap-1.5 text-xs text-[var(--ink-2)]">
                        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden />
                        <span>
                          Verder terug gaf je bank niet vrij. Oudere transacties kun je bijladen
                          via een{' '}
                          <Link href="/core/cash/import" className="underline underline-offset-2">
                            bestandsimport
                          </Link>
                          .
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {loading && (
        <div className="mt-8 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      )}

      <div className="mt-8">
        <Link
          href="/core/cash"
          className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-kern-700"
        >
          Naar Kas overzicht
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
