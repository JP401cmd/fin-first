import { describe, expect, it } from 'vitest'
import { isAiFout } from '@/lib/beheer/dashboard/fouten'
import { CLIENT_CONTEXT_MAX, clientContext, isServerContext } from './client-context'

describe('clientContext — wat de browser als context mag opgeven', () => {
  it('laat de eigen tags van de browser ongemoeid', () => {
    for (const tag of ['window.onerror', 'unhandledrejection', 'global-error', 'error-boundary']) {
      expect(clientContext(tag)).toBe(tag)
    }
  })

  it('een lege of ontbrekende context blijft leeg', () => {
    expect(clientContext(undefined)).toBeNull()
    expect(clientContext(null)).toBeNull()
    expect(clientContext('')).toBeNull()
    expect(clientContext('   ')).toBeNull()
  })

  it('een browser kan zich niet als AI-fout voordoen', () => {
    for (const poging of ['ai:chat', 'AI:chat', '  ai:config', 'Ai:Briefing']) {
      const opgeslagen = clientContext(poging)
      expect(opgeslagen?.startsWith('client:')).toBe(true)
      // Het dashboard en de AI-gezondheid herkennen AI-fouten aan dit voorvoegsel.
      expect(isAiFout(opgeslagen)).toBe(false)
      // `loadAiHealth` filtert met LIKE 'ai:%' (hoofdlettergevoelig, vanaf het begin).
      expect(opgeslagen?.startsWith('ai:')).toBe(false)
    }
  })

  it('ook de andere servercategorieën zijn niet te claimen', () => {
    expect(clientContext('serverError:assets:POST')).toBe('client:serverError:assets:POST')
    expect(clientContext('onRequestError:route')).toBe('client:onRequestError:route')
  })

  it('een context die alleen op een servertag lijkt, blijft staan', () => {
    expect(isServerContext('aiding')).toBe(false)
    expect(isServerContext('mail:ai:x')).toBe(false)
    expect(clientContext('mail:ai:x')).toBe('mail:ai:x')
  })

  it('kapt af op de maximale lengte, ook met het voorvoegsel erbij', () => {
    expect(clientContext('x'.repeat(500))).toHaveLength(CLIENT_CONTEXT_MAX)
    expect(clientContext(`ai:${'x'.repeat(500)}`)).toHaveLength(CLIENT_CONTEXT_MAX)
  })
})
