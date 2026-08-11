import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { normalizeIban } from '@/lib/own-accounts'

/**
 * GET /api/own-accounts/counterparties?accountId=<uuid>&months=24
 *
 * De tegenpartijen die op één bankrekening voorkomen, samengevoegd per
 * tegenrekening. Dit is de "makkelijker"-kant van de eigen-rekening-instelling:
 * in plaats van een IBAN over te typen kiest de gebruiker een rekening en vinkt
 * hij in de opgehaalde lijst aan welke tegenpartijen zijn eigen rekeningen zijn.
 *
 * ## Waarom de aggregatie hier gebeurt en niet in de database
 *
 * Er ligt een RPC-precedent voor tegenpartij-aggregatie
 * (`tx_counterparty_suggestions`, spend-limits), maar dat is een migratie en die
 * hoeft hier niet: één rekening levert een begrensde hoeveelheid rijen en de
 * lus hieronder is hetzelfde pagineringspatroon dat `reclassify` al gebruikt.
 * De reden dat er ÜBERHAUPT gepagineerd wordt is niet netheid maar een val:
 * PostgREST kapt elk antwoord af op `max_rows` (1000), stil, óók bij een hogere
 * `.limit()`. Eén rechttoe-rechtaan select zou bij een gebruiker met historie
 * dus een onvolledige tegenpartijlijst opleveren die er compleet uitziet — en een
 * ontbrekende eigen rekening is precies de dubbeltelling die deze feature moet
 * wegnemen.
 *
 * ## `truncated` is geen sierraad
 *
 * Boven `MAX_PAGES` stoppen we met scannen en zeggen dat ook. Een stille cap zou
 * de sheet laten suggereren dat dit álle tegenpartijen zijn; de gebruiker vinkt
 * dan af wat hij ziet en mist de rest zonder dat iets faalt. De handmatige
 * IBAN-/naam-invoer in de sheet blijft de uitweg voor wat buiten het venster valt.
 *
 * ## Scoping
 *
 * Geen expliciet `user_id`-filter: de SELECT-policy op `transactions` is
 * huishoud-verbreed (`auth.uid() = user_id OR (ownership='shared' AND
 * household_id = user_household_id())`). Op een gedeelde rekening horen de
 * tegenpartijen van je partner er gewoon bij — het is dezelfde rekening. Een
 * persoonlijke rekening van de partner blijft door RLS onzichtbaar. Dit is een
 * LEES; de schrijfkant (`reclassifyOwnAccountTransfers`) filtert wél op `user_id`.
 */

/** Maximaal aantal pagina's van 1000 rijen dat we scannen voordat we `truncated` melden. */
const MAX_PAGES = 25
const PAGE_SIZE = 1000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface CounterpartySummary {
  /** Stabiele sleutel: `iban:<genormaliseerd>` of `name:<lowercase>`. */
  key: string
  iban: string | null
  name: string | null
  outgoingCount: number
  incomingCount: number
  /** Positief bedrag: som van wat er naar deze tegenpartij ging. */
  outgoingTotal: number
  /** Positief bedrag: som van wat er van deze tegenpartij kwam. */
  incomingTotal: number
  lastDate: string | null
  /** Aantal rijen dat al als verschuiving geboekt staat. */
  transferCount: number
}

