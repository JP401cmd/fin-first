import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import type { ChatHistoryMode } from '@/lib/chat/history/types'

/**
 * `/api/chat/history-settings` — waar de gebruiker zijn gesprekken met Fin wil
 * bewaren (melding W-004, ADR 0137).
 *
 * GET → `{ mode, serverConversationCount }`
 * PUT `{ mode, deleteExisting? }` → `{ mode, deleted }`
 *
 * ## Waarom een route en geen client-direct preference
 *
 * Een eigen-rij voorkeur mag van ADR 0058 client-direct (spiegel
 * `app/api/appearance`), en tóch loopt dit via een route: het zetten van `'uit'`
 * heeft een GEKOPPELD GEVOLG — de gebruiker kan er in dezelfde handeling voor
 * kiezen zijn bestaande gesprekken te laten verwijderen. Eén ingang voor die
 * twee stappen is beter dan twee die uit de pas kunnen lopen.
 *
 * ## Wat deze route NIET doet: uit zichzelf wissen
 *
 * `deleteExisting` is een expliciete keuze van de gebruiker, geen gevolg van de
 * modus. Een instelling is nooit een destructieve handeling: wie de knop omzet
 * om te zien wát hij doet, mag geen maand aan gesprekken kwijtraken. De UI
 * vraagt het daarom met twee uitgangen ("Laat ze staan" / "Verwijder ze nu");
 * deze route raadt niets.
 *
 * ## Volgorde: eerst de modus, dan de wissing
 *
 * Faalt de wissing, dan staat de keuze er wel en zijn de gesprekken er nog —
 * herstelbaar met één druk op dezelfde knop. Andersom (eerst wissen) zou een
 * mislukte modus-schrijfactie de gesprekken al hebben opgeruimd zonder dat de
 * keuze doorging. Onherstelbaar mag nooit vooropgaan.
 *
 * ## Anon RLS-client, nooit service-role
 *
 * Own-row read-modify-write op `profiles`, precies zoals
 * `app/api/ai-execution-prefs` en `app/api/appearance`. De wissing draait op de
 * eigen-rij DELETE-policy van `chat_conversations`; de berichten cascaden mee.
 */

const MODES = ['account', 'apparaat', 'uit'] as const

const SettingsSchema = z.object({
  mode: z.enum(MODES),
  /** Alleen `true` wist iets. Weglaten of `false` laat alles staan. */
  deleteExisting: z.boolean().optional(),
})

/** PostgREST-code voor "kolom bestaat niet" (Postgres `undefined_column`). */
const UNDEFINED_COLUMN = '42703'

const DEFAULT_MODE: ChatHistoryMode = 'account'

function coerceMode(raw: unknown): ChatHistoryMode {
  return (MODES as readonly string[]).includes(raw as string) ? (raw as ChatHistoryMode) : DEFAULT_MODE
}

/**
 * Defensief bij een ONTBREKENDE KOLOM — hetzelfde patroon als `readRow` in
 * `app/api/ai-execution-prefs/route.ts`.
 *
 * Waarom dit moet: het chatpaneel leest deze route bij het openen van de
 * instellingen. Draait er een omgeving waarin de migratie nog niet is
 * toegepast, dan zou een 500 hier de opslagkeuze onbedienbaar maken — terwijl
 * de juiste uitkomst evident is: een kolom die niet bestaat kan per definitie
 * niemands voorkeur bevatten, dus geldt de default. Élke ándere leesfout gooit
 * bewust door, zodat een tijdelijke DB-storing niet stil als "account" leest.
 */
async function readMode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ChatHistoryMode> {
  const { data, error } = await supabase
    .from('profiles')
    .select('chat_history_mode')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === UNDEFINED_COLUMN) return DEFAULT_MODE
    throw error
  }

  return coerceMode((data as { chat_history_mode?: unknown } | null)?.chat_history_mode)
}

async function countServerConversations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  // `head: true` — we willen het GETAL, niet de titels. Dit antwoord gaat naar
  // een instellingenscherm; er is geen reden om daar gesprekstitels heen te
  // sturen.
  const { count, error } = await supabase
    .from('chat_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) throw error
  return count ?? 0
}

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const [mode, serverConversationCount] = await Promise.all([
      readMode(supabase, user.id),
      countServerConversations(supabase, user.id),
    ])

    return NextResponse.json({ mode, serverConversationCount })
  } catch (err) {
    return serverError(err, 'chat-history-settings:GET')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(SettingsSchema, request)
    if (!parsed.ok) return parsed.response
    const { mode, deleteExisting } = parsed.data

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ chat_history_mode: mode })
      .eq('id', user.id)

    if (updateError) return serverError(updateError, 'chat-history-settings:PUT')

    let deleted = 0
    if (deleteExisting === true) {
      // `.select('id')` zodat we het werkelijke aantal terugmelden en niet het
      // aantal dat we hoopten te wissen — een delete die door RLS 0 rijen raakt
      // geeft `error: null`.
      const { data, error: deleteError } = await supabase
        .from('chat_conversations')
        .delete()
        .eq('user_id', user.id)
        .select('id')

      if (deleteError) return serverError(deleteError, 'chat-history-settings:PUT')
      deleted = data?.length ?? 0
    }

    return NextResponse.json({ mode, deleted })
  } catch (err) {
    return serverError(err, 'chat-history-settings:PUT')
  }
}
