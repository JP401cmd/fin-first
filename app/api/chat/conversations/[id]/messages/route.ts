import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { toConversationMeta, type ChatConversationRow } from '@/lib/chat/history/server-row'

/**
 * `POST /api/chat/conversations/[id]/messages` — één voltooide beurt bewaren
 * (melding W-004, ADR 0137).
 *
 * Body `{ messages: StoredChatMessage[] }` (1 of 2: de vraag en het antwoord),
 * antwoord `{ conversation: ChatConversationMeta }` met de HERTELDE stand.
 *
 * ## `nextSeq` hoort bij die herteld stand
 *
 * De RPC geeft de bijgewerkte rij terug inclusief `next_seq` (= max(seq) + 1);
 * `toConversationMeta` maakt daar `nextSeq` van. De client hoort zijn
 * volgnummer daaruit te halen en niet zelf bij te houden: een eigen teller
 * beweegt niet mee als een schrijfactie faalt, en de volgende beurt komt dan op
 * een bestaande `seq` binnen — waar `ON CONFLICT … DO NOTHING` hem STIL
 * weggooit. Alle vijf de routes die een `ChatConversationMeta` teruggeven
 * leveren dit veld, via één kolomlijst in lib/chat/history/server-row.ts.
 *
 * ## Waarom de RPC en niet drie schrijfacties
 *
 * Het appenden is samengesteld: invoegen, `message_count` hertellen,
 * `last_message_at` opschuiven en boven 200 berichten de oudste snoeien. Drie
 * losse calls hebben een gat waarin de teller een tweede waarheid wordt, en de
 * client zou kolommen moeten kunnen schrijven waarop hij juist geen recht heeft
 * (kolom-gescoopte `GRANT UPDATE (title)`). `public.append_chat_turn` doet het
 * in één transactie, is `security definer`, en controleert als EERSTE statement
 * of `auth.uid()` de eigenaar van dit gesprek is.
 *
 * ## Wat deze route bewust NIET doet
 *
 * - Geen `user_id` meesturen: de RPC leest die uit de sessie. Niemand kan op
 *   andermans naam een beurt bijschrijven, ook niet vanuit onze eigen code.
 * - De inhoud van `content` nergens loggen. Dit is de gevoeligste vrije tekst
 *   in de app; `serverError` logt de DB-fout met een tag, nooit de payload.
 * - Geen 403 op andermans gesprek maar een 404 — een 403 zou verklappen dát dat
 *   gesprek bestaat.
 */

const CONVERSATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Spiegelt `StoredChatMessage` uit lib/chat/history/types.ts, veld voor veld. */
const StoredMessageSchema = z.object({
  seq: z.number().int().min(0, 'seq mag niet negatief zijn'),
  role: z.enum(['user', 'assistant']),
  // 32.000 is óók een CHECK op de kolom en de RPC kapt zelf af; deze grens is
  // de voorpost die een absurde payload afwijst vóór hij de database raakt.
  content: z.string().max(32000, 'content is te lang'),
  richKinds: z.array(z.enum(['visualisatie', 'actievoorstel', 'aanbeveling', 'afgekapt'])),
  /**
   * ISO 8601, en dat is geen vormvereiste maar een grens.
   *
   * De RPC castte deze string ongevalideerd naar TIMESTAMPTZ. `"banana"` gaf dan
   * een Postgres-22007 en dus een 500 waar een 400 hoort. Erger: `"infinity"` is
   * een GELDIG TIMESTAMPTZ-literal en landde via `greatest()` in
   * `last_message_at` — het gesprek stond daarna permanent bovenaan en de
   * keyset-pagineerder weigerde zijn eigen cursor (`Date.parse('infinity')` is
   * NaN → 400 in ../../route.ts). Herstellen kon de gebruiker niet:
   * `last_message_at` valt buiten zijn kolom-GRANT.
   *
   * `offset: true` omdat een client met een niet-UTC klok een geldig `+02:00`
   * mag sturen; de RPC klemt daarnaast op `now() + 1 minuut`, zodat ook een
   * rechtstreekse PostgREST-aanroep de sortering niet vooruit kan zetten.
   */
  createdAt: z.iso.datetime({ offset: true }),
})

const AppendSchema = z.object({
  /**
   * Eén beurt = de vraag en het antwoord. Meer dan twee zou betekenen dat de
   * client meerdere beurten tegelijk wegschrijft; dat pad bestaat niet en zou
   * de vorm van de RPC-aanroep onbeperkt maken.
   */
  messages: z.array(StoredMessageSchema).min(1, 'minstens één bericht').max(2, 'hooguit twee berichten per beurt'),
})

/** Postgres-codes die de RPC bewust opwerpt bij een niet-eigen of onbekend gesprek. */
const RPC_DENIED = new Set(['42501', 'P0002'])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!CONVERSATION_ID_RE.test(id)) return badRequest('Ongeldig gespreks-id')

    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(AppendSchema, request)
    if (!parsed.ok) return parsed.response

    // Oplopende, unieke seq binnen één beurt. De UNIQUE-constraint vangt een
    // botsing met een BESTAANDE beurt (idempotent, ON CONFLICT DO NOTHING);
    // twee gelijke seq's binnen dezelfde payload zou daar stil één van de twee
    // laten verdwijnen — dat is een fout in de aanroeper, geen no-op.
    const seqs = parsed.data.messages.map((m) => m.seq)
    if (new Set(seqs).size !== seqs.length) {
      return badRequest('seq moet uniek zijn binnen één beurt')
    }

    const { data, error } = await supabase.rpc('append_chat_turn', {
      p_conversation: id,
      p_messages: parsed.data.messages,
    })

    if (error) {
      if (error.code && RPC_DENIED.has(error.code)) {
        return notFound('Gesprek niet gevonden')
      }
      return serverError(error, 'chat-messages:POST')
    }
    if (!data) return notFound('Gesprek niet gevonden')

    return NextResponse.json({
      conversation: toConversationMeta(data as unknown as ChatConversationRow),
    })
  } catch (err) {
    return serverError(err, 'chat-messages:POST')
  }
}