export interface CounterpartiesResponse {
  counterparties: CounterpartySummary[]
  windowMonths: number
  scanned: number
  truncated: boolean
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims) return unauthorized()

    const url = new URL(req.url)
    const accountId = (url.searchParams.get('accountId') ?? '').trim()
    if (!UUID_RE.test(accountId)) {
      return badRequest('Ongeldige rekening.', 'validation_error')
    }

    const monthsRaw = Number(url.searchParams.get('months') ?? '24')
    const windowMonths = Number.isFinite(monthsRaw)
      ? Math.min(120, Math.max(1, Math.round(monthsRaw)))
      : 24

    const since = new Date()
    since.setMonth(since.getMonth() - windowMonths)
    const sinceIso = since.toISOString().slice(0, 10)

    type Row = {
      counterparty_iban: string | null
      counterparty_name: string | null
      amount: number | string | null
      date: string | null
      transaction_type: string | null
    }

    const groups = new Map<string, CounterpartySummary & { nameVariants: Map<string, number> }>()
    let scanned = 0
    let truncated = false

    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) {
        truncated = true
        break
      }
      const from = page * PAGE_SIZE
      const { data, error } = await supabase
        .from('transactions')
        .select('counterparty_iban, counterparty_name, amount, date, transaction_type')
        .eq('account_id', accountId)
        .gte('date', sinceIso)
        // `id` als tweede sorteersleutel is GEEN netheid — het is wat
        // offset-paginering correct maakt. `date` is niet uniek (tientallen rijen
        // per dag), en Postgres geeft binnen zo'n gelijkspel-groep geen stabiele
        // volgorde tussen twee losse queries. Zonder tiebreak kan een tegenpartij
        // die precies op de paginagrens zit in béide queries wegvallen — en dan
        // blijft `truncated` gewoon `false`, dus de sheet meldt niets, de gebruiker
        // ziet zijn spaarrekening niet in de lijst en vinkt hem niet aan. Precies de
        // stille onvolledigheid die deze route moet uitsluiten.
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      // Bewust hard falen i.p.v. teruggeven wat we tot nu toe hadden: een halve
      // lijst is niet te onderscheiden van een volledige.
      if (error) return serverError(error, 'own-accounts-counterparties:GET')

      const rows = (data ?? []) as Row[]
      scanned += rows.length

      for (const r of rows) {
        const iban = r.counterparty_iban && r.counterparty_iban.trim()
          ? normalizeIban(r.counterparty_iban)
          : null
        const rawName = (r.counterparty_name ?? '').trim()
        // BEWUST géén `\s+ → ' '`-collapse. De groepssleutel moet exact dezelfde
        // grootheid zijn als de regel die eruit voortkomt: `POST /rules` slaat
        // `matchValue.trim().toLowerCase()` op en `isOwnAccountTransfer` doet
        // `name.toLowerCase().includes(pattern)` — allebei zónder collapse.
        // Collapsten we hier wél, dan zou een groep met 40× "PAYPAL  EUROPE"
        // (dubbele spatie, komt zo uit MT940/vaste-breedte-exports) en 25×
        // "PayPal Europe" als één rij van 65 tonen, terwijl de regel die eruit
        // rolt er maar 40 raakt. De gebruiker leest dan "40 omgezet" bij een rij
        // die 65 belooft, zonder enige uitleg. Twee zichtbare rijen is lelijker
        // maar eerlijk; hij kan ze allebei aanvinken.
        const nameKey = rawName.toLowerCase()

        // Zonder IBAN én zonder naam valt er niets aan te vinken — die rij hoort
        // niet in een keuzelijst thuis.
        if (!iban && !nameKey) continue

        const key = iban ? `iban:${iban}` : `name:${nameKey}`
        let g = groups.get(key)
        if (!g) {
          g = {
            key,
            iban,
            name: rawName || null,
            outgoingCount: 0,
            incomingCount: 0,
            outgoingTotal: 0,
            incomingTotal: 0,
            lastDate: null,
            transferCount: 0,
            nameVariants: new Map(),
          }
          groups.set(key, g)
        }

        const amount = Number(r.amount) || 0
        if (amount < 0) {
          g.outgoingCount++
          g.outgoingTotal += Math.abs(amount)
        } else if (amount > 0) {
          g.incomingCount++
          g.incomingTotal += amount
        }
        if (r.transaction_type === 'transfer' || r.transaction_type === 'joint_transfer') {
          g.transferCount++
        }
        if (r.date && (!g.lastDate || r.date > g.lastDate)) g.lastDate = r.date
        if (rawName) g.nameVariants.set(rawName, (g.nameVariants.get(rawName) ?? 0) + 1)
      }

      if (rows.length < PAGE_SIZE) break
    }

    const counterparties: CounterpartySummary[] = [...groups.values()]
      .map(({ nameVariants, ...g }) => {
        // Toon de naamvariant die het vaakst voorkomt: bankafschriften wisselen
        // per regel in hoofdletters/afkortingen, en de meest voorkomende vorm is
        // wat de gebruiker herkent.
        let best: string | null = g.name
        let bestCount = 0
        for (const [variant, count] of nameVariants) {
          if (count > bestCount) { best = variant; bestCount = count }
        }
        return { ...g, name: best }
      })
      // Heen-én-weer-verkeer eerst: geld dat beide kanten op gaat is het sterkste
      // signaal dat een tegenpartij een eigen rekening is, en dat is precies wat
      // de gebruiker hier zoekt.
      .sort((a, b) => {
        const aBoth = a.outgoingCount > 0 && a.incomingCount > 0 ? 1 : 0
        const bBoth = b.outgoingCount > 0 && b.incomingCount > 0 ? 1 : 0
        if (aBoth !== bBoth) return bBoth - aBoth
        const aVol = a.outgoingTotal + a.incomingTotal
        const bVol = b.outgoingTotal + b.incomingTotal
        return bVol - aVol
      })

    return NextResponse.json({
      counterparties,
      windowMonths,
      scanned,
      truncated,
    } satisfies CounterpartiesResponse)
  } catch (err) {
    return serverError(err, 'own-accounts-counterparties:GET')
  }
}
