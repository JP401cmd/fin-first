import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  hasEverDownloadedLocalModel,
  markLocalModelDownloaded,
} from './model-download-marker'

/**
 * UR3-17 #13 — deze marker is het enige verschil tussen "je bent er nog nooit
 * aan begonnen" en "je bent het kwijtgeraakt". De modelstaat zelf kan die twee
 * niet onderscheiden (beide leveren een leeg cachepad op), dus als deze module
 * stilletjes false blijft antwoorden, keert de misleidende verliesmelding terug
 * zonder dat er iets rood wordt.
 */
describe('model-download-marker', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('vers toestel → nog nooit gedownload', () => {
    expect(hasEverDownloadedLocalModel()).toBe(false)
  })

  it('na een afgeronde download blijft de markering staan', () => {
    markLocalModelDownloaded()
    expect(hasEverDownloadedLocalModel()).toBe(true)
  })

  it('site-gegevens gewist → weer "nog nooit", en dat is de juiste lezing', () => {
    markLocalModelDownloaded()
    localStorage.clear()
    expect(hasEverDownloadedLocalModel()).toBe(false)
  })

  it('een opslagfout is geen crash maar de onschuldige lezing', () => {
    markLocalModelDownloaded()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(hasEverDownloadedLocalModel()).toBe(false)
  })

  it('schrijven mag nooit werpen, ook niet zonder quota', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => markLocalModelDownloaded()).not.toThrow()
  })
})
