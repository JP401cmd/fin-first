import { describe, it, expect } from 'vitest'
import { signUnsubscribeToken, verifyUnsubscribeToken } from './email-token'

/**
 * Tests voor het login-loze unsubscribe-token (HMAC-SHA256):
 *   - roundtrip: teken → verifieer levert dezelfde uid;
 *   - tamper (andere uid of andere signature) → null (geen mutatie);
 *   - verkeerd secret → null;
 *   - malformed / ontbrekend token/secret → null (geen throw).
 */

const SECRET = 'test-unsub-secret-123'
const UID = 'a1b2c3d4-0000-4000-8000-000000000001'

describe('email-token', () => {
  it('roundtrip: geldig token levert de uid op', () => {
    const token = signUnsubscribeToken(UID, SECRET)
    expect(token.startsWith(`${UID}.`)).toBe(true)
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(UID)
  })

  it('afwijkend secret → null', () => {
    const token = signUnsubscribeToken(UID, SECRET)
    expect(verifyUnsubscribeToken(token, 'ander-secret')).toBeNull()
  })

  it('geknoeide signature → null', () => {
    const token = signUnsubscribeToken(UID, SECRET)
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(verifyUnsubscribeToken(tampered, SECRET)).toBeNull()
  })

  it('geknoeide uid (zelfde signature) → null', () => {
    const token = signUnsubscribeToken(UID, SECRET)
    const sig = token.slice(token.lastIndexOf('.') + 1)
    const forged = `a1b2c3d4-0000-4000-8000-000000000002.${sig}`
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull()
  })

  it('malformed / leeg token → null (geen throw)', () => {
    expect(verifyUnsubscribeToken('', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('geen-punt', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('uid.', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('.sig', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(null, SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(undefined, SECRET)).toBeNull()
  })

  it('ontbrekend secret → null', () => {
    const token = signUnsubscribeToken(UID, SECRET)
    expect(verifyUnsubscribeToken(token, null)).toBeNull()
    expect(verifyUnsubscribeToken(token, '')).toBeNull()
  })

  it('signUnsubscribeToken vereist uid en secret', () => {
    expect(() => signUnsubscribeToken('', SECRET)).toThrow()
    expect(() => signUnsubscribeToken(UID, '')).toThrow()
  })
})
