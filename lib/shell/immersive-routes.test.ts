import { describe, it, expect } from 'vitest'
import { isImmersiveRoute } from './immersive-routes'

describe('isImmersiveRoute', () => {
  // De check-in-wizard heeft een eigen sticky Vorige/Volgende-balk; de
  // zwevende nav-pill en Fin-bubbel dekten die af op mobiel.
  it('herkent de check-in-wizard', () => {
    expect(isImmersiveRoute('/core/checkin')).toBe(true)
    expect(isImmersiveRoute('/core/checkin/')).toBe(true)
  })

  it('laat subroutes en andere pagina\'s met rust', () => {
    expect(isImmersiveRoute('/core/checkin/historie')).toBe(false)
    expect(isImmersiveRoute('/overzicht')).toBe(false)
    expect(isImmersiveRoute('/')).toBe(false)
    expect(isImmersiveRoute(null)).toBe(false)
  })
})
