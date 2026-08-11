'use client'

/**
 * OwnAccountsSheet — "welke tegenrekeningen zijn van mij?"
 *
 * De gebruiker kiest een bankrekening en vinkt in de daadwerkelijk voorkomende
 * tegenpartijen aan welke van hem zijn. Die overboekingen tellen daarna als
 * verschuiving (budget "Eigen rekening") in plaats van als uitgave of inkomst.
 *
 * ## Waarom deze sheet de matching NIET zelf uitrekent
 *
 * De aangevinkt-status komt uit exact dezelfde twee functies die de import
 * gebruikt: `buildOwnAccountIdentifiers` (lib/own-accounts.ts) bouwt de
 * identifier-set, `isOwnAccountTransfer` (lib/parsers/categorize.ts) beslist per
 * tegenpartij. Een eigen vinkje-heuristiek hier zou stil uit elkaar lopen met wat
 * de import werkelijk doet — dan toont het scherm iets anders dan de app boekt.
 *
 * ## Geen supabase-client
 *
 * Alles loopt via `/api/own-accounts/{settings,counterparties,rules}`. De IBANs
 * van de eigen rekeningen zijn veldversleuteld (server-only sleutel) en muteren
 * hoort via een route (ADR 0058) — de vorige beheer-UI in `account-form-modal`
 * deed beide rechtstreeks vanuit de browser en is daarom vervangen.
 *
 * ## Geen vrijheidstijd bij deze bedragen — bewust
 *
 * De getoonde bedragen zijn VERSCHOVEN volume tussen eigen rekeningen, geen
 * uitgaven. Ze omrekenen naar vrijheidstijd zou suggereren dat het geld je
 * levenstijd kost, terwijl het juist niets kost — dat is precies de dubbeltelling
 * die deze feature wegneemt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Check, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  MIN_OWN_ACCOUNT_NAME_LENGTH,
  buildOwnAccountIdentifiers,
  normalizeIban,
} from '@/lib/own-accounts'
import { isOwnAccountTransfer } from '@/lib/parsers/categorize'
import { formatDateShort } from '@/lib/format'
import type {
  OwnAccountRule,
  OwnAccountSettingsAccount,
} from '@/app/api/own-accounts/settings/route'
import type { CounterpartySummary } from '@/app/api/own-accounts/counterparties/route'

/** Losse regel-invoer zoals `POST /api/own-accounts/rules` hem verwacht. */
type RuleInput = {
  matchType: 'iban' | 'name'
  matchValue: string
  label: string | null
}

/**
 * Zelfde losse vorm als de server (`IBAN_RE` in de rules-route). Bewust géén
 * mod-97-controle: een te strenge validator weigert geldige buitenlandse IBANs,
 * en een typefout kost hier niets (de regel matcht dan simpelweg nergens op).
 */
const IBAN_RE = /^[A-Z]{2}[0-9A-Z]{8,32}$/

const WINDOW_MONTHS = 24

/**
 * Hoeveel tegenpartijen de lijst standaard toont.
 *
 * De lijst komt al gesorteerd binnen met heen-én-weer-verkeer bovenaan — het
 * sterkste signaal dat iets een eigen rekening is — dus de eerste paar rijen zijn
 * bijna altijd wat je zoekt, en de staart is ruis (elke winkel waar je ooit pinde).
 * Een sheet die er zestig toont laat je scrollen langs precies de rijen die je
 * niet nodig hebt.
 *
 * Afkappen mag hier alleen omdat de rest bereikbaar blijft: het zoekveld erboven
 * en de "Toon alle"-knop eronder. Een stille cap zou de gebruiker laten geloven
 * dat dit al zijn tegenpartijen zijn.
 */
const LIST_LIMIT = 5

/**
 * Boven dit aantal geraakte tegenpartijen tonen we het naam-patroon als
 * WAARSCHUWING in plaats van als nuchtere telling. Geen blokkade: een gebruiker
 * met acht PayPal-varianten heeft gelijk. Wel een rem, want een naam-regel is een
 * onomkeerbare massa-mutatie (`transaction_type='transfer'`, oude budget-koppeling
 * overschreven) en `"ing"` raakt Booking.com, Parking én Verzekeringen tegelijk.
 */
const NAME_IMPACT_WARN_AT = 5

/** Hoeveel geraakte tegenpartijen we bij naam noemen — genoeg om te herkennen. */
const NAME_IMPACT_EXAMPLES = 3

const inputClass =
  'w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500'

function accountLabel(a: OwnAccountSettingsAccount): string {
  const tail = a.iban ? a.iban.slice(-4) : null
  return tail ? `${a.name} · ···${tail}` : a.name
}

/**
 * Wat er als regel wordt opgeslagen wanneer je een tegenpartij aanvinkt.
 *
 * De IBAN uit de transactie wordt hier gecontroleerd met dezelfde `IBAN_RE` als de
 * server. Dat is geen dubbelop-netheid: `lib/parsers/csv.ts` schrijft
 * `counterparty_iban` ZONDER vormcontrole, dus een oudere export levert
 * `"123456789"` of `"NOTPROVIDED"`. Zonder deze check zou zo'n rij een
 * IBAN-regel-invoer opleveren, en `POST /rules` weigert dan de HELE batch met één
 * 400 — inclusief de vier goede vinkjes en alle uitvink-acties, zonder dat uit de
 * melding blijkt wélke rij de dader was. We vallen daarom terug op de naam.
 */
