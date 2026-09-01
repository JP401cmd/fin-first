import { describe, it, expect } from 'vitest'
import { isSafeRelativePath, safeRelativePath, SAFE_REDIRECT_FALLBACK } from './safe-redirect'

describe('isSafeRelativePath', () => {
  it('accepteert gewone relatieve paden', () => {
    expect(isSafeRelativePath('/overzicht')).toBe(true)
    expect(isSafeRelativePath('/')).toBe(true)
    expect(isSafeRelativePath('/toekomst?tab=fire')).toBe(true)
    expect(isSafeRelativePath('/mijn/profiel#huishoudbudget')).toBe(true)
  })

  it('weigert protocol-relatieve URLs (//evil.com)', () => {
    expect(isSafeRelativePath('//evil.com')).toBe(false)
    expect(isSafeRelativePath('//evil.com/overzicht')).toBe(false)
  })

  it('weigert backslash-varianten (/\\evil.com → browser normaliseert naar //)', () => {
    expect(isSafeRelativePath('/\\evil.com')).toBe(false)
    expect(isSafeRelativePath('\\/evil.com')).toBe(false)
  })

  it('weigert paden zonder leidende slash (@evil.com, .evil.com)', () => {
    expect(isSafeRelativePath('@evil.com')).toBe(false)
    expect(isSafeRelativePath('.evil.com')).toBe(false)
    expect(isSafeRelativePath('evil.com')).toBe(false)
  })

  it('weigert absolute URLs', () => {
    expect(isSafeRelativePath('https://evil.com')).toBe(false)
    expect(isSafeRelativePath('http://evil.com')).toBe(false)
    expect(isSafeRelativePath('javascript:alert(1)')).toBe(false)
  })

  it('weigert null/undefined/leeg', () => {
    expect(isSafeRelativePath(null)).toBe(false)
    expect(isSafeRelativePath(undefined)).toBe(false)
    expect(isSafeRelativePath('')).toBe(false)
  })
})

describe('safeRelativePath', () => {
  it('geeft het pad terug als het veilig is', () => {
    expect(safeRelativePath('/overzicht')).toBe('/overzicht')
    expect(safeRelativePath('/toekomst?tab=fire')).toBe('/toekomst?tab=fire')
  })

  it('valt terug op de home-fallback (/dashboard) bij onveilige of ontbrekende input', () => {
    expect(safeRelativePath('//evil.com')).toBe(SAFE_REDIRECT_FALLBACK)
    expect(safeRelativePath('/\\evil.com')).toBe(SAFE_REDIRECT_FALLBACK)
    expect(safeRelativePath('@evil.com')).toBe(SAFE_REDIRECT_FALLBACK)
    expect(safeRelativePath('https://evil.com')).toBe(SAFE_REDIRECT_FALLBACK)
    expect(safeRelativePath(null)).toBe(SAFE_REDIRECT_FALLBACK)
    expect(safeRelativePath(undefined)).toBe(SAFE_REDIRECT_FALLBACK)
  })

  it('respecteert een custom fallback', () => {
    expect(safeRelativePath('//evil.com', '/login')).toBe('/login')
  })
})
