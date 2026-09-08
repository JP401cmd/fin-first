import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import {
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  toConversationMeta,
  toStoredMessage,
  type ChatConversationRow,
  type ChatMessageRow,
} from '@/lib/chat/history/server-row'

/**
 * `/api/chat/conversations/[id]` — één gesprek met Fin: hervatten, hernoemen,
 * verwijderen (melding W-004, ADR 0137).
 *
 * GET    → `{ conversation, messages }`  (de hydratatie bij hervatten)
 * PATCH  `{ title }` → `{ conversation }`
 * DELETE → `{ ok: true }`
 *
 * ## Waarom élke handler `.eq('user_id', …)` herhaalt
 *
 * RLS dekt het al — de vier policies op `chat_conversations` zijn eigen-rij en
 * er is geen huishoud-verbreding zoals op `assets`. De filter staat er
 * niettemin, om twee redenen: hij maakt de scoping leesbaar op de plek waar
 * iemand hem zou kunnen vergeten, en hij zorgt dat een niet-bestaand én een
 * andermans id dezelfde uitkomst geven (404). Dat laatste is bewust: een 403 op
 * andermans id zou het BESTAAN van dat gesprek verklappen.
 *
 * ## Waarom de vorm van het id hier gecontroleerd wordt
 *
 * Een niet-uuid pad-segment gaat anders rechtstreeks naar Postgres en komt
 * terug als een 22P02, die we dan als 500 zouden loggen. Zelfde constante-vorm
 * als `app/api/assets/[id]/route.ts`: één regex, gedeeld door alle drie de
 * handlers, zodat ze niet stil uit elkaar lopen.
 */

const CONVERSATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const RenameSchema = z.object({
  title: z.string().trim().min(1, 'title is vereist').max(120, 'title is te lang'),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!CONVERSATION_ID_RE.test(id)) return badRequest('Ongeldig gespreks-id')

    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const { data: conversation, error: convError } = await supabase
      .from('chat_conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (convError) return serverError(convError, 'chat-conversation:GET')
    if (!conversation) return notFound('Gesprek niet gevonden')

    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .order('seq', { ascending: true })

    if (msgError) return serverError(msgError, 'chat-conversation:GET')

    return NextResponse.json({
      conversation: toConversationMeta(conversation as unknown as ChatConversationRow),
      messages: ((messages ?? []) as unknown as ChatMessageRow[]).map(toStoredMessage),
    })
  } catch (err) {
    return serverError(err, 'chat-conversation:GET')
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!CONVERSATION_ID_RE.test(id)) return badRequest('Ongeldig gespreks-id')

    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(RenameSchema, request)
    if (!parsed.ok) return parsed.response

    // `.select()` is hier geen luxe: een UPDATE die door RLS 0 rijen raakt geeft
    // `error: null`, en zonder deze select zou de client een succes-toast zien
    // terwijl er niets gebeurde (dezelfde valkuil als bij /api/assets/[id]).
    // `title` is bovendien de ENIGE kolom waarop authenticated UPDATE-recht
    // heeft (kolom-gescoopte GRANT); een poging tot meer eindigt op 42501.
    const { data, error } = await supabase
      .from('chat_conversations')
      .update({ title: parsed.data.title })
      .eq('id', id)
      .eq('user_id', user.id)
      .select(CONVERSATION_COLUMNS)
      .maybeSingle()

    if (error) return serverError(error, 'chat-conversation:PATCH')
    if (!data) return notFound('Gesprek niet gevonden')

    return NextResponse.json({
      conversation: toConversationMeta(data as unknown as ChatConversationRow),
    })
  } catch (err) {
    return serverError(err, 'chat-conversation:PATCH')
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!CONVERSATION_ID_RE.test(id)) return badRequest('Ongeldig gespreks-id')

    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    // De berichten gaan mee via `chat_messages.conversation_id ON DELETE
    // CASCADE` — geen tweede delete, dus ook geen halve toestand als de tweede
    // zou falen.
    const { data, error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')

    if (error) return serverError(error, 'chat-conversation:DELETE')
    if (!data || data.length === 0) return notFound('Gesprek niet gevonden')

    return NextResponse.json({ ok: true })
  } catch (err) {
    return serverError(err, 'chat-conversation:DELETE')
  }
}
