import type { ChatConversationMeta, ChatOrigin, ChatRichKind, StoredChatMessage } from './types'

/**
 * snake_case DB-rij → camelCase C1-record. ÉÉN plek, bewust.
 *
 * De routes onder `app/api/chat/` antwoorden in de veldnamen uit
 * `lib/chat/history/types.ts` (camelCase), niet in de kolomnamen. Dat is een
 * contractafspraak: de frontend leest nergens `last_message_at`, en twee
 * schrijfwijzen naast elkaar is precies de drift die het typenbestand uitsluit.
 * Vier routes die elk hun eigen mapping overtypen zou die afspraak stil laten
 * wegdrijven, dus staat hij hier en nergens anders.
 *
 * Geen supabase-import: dit bestand is pure vormverandering en moet ook vanuit
 * een test aanroepbaar zijn zonder client.
 */

/**
 * De kolommen die de routes uitvragen. Expliciet, nooit `select('*')`.
 *
 * `next_seq` staat er bij zodat ÉLKE route die een gesprek teruggeeft hetzelfde
 * `nextSeq` levert — de gesprekkenlijst, het hervatten, het hernoemen én het
 * appenden. Een contract dat per route verschilt is geen contract; en de client
 * mag zijn volgnummer niet zelf bijhouden, want zo'n teller beweegt niet mee als
 * een schrijfactie faalt en laat de volgende beurt stil op
 * `ON CONFLICT … DO NOTHING` verdampen.
 */
export const CONVERSATION_COLUMNS =
  'id, title, origin, message_count, next_seq, truncated, created_at, last_message_at'

export const MESSAGE_COLUMNS = 'seq, role, content, rich_kinds, created_at'

export interface ChatConversationRow {
  id: string
  title: string
  origin: string
  message_count: number
  next_seq: number
  truncated: boolean
  created_at: string
  last_message_at: string
}

export interface ChatMessageRow {
  seq: number
  role: string
  content: string
  rich_kinds: string[] | null
  created_at: string
}

const RICH_KINDS: readonly string[] = ['visualisatie', 'actievoorstel', 'aanbeveling', 'afgekapt']

/**
 * `backend` is hier ALTIJD `'server'` en dat is geen aanname maar een
 * definitie: deze mapper draait uitsluitend op rijen die uit de serverrug
 * komen. `origin` valt om dezelfde reden terug op `'cloud'` — de
 * CHECK-constraint `chat_conversations_origin_floor` laat niets anders toe, dus
 * een afwijkende waarde zou een gedrifte database betekenen en niet een
 * lokaal gesprek dat hier hoort.
 */
export function toConversationMeta(row: ChatConversationRow): ChatConversationMeta {
  return {
    id: row.id,
    title: row.title,
    origin: (row.origin === 'lokaal' ? 'lokaal' : 'cloud') as ChatOrigin,
    backend: 'server',
    messageCount: row.message_count ?? 0,
    // Het eerstvolgende vrije volgnummer, door `append_chat_turn` herteld als
    // max(seq) + 1. Bewust NIET af te leiden uit `messageCount`: die is gecapt
    // op 200 terwijl `seq` doorloopt, dus in een gesnoeid gesprek zou dat de
    // beurten van vandaag op bestaande nummers laten botsen — en een botsing is
    // hier een STIL verlies (ON CONFLICT DO NOTHING), geen fout.
    nextSeq: row.next_seq ?? 0,
    truncated: row.truncated === true,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  }
}

export function toStoredMessage(row: ChatMessageRow): StoredChatMessage {
  return {
    seq: row.seq,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content ?? '',
    // Filteren en niet blind casten: de kolom is TEXT[] met een
    // containment-CHECK, maar een oudere rij of een handmatige insert mag geen
    // onbekende soort de UI in duwen (die rendert per soort een neutrale regel).
    richKinds: (row.rich_kinds ?? []).filter((k): k is ChatRichKind => RICH_KINDS.includes(k)),
    createdAt: row.created_at,
  }
}
