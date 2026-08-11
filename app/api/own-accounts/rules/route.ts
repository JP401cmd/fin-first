import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { MIN_OWN_ACCOUNT_NAME_LENGTH, normalizeIban } from '@/lib/own-accounts'
import { loadOwnAccountIdentifiers } from '@/lib/own-accounts-server'
import { reclassifyOwnAccountTransfers } from '@/lib/own-accounts-reclassify'
import { resolveEigenRekeningBudgetId } from '@/lib/budget-data'
import type { OwnAccountRule } from '../settings/route'

/**
 * POST /api/own-accounts/rules — de eigen-rekening-regels bijwerken.
 *
 * Neemt een DELTA (`add` / `remove`) in plaats van de complete gewenste set.
 * Bewust: de regels worden op meer dan één plek aangemaakt — de
 * instellingen-sheet, maar ook `lib/category-rules.ts` bij scope `'rule'`. Een
 * route die de hele set overschrijft zou de regels van dat andere pad wissen
 * zodra iemand de sheet opent en opslaat, zonder dat er iets faalt.
 *
 * Na het toepassen van de delta draait meteen de herclassificatie van de
 * historie: dat is de belofte van deze feature ("alle historische én toekomstige
 * transacties"). Toekomstig gedrag zit in de importpaden, die dezelfde regels al
 * lezen.
 *
 * ## Uitvinken draait niets terug — bewust
 *
 * `remove` haalt de regel weg zodat nieuwe transacties niet meer als verschuiving
 * landen, maar laat reeds omgezette transacties staan. Terugdraaien zou ook de
 * transacties raken die de gebruiker daarna zélf heeft gecategoriseerd of via de
 * sleepmodus aan een tegenboeking heeft gekoppeld; die keuze is van hem, niet van
 * een opruimlus. De sheet zegt dit met zoveel woorden.
 */

/**
 * Losjes: `NL91ABNA0417164300` maar ook buitenlandse vormen. Bewust géén
 * mod-97-controle — een strikte validator zou geldige, minder gangbare IBANs
 * weigeren, en de kosten van een typefout zijn hier laag (de regel matcht dan
 * simpelweg nergens op) terwijl een geweigerde geldige IBAN de feature stuk maakt.
 */
const IBAN_RE = /^[A-Z]{2}[0-9A-Z]{8,32}$/

const RuleInput = z.object({
  matchType: z.enum(['iban', 'name']),
  matchValue: z.string().trim().min(1, 'Waarde is leeg'),
  label: z.string().trim().max(120).nullish(),
})

const BodySchema = z.object({
  add: z.array(RuleInput).max(200).optional(),
  remove: z.array(z.uuid()).max(200).optional(),
})

export interface OwnAccountRulesResponse {
  rules: OwnAccountRule[]
  /** Aantal bestaande transacties dat door deze wijziging op eigen rekening landde. */
  reclassified: number
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    // Mutatie-route → `auth.getUser()` (geverifieerd bij de auth-server), niet de
    // lokale claim-lezing: hier wordt geschreven.
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const parsed = await parseBody(BodySchema, req)
    if (!parsed.ok) return parsed.response
    const { add = [], remove = [] } = parsed.data

    // --- Normaliseren + valideren -------------------------------------------
    // De opgeslagen vorm MOET overeenkomen met wat `buildOwnAccountIdentifiers`
    // en `isOwnAccountTransfer` verwachten: IBANs zonder spaties in hoofdletters,
    // naam-patronen in kleine letters (de match is een lowercase `includes`).
    // Zou de client dit doen, dan hangt de correctheid van de spaarquote af van
    // één regel browsercode — vandaar server-bepaald.
    const inserts: { user_id: string; iban: string | null; match_type: string; match_value: string; label: string | null }[] = []
    for (const r of add) {
      if (r.matchType === 'iban') {
        const iban = normalizeIban(r.matchValue)
        if (!IBAN_RE.test(iban)) {
          return badRequest(`"${r.matchValue}" is geen geldige IBAN.`, 'validation_error')
        }
        inserts.push({
          user_id: user.id,
          iban,
          match_type: 'iban',
          match_value: iban,
          label: r.label?.trim() || null,
        })
      } else {
        const value = r.matchValue.trim().toLowerCase()
        // Een naam-patroon is een SUBSTRING-match. De ondergrens is gedeeld met het
        // tweede schrijfpad (`lib/category-rules.ts`, scope 'rule' vanuit de
        // sleepmodus) — stond hij maar op één plek, dan was de andere de achterdeur.
        if (value.length < MIN_OWN_ACCOUNT_NAME_LENGTH) {
          return badRequest(
            `Een naam moet minstens ${MIN_OWN_ACCOUNT_NAME_LENGTH} tekens hebben, anders herkent hij te veel.`,
            'validation_error',
          )
        }
        inserts.push({
          user_id: user.id,
          iban: null,
          match_type: 'name',
          match_value: value,
          label: r.matchValue.trim(),
        })
      }
    }

