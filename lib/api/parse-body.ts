import type { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { badRequest } from './respond'

/**
 * Zod-validatie-helper voor mutatie-routes (ADR 0044).
 *
 * Conventie: NIEUWE mutatie-routes (POST/PUT/PATCH/DELETE-met-body) valideren
 * hun request-body met een zod-schema via deze helper. Bij falen komt er een
 * client-veilige 400 terug — geen rauwe zod-issue-dump met interne veldpaden
 * die verder gaan dan de bedoeling.
 *
 * Gebruik:
 *   const parsed = await parseBody(MySchema, req)
 *   if (!parsed.ok) return parsed.response
 *   const body = parsed.data // getypeerd als z.infer<typeof MySchema>
 */
export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

export async function parseBody<T>(schema: ZodType<T>, req: Request): Promise<ParseResult<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { ok: false, response: badRequest('Ongeldig JSON-formaat in request body') }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path.join('.')
    const message = first
      ? `${path ? `${path}: ` : ''}${first.message}`
      : 'Ongeldige invoer'
    return { ok: false, response: badRequest(message, 'validation_error') }
  }

  return { ok: true, data: parsed.data }
}
