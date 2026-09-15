/**
 * Herken een fout die betekent "dit schema-object is (nog) niet uitgerold".
 *
 * Nieuwe tabellen en RPC's worden in deze repo vaak vóór hun migratie gebouwd
 * (migraties worden los uitgerold, zie de schemawijziging-skill). Routes die
 * zo'n object lezen, horen dan een nette lege stand te geven in plaats van een
 * 500 — maar ALLEEN voor precies deze fouten; elke andere DB-fout blijft een
 * echte fout.
 *
 *  - `42P01`    Postgres: relation does not exist
 *  - `42883`    Postgres: function does not exist
 *  - `PGRST205` PostgREST: tabel niet in de schema-cache
 *  - `PGRST202` PostgREST: functie niet in de schema-cache
 */
const ONTBREKEND_SCHEMA_CODES: ReadonlySet<string> = new Set(['42P01', '42883', 'PGRST205', 'PGRST202'])

export function isOntbrekendSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && ONTBREKEND_SCHEMA_CODES.has(code)
}
