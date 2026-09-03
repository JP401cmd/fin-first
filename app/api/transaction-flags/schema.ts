import { z } from 'zod'
import { TRANSACTION_FLAG_NOTE_MAX } from '@/lib/household/transaction-flags'

/**
 * Zod-contracten voor /api/transaction-flags (ADR 0044 + ADR 0128).
 *
 * Wat hier bewust NIET in staat: `household_id`, `flagged_by`, `resolved_by`,
 * `resolved_at`. Die zijn server-bepaald (sessie + huishoud-context + trigger);
 * een client die ze meestuurt ziet ze door zod gestript worden.
 */

const NoteSchema = z
  .string()
  .trim()
  .max(TRANSACTION_FLAG_NOTE_MAX, `Notitie mag maximaal ${TRANSACTION_FLAG_NOTE_MAX} tekens zijn`)
  // Een lege notitie is géén notitie: opslaan als NULL, niet als ''.
  .transform((s) => (s.length === 0 ? null : s))

export const CreateTransactionFlagSchema = z.object({
  transactionId: z.string().uuid('Ongeldig boeking-id'),
  note: NoteSchema.nullish(),
})
export type CreateTransactionFlagInput = z.infer<typeof CreateTransactionFlagSchema>

export const UpdateTransactionFlagSchema = z
  .object({
    id: z.string().uuid('Ongeldig vlag-id'),
    status: z.enum(['open', 'resolved']).optional(),
    note: NoteSchema.nullish(),
  })
  // `note: undefined` = ongemoeid laten, `note: null`/'' = wissen. Zonder één
  // van beide velden valt er niets te doen — dan is het verzoek een vergissing.
  .refine((b) => b.status !== undefined || b.note !== undefined, {
    message: 'Geef een status of een notitie op',
  })
export type UpdateTransactionFlagInput = z.infer<typeof UpdateTransactionFlagSchema>