    // --- Verwijderen ---------------------------------------------------------
    // `user_id` als expliciete eigenaarscontrole bovenop RLS: `id` komt van de
    // client, en een schrijf hoort nooit alleen op een client-aangeleverde sleutel
    // te vertrouwen.
    if (remove.length > 0) {
      const { error } = await supabase
        .from('user_own_ibans')
        .delete()
        .in('id', remove)
        .eq('user_id', user.id)
      if (error) return serverError(error, 'own-accounts-rules:POST')
    }

    // --- Toevoegen -----------------------------------------------------------
    // `upsert` op de bestaande UNIQUE `(user_id, match_type, match_value)`: twee
    // keer hetzelfde aanvinken is dan geen 409 maar een no-op. Idempotentie hoort
    // bij een knop die de gebruiker gerust twee keer mag indrukken.
    if (inserts.length > 0) {
      const { error } = await supabase
        .from('user_own_ibans')
        .upsert(inserts, { onConflict: 'user_id,match_type,match_value', ignoreDuplicates: true })
      // 23505 = unique_violation. De tabel draagt NAAST
      // `user_own_ibans_user_match_uniq` ook het oudere `unique (user_id, iban)`,
      // en daar arbitreert de upsert niet op. Een legacy-rij met een
      // genormaliseerde `iban` maar een onnormalisering `match_value` botst dus
      // alsnog. Dat is functioneel een no-op ("deze IBAN stond er al"), dus geen
      // 500 — en beslist niet via `serverError`, want `describeError` logt het
      // PostgrestError-`details`-veld en dáár staat de IBAN letterlijk in. De rest
      // van dit werk logt bewust alleen tellingen; dit is het ene gat waarlangs
      // een IBAN alsnog in de serverlog zou belanden.
      if (error && (error as { code?: string }).code !== '23505') {
        return serverError(error, 'own-accounts-rules:POST')
      }
    }

    // --- Historie bijwerken --------------------------------------------------
    const [{ ids }, budgetsRes] = await Promise.all([
      loadOwnAccountIdentifiers(supabase, user.id),
      supabase.from('budgets').select('id, slug').eq('user_id', user.id),
    ])
    const eigenRekeningBudgetId = resolveEigenRekeningBudgetId(budgetsRes.data ?? [])
    const { reclassified } = await reclassifyOwnAccountTransfers(
      supabase,
      user.id,
      ids,
      eigenRekeningBudgetId,
    )

    // --- Verse stand teruggeven ---------------------------------------------
    const { data: rulesData, error: rulesError } = await supabase
      .from('user_own_ibans')
      .select('id, match_type, match_value, iban, label')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (rulesError) return serverError(rulesError, 'own-accounts-rules:POST')

    const rules: OwnAccountRule[] = (
      (rulesData ?? []) as {
        id: string
        match_type: string | null
        match_value: string | null
        iban: string | null
        label: string | null
      }[]
    )
      .map((r): OwnAccountRule => ({
        id: r.id,
        matchType: (r.match_type ?? 'iban').toLowerCase() === 'name' ? 'name' : 'iban',
        matchValue: (r.match_value ?? r.iban ?? '').trim(),
        label: r.label,
      }))
      .filter((r) => r.matchValue.length > 0)

    return NextResponse.json({ rules, reclassified } satisfies OwnAccountRulesResponse)
  } catch (err) {
    return serverError(err, 'own-accounts-rules:POST')
  }
}
