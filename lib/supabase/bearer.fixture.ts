// Test-fixture voor de Bearer-helper (Krant 3A): een token met de VORM van een
// Supabase-JWT (header + payload als base64url-JSON), zodat het de
// voorvalidatie in `leesBearerToken` haalt. De handtekening is nep — die toetst
// in de tests de gemockte getClaims/getUser. Eigen bestand, geen export uit een
// *.test.ts (zoals lib/krant/nep-client.fixture.ts).

const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde), 'utf8').toString('base64url')

export function maakNepJwt(
  kop: Record<string, unknown> = { alg: 'ES256', typ: 'JWT', kid: 'nep-kid' },
  payload: Record<string, unknown> = { sub: 'user-a', role: 'authenticated' },
): string {
  return `${b64(kop)}.${b64(payload)}.bmVwLWhhbmR0ZWtlbmluZw`
}

export const NEP_JWT = maakNepJwt()