function ruleInputFor(cp: CounterpartySummary): RuleInput | null {
  const name = (cp.name ?? '').trim()
  const iban = cp.iban ? normalizeIban(cp.iban) : ''
  if (iban && IBAN_RE.test(iban)) {
    return { matchType: 'iban', matchValue: iban, label: name || null }
  }
  // Zonder bruikbare IBAN blijft alleen een naam-substring over; te kort herkent te veel.
  if (name.length < MIN_OWN_ACCOUNT_NAME_LENGTH) return null
  return { matchType: 'name', matchValue: name, label: name }
}

/** Hoe een regel in mensentaal heet: het label, met de match eronder. */
function ruleMatchText(rule: { matchType: 'iban' | 'name'; matchValue: string }): string {
  return rule.matchType === 'name' ? `naam bevat "${rule.matchValue}"` : rule.matchValue
}

export function OwnAccountsSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Wordt na een geslaagde opslag aangeroepen zodat de pagina zich ververst. */
  onSaved: () => void
}) {
  const [rules, setRules] = useState<OwnAccountRule[]>([])
  const [accounts, setAccounts] = useState<OwnAccountSettingsAccount[]>([])
  const [unreadable, setUnreadable] = useState(0)
  const [loadingSettings, setLoadingSettings] = useState(false)

  const [accountId, setAccountId] = useState<string | null>(null)
  const [counterparties, setCounterparties] = useState<CounterpartySummary[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loadingCounterparties, setLoadingCounterparties] = useState(false)
  /**
   * Zoekterm over de tegenpartijlijst. Puur een WEERGAVE-filter: de delta
   * (`pendingAdd`/`pendingRemove`) is gekoppeld aan `cp.key` en regel-id's, niet
   * aan de zichtbare rijen. Een aangevinkte tegenpartij die je wegfiltert blijft
   * dus gewoon in de opslag zitten — zoeken mag nooit stilletjes een keuze
   * terugdraaien.
   */
  const [query, setQuery] = useState('')
  /** Lijst uitgeklapt? Standaard nee — dan tonen we de eerste {@link LIST_LIMIT}. */
  const [showAll, setShowAll] = useState(false)

  // De delta t.o.v. de begintoestand. Bewust losgekoppeld van de zichtbare lijst,
  // zodat een wissel van rekening je aangevinkte keuzes niet weggooit.
  const [pendingAdd, setPendingAdd] = useState<Map<string, RuleInput>>(new Map())
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set())
  const [manualAdds, setManualAdds] = useState<RuleInput[]>([])

  const [manualIban, setManualIban] = useState('')
  const [manualIbanLabel, setManualIbanLabel] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    let cancelled = false

    // De sheet blijft gemount (mount-latch in budgets-client), dus "Annuleer" is
    // niet meer dan `onClose` — zonder deze reset zou de ongesaved delta de
    // sluiting overleven en bij de volgende opslag alsnog meegaan. Dat is precies
    // het omgekeerde van wat "Annuleer" belooft: aangevinkte tegenpartijen zouden
    // opgeslagen lijken, een pendingRemove zou stilzwijgend een regel wissen, en
    // de groene melding van de vorige ronde zou als verse bevestiging staan.
    setPendingAdd(new Map())
    setPendingRemove(new Set())
    setManualAdds([])
    setManualIban('')
    setManualIbanLabel('')
    setManualName('')
    setManualError(null)
    setResult(null)
    // Ook de zoekterm en de uitklap-stand: een sheet die heropent met een oude
    // filter toont een halve lijst zonder dat de gebruiker weet waarom er iets
    // mist.
    setQuery('')
    setShowAll(false)

    setLoadingSettings(true)
    setError(null)
    fetch('/api/own-accounts/settings')
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok) {
          throw new Error(
            typeof json?.error === 'string' ? json.error : 'Je instellingen laden is niet gelukt.',
          )
        }
        return json
      })
      .then((json) => {
        if (cancelled) return
        const nextAccounts: OwnAccountSettingsAccount[] = json.accounts ?? []
        setRules(json.rules ?? [])
        setAccounts(nextAccounts)
        setUnreadable(json.unreadable ?? 0)
        setAccountId((prev) => prev ?? nextAccounts.find((a) => a.isActive)?.id ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Je instellingen laden is niet gelukt.')
      })
      .finally(() => {
        if (!cancelled) setLoadingSettings(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // ── Tegenpartijen van de gekozen rekening ────────────────────────────────
  useEffect(() => {
    if (!open || !accountId) return
    let cancelled = false
    setLoadingCounterparties(true)
    setCounterparties(null)
    setTruncated(false)
    fetch(
      `/api/own-accounts/counterparties?accountId=${encodeURIComponent(accountId)}&months=${WINDOW_MONTHS}`,
    )
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok) {
          throw new Error(
            typeof json?.error === 'string' ? json.error : 'De tegenpartijen ophalen is niet gelukt.',
          )
        }
        return json
      })
      .then((json) => {
        if (cancelled) return
        setCounterparties(json.counterparties ?? [])
        setTruncated(Boolean(json.truncated))
        // Een geslaagde ophaal ruimt de vorige foutmelding op. Zonder dit bleef de
        // rode banner van één mislukte rekening staan terwijl de gebruiker daarna
        // succesvol tussen rekeningen wisselde.
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setCounterparties([])
        setError(e instanceof Error ? e.message : 'De tegenpartijen ophalen is niet gelukt.')
      })
      .finally(() => {
        if (!cancelled) setLoadingCounterparties(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, accountId])

  // ── Afgeleide aangevinkt-status ──────────────────────────────────────────
  // Alleen de IBANs van je eigen bankrekeningen: die matchen zonder dat er een
  // regel voor bestaat, dus daar valt niets uit te vinken.
  const accountOnlyIds = useMemo(
    () => buildOwnAccountIdentifiers([], accounts.map((a) => a.iban)),
    [accounts],
  )

  // Per regel een eigen identifier-set, zodat we weten wélke regel een
  // tegenpartij aanvinkt — nodig om 'm bij uitvinken gericht te verwijderen.
  const ruleMatchers = useMemo(
    () =>
      rules.map((rule) => ({
        rule,
        ids: buildOwnAccountIdentifiers(
          [{ match_type: rule.matchType, match_value: rule.matchValue }],
          [],
        ),
      })),
    [rules],
  )

  const rows = useMemo(() => {
    return (counterparties ?? []).map((cp) => {
      const locked = isOwnAccountTransfer(
        cp.iban,
        accountOnlyIds.ibans,
        cp.name,
        accountOnlyIds.namePatterns,
      )
      // Alleen voor NIET-vaste rijen. Een vaste rij toont geen checkbox, dus een
      // regel die alléén dáár op matcht zou nergens meer te bereiken zijn: niet
      // uit te vinken hier, en uitgefilterd in `orphanRules` hieronder. Zo'n regel
      // ontstaat echt — de sleepmodus maakt er via `lib/category-rules.ts` één voor
      // een tegenpartij die óók je eigen bankrekening is. Door hier leeg te laten
      // valt hij vanzelf in het orphan-blok, mét verwijderknop.
      const matchedRules = locked
        ? []
        : ruleMatchers
            .filter((m) => isOwnAccountTransfer(cp.iban, m.ids.ibans, cp.name, m.ids.namePatterns))
            .map((m) => m.rule)
      const matchedRuleIds = matchedRules.map((r) => r.id)
      const activeMatch = matchedRuleIds.some((id) => !pendingRemove.has(id))
      const input = ruleInputFor(cp)
      const unusable = !locked && matchedRuleIds.length === 0 && input === null
      return {
        cp,
        locked,
        matchedRules,
        matchedRuleIds,
        input,
        checked: locked || activeMatch || pendingAdd.has(cp.key),
        /** Geen bruikbare IBAN én een te korte naam: hier valt geen regel van te maken. */
        unusable,
        /** Waaróm er niets aan te vinken valt — een lege rij zonder reden is een doodlopend eind. */
        unusableReason: !unusable
          ? null
          : cp.iban
            ? 'Het rekeningnummer op deze boekingen is geen bruikbare IBAN, en de naam is te kort om op te herkennen.'
            : 'Geen IBAN en een te korte naam om op te herkennen.',
        /** IBAN aanwezig maar onbruikbaar: we herkennen op naam, en dat is breder. */
        fallbackToName: Boolean(cp.iban) && input?.matchType === 'name',
        /** Uitgevinkt terwijl er regels op matchen = die regels verdwijnen bij opslaan. */
        removesRules: !locked && matchedRules.length > 0 && matchedRuleIds.every((id) => pendingRemove.has(id)),
      }
    })
  }, [counterparties, accountOnlyIds, ruleMatchers, pendingAdd, pendingRemove])

  type Row = (typeof rows)[number]

  /**
   * De zichtbare rijen. Matcht op naam én IBAN, want je zoekt soms op "spaar" en
   * soms op de laatste cijfers van een rekeningnummer. Spaties in de zoekterm
   * worden genegeerd bij de IBAN-vergelijking — niemand typt een IBAN met de
   * groepjes zoals de bank hem afdrukt.
   */
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    const qIban = q.replace(/\s/g, '')
    return rows.filter((row) => {
      const name = (row.cp.name ?? '').toLowerCase()
      const iban = (row.cp.iban ?? '').toLowerCase()
      return name.includes(q) || (qIban.length > 0 && iban.includes(qIban))
    })
  }, [rows, query])

  /**
   * De daadwerkelijk getoonde rijen. De lijst is standaard afgekapt op
   * {@link LIST_LIMIT}: hij is al gesorteerd op "heen-én-weer eerst", dus de
   * eigen rekeningen staan bovenaan en de staart is bijna altijd ruis. Zoeken is
   * de manier om er gericht doorheen te komen; "Toon alle" is de manier om te
   * bladeren.
   */
  const renderedRows = useMemo(
    () => (showAll ? visibleRows : visibleRows.slice(0, LIST_LIMIT)),
    [visibleRows, showAll],
  )

  /**
   * Aangevinkt maar niet in beeld — door de zoekterm óf door de afkapping.
   * Zonder deze telling lijkt een vinkje verdwenen zodra het buiten de eerste
   * vijf valt, en vinkt de gebruiker dezelfde tegenpartij nog een keer aan.
   */
  const hiddenCheckedCount = useMemo(
    () => rows.filter((r) => r.checked).length - renderedRows.filter((r) => r.checked).length,
    [rows, renderedRows],
  )

  const toggle = useCallback((row: Row) => {
    if (row.locked || row.unusable) return
    setResult(null)
    if (row.checked) {
      setPendingAdd((prev) => {
        if (!prev.has(row.cp.key)) return prev
        const next = new Map(prev)
        next.delete(row.cp.key)
        return next
      })
      if (row.matchedRuleIds.length > 0) {
        setPendingRemove((prev) => {
          const next = new Set(prev)
          for (const id of row.matchedRuleIds) next.add(id)
          return next
        })
      }
      return
    }
    if (row.matchedRuleIds.length > 0) {
      // Een eerder uitgevinkte regel weer aanzetten = de verwijdering intrekken.
      setPendingRemove((prev) => {
        const next = new Set(prev)
        for (const id of row.matchedRuleIds) next.delete(id)
        return next
      })
      return
    }
    if (!row.input) return
    setPendingAdd((prev) => new Map(prev).set(row.cp.key, row.input as RuleInput))
  }, [])

  // Regels die hierboven bij geen enkele AANVINKBARE tegenpartij horen — zonder
  // dit blokje zou de gebruiker ze nooit meer kwijt kunnen. Vaste rijen leveren
  // bewust geen match (zie `rows`), dus een regel die alleen dáárop past komt hier
  // terecht in plaats van te verdwijnen.
  const orphanRules = useMemo(() => {
    if (counterparties === null) return []
    const matched = new Set(rows.flatMap((r) => r.matchedRuleIds))
    return rules.filter((r) => !matched.has(r.id) && !pendingRemove.has(r.id))
  }, [counterparties, rows, rules, pendingRemove])

  // Wat er bij opslaan verdwijnt. Een regel geldt op ál je rekeningen, dus een
  // vinkje weghalen bij één tegenpartij kan boekingen op rekeningen die hier niet
  // in beeld staan weer als uitgave laten tellen. Dat hoort zichtbaar te zijn
  // vóórdat er op Opslaan wordt gedrukt, niet erna.
  const removedRules = useMemo(
    () => rules.filter((r) => pendingRemove.has(r.id)),
    [rules, pendingRemove],
  )

  // ── Impact van een handmatig naam-patroon ────────────────────────────────
  // Een naam-regel is een lowercase substring-match over ál je transacties, en de
  // omzetting is niet terug te draaien. De sheet heeft de complete tegenpartijlijst
  // van deze rekening al binnen; die telt hier live mee hoe breed het patroon
  // grijpt. Bewust via `isOwnAccountTransfer` — een eigen `includes` hier zou stil
  // uit elkaar kunnen lopen met wat de import straks werkelijk doet.
  const nameImpact = useMemo(() => {
    const value = manualName.trim()
    if (value.length < MIN_OWN_ACCOUNT_NAME_LENGTH || !counterparties) return null
    const ids = buildOwnAccountIdentifiers([{ match_type: 'name', match_value: value }], [])
    const hits = counterparties.filter((cp) =>
      isOwnAccountTransfer(cp.iban, ids.ibans, cp.name, ids.namePatterns),
    )
    return {
      hits: hits.length,
      total: counterparties.length,
      examples: hits.slice(0, NAME_IMPACT_EXAMPLES).map((cp) => cp.name?.trim() || cp.iban || '—'),
      more: Math.max(0, hits.length - NAME_IMPACT_EXAMPLES),
    }
  }, [manualName, counterparties])

  // ── Handmatig toevoegen ──────────────────────────────────────────────────
  function addManualIban() {
    const value = normalizeIban(manualIban)
    if (!value) return
    if (!IBAN_RE.test(value)) {
      setManualError('Dat lijkt geen IBAN. Vul hem in zoals NL91ABNA0417164300.')
      return
    }
    setManualError(null)
    setResult(null)
    setManualAdds((prev) => [
      ...prev.filter((r) => !(r.matchType === 'iban' && r.matchValue === value)),
      { matchType: 'iban', matchValue: value, label: manualIbanLabel.trim() || null },
    ])
    setManualIban('')
    setManualIbanLabel('')
  }

  function addManualName() {
    const value = manualName.trim()
    if (!value) return
    if (value.length < MIN_OWN_ACCOUNT_NAME_LENGTH) {
      setManualError(
        `Een naam moet minstens ${MIN_OWN_ACCOUNT_NAME_LENGTH} tekens hebben — korter herkent te veel.`,
      )
      return
    }
    setManualError(null)
    setResult(null)
    setManualAdds((prev) => [
      ...prev.filter((r) => !(r.matchType === 'name' && r.matchValue.toLowerCase() === value.toLowerCase())),
      { matchType: 'name', matchValue: value, label: value },
    ])
    setManualName('')
  }

  // ── Opslaan ──────────────────────────────────────────────────────────────
  const hasChanges = pendingAdd.size > 0 || pendingRemove.size > 0 || manualAdds.length > 0

  async function save() {
    // Wát de gebruiker deed, vastgelegd vóór de reset. De herclassificatie draait
    // server-side ONVOORWAARDELIJK over de volle historie met de overgebleven
    // regels — ook na een pure verwijder-actie. Zonder dit onderscheid zou de sheet
    // "N transacties omgezet" melden direct nadat iemand een vinkje wéghaalde: het
    // tegenovergestelde van wat hij deed.
    const addedCount = pendingAdd.size + manualAdds.length
    const removedCount = pendingRemove.size

    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/own-accounts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add: [...pendingAdd.values(), ...manualAdds],
          remove: [...pendingRemove],
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Opslaan is niet gelukt.')
        return
      }
      setRules(json.rules ?? [])
      setPendingAdd(new Map())
      setPendingRemove(new Set())
      setManualAdds([])
      const n: number = json.reclassified ?? 0
      const converted =
        n > 0 ? `${n} transactie${n === 1 ? '' : 's'} omgezet naar Eigen rekening.` : null
      const removedPart = `${removedCount} regel${removedCount === 1 ? '' : 's'} verwijderd — nieuwe overboekingen tellen daar weer mee. Wat al omgezet was blijft staan.`
      setResult(
        removedCount === 0
          ? (converted ?? 'Regels opgeslagen. Geen bestaande transacties hoefden omgezet.')
          : addedCount === 0
            ? converted
              ? `${removedPart} Je overige regels zetten nog ${n} andere transactie${n === 1 ? '' : 's'} om naar Eigen rekening.`
              : removedPart
            : `Regels bijgewerkt. ${converted ?? 'Geen bestaande transacties hoefden omgezet.'}`,
      )
      onSaved()
    } catch {
      setError('Opslaan is niet gelukt. Controleer je verbinding.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Handmatig herstelpad: de regels staan al goed, maar de historie loopt achter
   * (bv. transacties geïmporteerd vóórdat een regel bestond, of een sleepmodus-regel
   * die alleen vooruit werkte). Draait dezelfde omzetlus als opslaan, zonder de
   * regels te wijzigen.
   */
  async function reclassify() {
    setReclassifying(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/own-accounts/reclassify', { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          typeof json?.error === 'string' ? json.error : 'Opnieuw indelen is niet gelukt.',
        )
        return
      }
      const n: number = json?.reclassified ?? 0
      setResult(
        n > 0
          ? `${n} bestaande transactie${n === 1 ? '' : 's'} alsnog op Eigen rekening gezet.`
          : 'Je historie stond al goed ingedeeld — er is niets veranderd.',
      )
      if (n > 0) onSaved()
    } catch {
      setError('Opnieuw indelen is niet gelukt. Controleer je verbinding.')
    } finally {
      setReclassifying(false)
    }
  }

  const activeAccounts = accounts.filter((a) => a.isActive)

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="sheet"
      size="md"
      title="Eigen rekeningen"
      footer={
        <ModalFooter
          primary={{
            label: 'Opslaan',
            onClick: () => void save(),
            loading: saving,
            disabled: !hasChanges || reclassifying,
          }}
          secondary={{ label: hasChanges ? 'Annuleer' : 'Sluiten', onClick: onClose }}
        />
      }
    >
      <div className="space-y-6 p-5">
        {/* ── Uitleg ─────────────────────────────────────────────────────── */}
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Sommige tegenrekeningen zijn van jou: een tweede bank, je spaarrekening, PayPal of je
          broker. Geld dat daarheen gaat geef je niet uit — je verschuift het. Vink hieronder aan
          welke tegenpartijen van jou zijn; die overboekingen tellen daarna{' '}
          <span className="font-medium text-[var(--ink)]">niet meer mee als uitgave of inkomst</span>,
          en verschijnen onder Eigen rekening.
        </p>

        {/* Fouten blijven staan, de sheet gaat niet dicht. */}
        {error && (
          <p
            role="alert"
            className="border border-negative/40 bg-negative/5 px-3 py-2 text-sm text-negative"
          >
            {error}
          </p>
        )}

        {/* ── Rekening-kiezer ────────────────────────────────────────────── */}
        <div>
          <label
            htmlFor="own-accounts-account"
            className="mb-1 block text-sm font-medium text-[var(--ink-2)]"
          >
            Selecteer je eigen rekening vanaf deze rekening
          </label>
          <select
            id="own-accounts-account"
            value={accountId ?? ''}
            onChange={(e) => setAccountId(e.target.value || null)}
            disabled={loadingSettings || activeAccounts.length === 0}
            className={inputClass}
          >
            {activeAccounts.length === 0 && <option value="">Geen actieve rekening</option>}
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-4)]">
            Uit de laatste {WINDOW_MONTHS} maanden. Tegenpartijen waar geld héén én vandaan ging
            staan bovenaan — dat is het sterkste teken dat het een eigen rekening is.
          </p>
          {unreadable > 0 && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
              Van {unreadable} van je rekeningen kunnen we de IBAN niet lezen. Tegenpartijen die
              daarmee overeenkomen herkennen we niet vanzelf — vink ze hieronder aan.
            </p>
          )}
        </div>

        {/* ── Truncatie: nooit stil afkappen ─────────────────────────────── */}
        {truncated && (
          <p
            role="status"
            className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-3)]"
          >
            Je historie op deze rekening is zo groot dat we niet alles hebben doorzocht. Er kunnen
            dus tegenpartijen ontbreken in de lijst hieronder — die voeg je onderaan handmatig toe.
          </p>
        )}

        {/* ── Tegenpartij-lijst ──────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Tegenpartijen
            </h3>
            {rows.length > 0 && (
              <span className="text-[11px] tabular-nums text-[var(--ink-4)]">
                {renderedRows.length < rows.length
                  ? `${renderedRows.length} van ${rows.length}`
                  : `${rows.length}`}
              </span>
            )}
          </div>
          {rows.length > 0 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-4)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op naam of IBAN"
                aria-label="Zoek een tegenpartij op naam of IBAN"
                className={`${inputClass} pl-8`}
              />
            </div>
          )}
          {loadingCounterparties || loadingSettings ? (
            <p className="py-6 text-center text-sm text-[var(--ink-3)]">Even ophalen…</p>
          ) : rows.length === 0 ? (
            <p className="border border-dashed border-[var(--border-ed)] px-4 py-6 text-center text-sm text-[var(--ink-3)]">
              Nog geen tegenpartijen op deze rekening. Zodra je transacties importeert of koppelt,
              verschijnen ze hier.
            </p>
          ) : visibleRows.length === 0 ? (
            <p className="border border-dashed border-[var(--border-ed)] px-4 py-6 text-center text-sm text-[var(--ink-3)]">
              Geen tegenpartij die past bij &ldquo;{query.trim()}&rdquo;. Staat hij er echt niet
              tussen, voeg hem dan hieronder handmatig toe.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
                {renderedRows.map((row) => (
                  <CounterpartyRow key={row.cp.key} row={row} onToggle={() => toggle(row)} />
                ))}
              </ul>
              {/* De uitweg uit de afkapping. Zonder deze knop zou de lijst stil
                  ophouden bij vijf en zou een zesde eigen rekening onbereikbaar
                  zijn voor wie niet op het idee komt te zoeken. */}
              {visibleRows.length > LIST_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAll((prev) => !prev)}
                  className="mt-2 text-[11px] font-medium text-[var(--ink-3)] underline underline-offset-2 hover:text-[var(--ink)] transition-colors"
                >
                  {showAll
                    ? `Toon alleen de eerste ${LIST_LIMIT}`
                    : `Toon alle ${visibleRows.length} tegenpartijen`}
                </button>
              )}
            </>
          )}
          {/* Zoeken en afkappen zijn allebei WEERGAVE, geen keuze-reset. Zeg dat,
              anders lijkt een vinkje buiten beeld verdwenen en vinkt de gebruiker
              dezelfde tegenpartij nog een keer aan. */}
          {hiddenCheckedCount > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-4)]">
              {hiddenCheckedCount === 1
                ? 'Nog 1 aangevinkte tegenpartij staat buiten deze lijst — die blijft gewoon staan bij opslaan.'
                : `Nog ${hiddenCheckedCount} aangevinkte tegenpartijen staan buiten deze lijst — die blijven gewoon staan bij opslaan.`}
            </p>
          )}
        </div>

        {/* ── Regels die hier niet voorkomen ─────────────────────────────── */}
        {orphanRules.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Ook aangemerkt als eigen rekening
            </h3>
            <p className="mb-2 text-[11px] leading-relaxed text-[var(--ink-4)]">
              Deze regels horen niet bij een aanvinkbare tegenpartij hierboven, maar gelden wel op
              al je rekeningen. Hier haal je ze weg.
            </p>
            <ul className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
              {orphanRules.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--ink-2)]">
                      {r.label ?? r.matchValue}
                    </span>
                    <span className="block font-mono text-[11px] text-[var(--ink-4)]">
                      {r.matchType === 'name' ? `naam bevat "${r.matchValue}"` : r.matchValue}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null)
                      setPendingRemove((prev) => new Set(prev).add(r.id))
                    }}
                    aria-label={`${r.label ?? r.matchValue} verwijderen als eigen rekening`}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[var(--ink-4)] transition-colors hover:text-negative"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Handmatig toevoegen ────────────────────────────────────────── */}
        <div className="border-t border-[var(--border-ed)] pt-4">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Staat er iets niet bij?
          </h3>
          <p className="mb-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
            Voeg een rekening toe met haar IBAN, of — als die er niet is — met de naam waarmee ze op
            je afschrift staat (bijvoorbeeld PayPal). Een naam moet minstens{' '}
            {MIN_OWN_ACCOUNT_NAME_LENGTH} tekens hebben, want we herkennen hem als deel van de
            tegenpartij-naam.
          </p>

          {manualAdds.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {manualAdds.map((r) => (
                <li
                  key={`${r.matchType}:${r.matchValue}`}
                  className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)]/50 py-1 pl-2.5 pr-1 text-[11px] text-[var(--ink-2)]"
                >
                  <span className="font-mono">{r.matchValue}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setManualAdds((prev) =>
                        prev.filter(
                          (x) => !(x.matchType === r.matchType && x.matchValue === r.matchValue),
                        ),
                      )
                    }
                    aria-label={`${r.matchValue} weer weghalen`}
                    className="inline-flex h-6 w-6 items-center justify-center text-[var(--ink-4)] transition-colors hover:text-negative"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={manualIban}
                onChange={(e) => setManualIban(e.target.value.toUpperCase())}
                placeholder="NL91ABNA0417164300"
                aria-label="IBAN van een eigen rekening"
                className={`${inputClass} flex-1 font-mono text-xs`}
              />
              <input
                type="text"
                value={manualIbanLabel}
                onChange={(e) => setManualIbanLabel(e.target.value)}
                placeholder="Label (optioneel)"
                aria-label="Label bij deze IBAN"
                className={`${inputClass} w-32 text-xs`}
              />
              <button
                type="button"
                onClick={addManualIban}
                aria-label="IBAN toevoegen"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--border-md)] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Naam, bijvoorbeeld PayPal"
                aria-label="Naam van een eigen rekening"
                className={`${inputClass} flex-1 text-xs`}
              />
              <button
                type="button"
                onClick={addManualName}
                aria-label="Naam toevoegen"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--border-md)] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {/* Zien vóór opslaan hoe breed dit patroon grijpt. Een naam-regel zet
                elke match op verschuiving — dat verdwijnt uit je uitgaven en is
                niet terug te draaien, dus de telling hoort vóór de knop te staan,
                niet in de melding erna. */}
            {nameImpact && (
              <div
                aria-live="polite"
                className={
                  nameImpact.hits > NAME_IMPACT_WARN_AT
                    ? 'flex items-start gap-2 border border-warning/40 bg-warning-bg px-3 py-2'
                    : 'px-0.5'
                }
              >
                {nameImpact.hits > NAME_IMPACT_WARN_AT && (
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                )}
                <p
                  className={`text-[11px] leading-relaxed tabular-nums ${
                    nameImpact.hits > NAME_IMPACT_WARN_AT
                      ? 'text-[var(--ink)]'
                      : 'text-[var(--ink-3)]'
                  }`}
                >
                  {`Raakt ${nameImpact.hits} van de ${nameImpact.total} tegenpartijen op deze rekening`}
                  {nameImpact.examples.length > 0 && (
                    <>
                      : {nameImpact.examples.join(', ')}
                      {nameImpact.more > 0 && ` en nog ${nameImpact.more}`}
                    </>
                  )}
                  .
                  {nameImpact.hits > NAME_IMPACT_WARN_AT && (
                    <>
                      {' '}
                      Dat is breed voor een eigen rekening. Al die boekingen tellen daarna niet meer
                      als uitgave, en dat draai je niet terug — maak de naam specifieker als er
                      vreemden tussen staan.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
          {manualError && (
            <p role="alert" className="mt-2 text-[12px] text-negative">
              {manualError}
            </p>
          )}
        </div>

        {/* ── Wat er bij opslaan verdwijnt ───────────────────────────────── */}
        {/* Een uitgevinkte tegenpartij verwijdert géén tegenpartij maar een REGEL,
            en die kan veel breder gelden dan de rij waar het vinkje uit ging: op
            andere rekeningen, bij andere tegenpartijen. Dat hoort in beeld te staan
            vlak boven de Opslaan-knop, niet pas in het resultaat. */}
        {removedRules.length > 0 && (
          <div
            role="status"
            className="flex items-start gap-2.5 border border-warning/40 bg-warning-bg px-3 py-2.5"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0 text-[12px] leading-relaxed text-[var(--ink)]">
              <p className="font-medium">
                Bij opslaan verdwijn{removedRules.length === 1 ? 't' : 'en'} {removedRules.length}{' '}
                regel{removedRules.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-1 space-y-0.5">
                {removedRules.map((r) => (
                  <li key={r.id} className="truncate font-mono text-[11px] text-[var(--ink-2)]">
                    {ruleMatchText(r)}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-[var(--ink-2)]">
                Een regel geldt op al je rekeningen. Overboekingen die er elders op matchen — ook
                die je hier niet ziet — tellen daarna weer als uitgave of inkomst mee.
              </p>
            </div>
          </div>
        )}

        {/* ── Wat opslaan wél en niet doet ───────────────────────────────── */}
        <p className="border-t border-[var(--border-ed)] pt-4 text-[12px] leading-relaxed text-[var(--ink-3)]">
          Bij opslaan zetten we ook je bestaande transacties met deze tegenpartijen om naar Eigen
          rekening. Haal je later een vinkje weg, dan tellen nieuwe overboekingen weer gewoon mee —
          maar wat al omgezet is blijft staan, zodat je eigen correcties niet worden overschreven.
        </p>

        {/* Status na opslaan; regio blijft gemount zodat de melding wordt voorgelezen. */}
        <p
          aria-live="polite"
          className={result ? 'text-sm font-medium text-positive' : 'sr-only'}
        >
          {result}
        </p>

        {/* ── Handmatig herstelpad ───────────────────────────────────────── */}
        {/* Voor het geval de regels al kloppen maar de historie achterloopt — bv.
            transacties die zijn geïmporteerd vóórdat de regel bestond. Bewust
            onopvallend: het normale pad is Opslaan, dat doet dit al mee. */}
        <div className="border-t border-[var(--border-ed)] pt-4">
          <button
            type="button"
            onClick={() => void reclassify()}
            disabled={reclassifying || saving}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-4 transition-colors hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${reclassifying ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {reclassifying ? 'Bezig met opnieuw indelen…' : 'Bestaande transacties opnieuw indelen'}
          </button>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-4)]">
            Loopt je historie achter op je regels — bijvoorbeeld door een import van vóór het
            aanvinken — dan haalt dit hem bij. Er verandert niets aan je regels.
          </p>
        </div>
      </div>
    </ShellOverlay>
  )
}

// ── Eén tegenpartij-rij ─────────────────────────────────────────────────────

function CounterpartyRow({
  row,
  onToggle,
}: {
  row: {
    cp: CounterpartySummary
    locked: boolean
    checked: boolean
    unusable: boolean
    unusableReason: string | null
    fallbackToName: boolean
    removesRules: boolean
    matchedRules: OwnAccountRule[]
  }
  onToggle: () => void
}) {
  const { cp, locked, checked, unusable, unusableReason, fallbackToName, removesRules } = row
  const title = cp.name?.trim() || cp.iban || 'Onbekende tegenpartij'
  const ibanTail = cp.iban && cp.name?.trim() ? `···${cp.iban.slice(-4)}` : null
  const bothWays = cp.outgoingCount > 0 && cp.incomingCount > 0
  const total = cp.outgoingTotal + cp.incomingTotal

  const body = (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-medium text-[var(--ink)]">{title}</span>
        {ibanTail && (
          <span className="font-mono text-[11px] text-[var(--ink-4)]">{ibanTail}</span>
        )}
        {bothWays && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-kern-700">
            <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
            heen en weer
          </span>
        )}
      </span>
      <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--ink-3)] tabular-nums">
        {cp.outgoingCount}× uit · {cp.incomingCount}× in ·{' '}
        <MaskedAmount value={total} tone="ink" />
        {cp.lastDate && <> · laatst {formatDateShort(cp.lastDate)}</>}
        {cp.transferCount > 0 && (
          <> · {cp.transferCount} al als verschuiving geboekt</>
        )}
      </span>
      {locked && (
        <span className="mt-0.5 block text-[11px] italic text-[var(--ink-4)]">
          Dit is een van je eigen rekeningen — die herkennen we altijd.
        </span>
      )}
      {unusable && unusableReason && (
        <span className="mt-0.5 block text-[11px] italic text-[var(--ink-4)]">
          {unusableReason}
        </span>
      )}
      {/* De IBAN op deze boekingen is onbruikbaar (oudere exports schrijven daar
          soms "NOTPROVIDED" of een rekeningnummer zonder landcode). We maken er dan
          een naam-regel van — die grijpt breder, dus dat zeggen we. */}
      {!unusable && fallbackToName && (
        <span className="mt-0.5 block text-[11px] italic text-[var(--ink-4)]">
          Het rekeningnummer op deze boekingen is geen bruikbare IBAN; we herkennen deze op naam —
          dat raakt ook andere tegenpartijen met dezelfde naam.
        </span>
      )}
    </span>
  )

  /**
   * Uitgevinkt terwijl er regels op matchen: die regels worden VERWIJDERD, niet
   * deze ene tegenpartij uitgezonderd — en een regel geldt op ál je rekeningen.
   *
   * Staat bewust BUITEN het `<label>`: binnen de label zou elke klik op de
   * waarschuwing (of op de tekst die je wilt selecteren om te lezen) het vinkje
   * weer aanzetten en de melding laten verdwijnen.
   */
  const removalNotice = removesRules ? (
    <div className="mb-3 ml-7 flex items-start gap-1.5 border border-warning/40 bg-warning-bg px-2 py-1.5">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-[11px] leading-relaxed text-[var(--ink)]">
        {`Verwijdert bij opslaan de regel${row.matchedRules.length === 1 ? '' : 's'} `}
        <span className="font-mono">
          {row.matchedRules.map((r) => ruleMatchText(r)).join(', ')}
        </span>
        {' — die geldt ook op je andere rekeningen en bij andere tegenpartijen.'}
      </p>
    </div>
  ) : null

  // Vaste rij: er is geen regel om te verwijderen, dus geen dode checkbox.
  if (locked) {
    return (
      <li className="flex items-start gap-3 py-3">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
        {body}
      </li>
    )
  }

  return (
    <li>
      <label
        className={`flex items-start gap-3 pt-3 ${removesRules ? 'pb-2' : 'pb-3'} ${unusable ? 'opacity-60' : 'cursor-pointer'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={unusable}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 shrink-0 accent-kern-600 disabled:cursor-not-allowed"
        />
        {body}
      </label>
      {removalNotice}
    </li>
  )
}
