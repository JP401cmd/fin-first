import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import {
  CONVERSATION_COLUMNS,
  toConversationMeta,
  type ChatConversationRow,
} from '@/lib/chat/history/server-row'

/**
 * `/api/chat/conversations` — de gesprekkenlijst en het aanmaken van een gesprek
 * met Fin (melding W-004, ADR 0137).
 *
 * GET  ?limit=50&before=<iso> → `{ conversations: ChatConversationMeta[] }`
 * POST `{ title, origin: 'cloud' }` → `{ conversation: ChatConversationMeta }`
 *
 * ## Waarom dit een route is en geen client-`.from()`
 *
 * ADR 0058: muteren gaat via een API-route, en de gesprekkenlijst is een
 * on-demand lazy read (het paneel is `ssr:false` en opent zelden) — precies de
 * toegestane vorm. Er komt dus niets op de allowlist van `check:client-reads`.
 *
 * ## Anon RLS-client, nooit service-role
 *
 * `createClient()` draagt de sessie van de aanroeper; de eigen-rij policies op
 * `chat_conversations` doen het scoping-werk. De `.eq('user_id', …)` hieronder
 * is daar bovenop bewust GEEN overbodige regel: hij maakt de bedoeling leesbaar
 * en houdt de query op de index `chat_conversations_user_recent_idx`.
 * `chat_messages.content` is de gevoeligste vrije tekst in de app — er is geen
 * beheer- of service-role-leespad, ook niet hier.
 *
 * ## `origin` staat in de body en is toch geen keuze
 *
 * Het schema accepteert uitsluitend `'cloud'`. Een lokaal gevoerd gesprek hoort
 * op het apparaat en nergens anders; de client kiest de rug met
 * `resolveBackend()` en komt met een `'lokaal'`-gesprek dus nooit hier. Deed hij
 * dat toch, dan weigert eerst dit schema (400) en anders de CHECK-constraint
 * `chat_conversations_origin_floor` (23514). Dubbel, en dat is de bedoeling.
 */

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

const CreateSchema = z.object({
  title: z.string().trim().min(1, 'title is vereist').max(120, 'title is te lang'),
  /**
   * Bewust `z.literal` en geen `z.enum([...])`: een enum met twee waarden zou
   * ooit stilzwijgend `'lokaal'` kunnen accepteren als iemand hem uitbreidt.
   */
  origin: z.literal('cloud'),
})

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const { searchParams } = new URL(request.url)

    const rawLimit = searchParams.get('limit')
    let limit = DEFAULT_LIMIT
    if (rawLimit !== null) {
      const parsed = Number(rawLimit)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        return badRequest(`limit moet een geheel getal zijn tussen 1 en ${MAX_LIMIT}`)
      }
      limit = parsed
    }

    // Pagineren op de sorteersleutel zelf (keyset), niet op offset: bij een
    // lijst die tijdens het scrollen bovenaan aangroeit schuift een offset mee
    // en slaat hij rijen over.
    const before = searchParams.get('before')
    if (before !== null && Number.isNaN(Date.parse(before))) {
      return badRequest('before moet een ISO 8601-tijdstip zijn')
    }

    let query = supabase
      .from('chat_conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(limit)

    if (before !== null) {
      query = query.lt('last_message_at', before)
    }

    const { data, error } = await query
    if (error) return serverError(error, 'chat-conversations:GET')

    const rows = (data ?? []) as unknown as ChatConversationRow[]
    return NextResponse.json({ conversations: rows.map(toConversationMeta) })
  } catch (err) {
    return serverError(err, 'chat-conversations:GET')
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(CreateSchema, request)
    if (!parsed.ok) return parsed.response

    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        user_id: user.id,
        title: parsed.data.title,
        origin: parsed.data.origin,
      })
      .select(CONVERSATION_COLUMNS)
      .single()

    if (error) return serverError(error, 'chat-conversations:POST')
    if (!data) return serverError(new Error('insert leverde geen rij'), 'chat-conversations:POST')

    return NextResponse.json({
      conversation: toConversationMeta(data as unknown as ChatConversationRow),
    })
  } catch (err) {
    return serverError(err, 'chat-conversations:POST')
  }
}
