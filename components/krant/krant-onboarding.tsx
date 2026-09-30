'use client'

// ── De onboarding van de Krant: vijf schermen, elk over te slaan ─────────────
//
// Krant 2C (ADR 0192). Host nummer één van de gedeelde `ProfielBody`: per scherm
// één groep uit PROFIEL_GROEPEN, in de editorial onboarding-shell
// (`OnboardingShell`, buiten de app-shell, dus met een eigen h1).
//
// Per scherm: "Verder" slaat alleen de velden op die je op dát scherm aanraakte
// (PUT /api/krant/profiel, herkomst 'zelf'); "Sla dit scherm over" slaat niets
// op. Het laatste scherm rondt af (POST /api/krant/onboarding/klaar: onboarding
// af + de eerste verversing van je tijdlijn) en stuurt door naar /nieuws.
//
// Geen AI, en ook geen AI-toestemmingsstap: dit bestand roept alleen de twee
// routes hierboven aan (bron-scan in lib/krant/aanmelden.geen-ai.test.ts).
// Alleen euro's (B2) — de vrijheidstijd-teller van de gewone onboarding staat
// hier bewust niet: er is geen OnboardingFreedomTickerProvider.

import { useState } from 'react'
import { OnboardingShell } from '@/components/onboarding/onboarding-shell'
import { KRANT_HOME_HREF } from '@/lib/modules/krant-grens'
import type { NieuwsprofielV1 } from '@/lib/krant/profiel'
import type { Herkomst } from '@/lib/krant/profiel-afleiding'
import { PROFIEL_GROEPEN, ProfielBody, putBodyUitConcept, useProfielConcept } from './profiel-body'

const ROMEINS = ['i.', 'ii.', 'iii.', 'iv.', 'v.'] as const

/** Kop en deck per scherm — in dezelfde volgorde als PROFIEL_GROEPEN (de test pint dat). */
export const KRANT_ONBOARDING_SCHERMEN: Record<string, { voor: string; nadruk: string; na: string; deck: string }> = {
  wie: {
    voor: 'Eerst iets over ',
    nadruk: 'jou',
    na: '',
    deck: 'Met je leeftijd en je huishouden weet de Krant welk nieuws jou raakt. Alles is optioneel: wat je overslaat, blijft leeg.',
  },
  inkomen: {
    voor: 'Waar je inkomen ',
    nadruk: 'vandaan',
    na: ' komt',
    deck: 'Een band is genoeg. Raakt nieuws over belasting of toeslagen jou, dan rekent de Krant er in euro’s mee.',
  },
  wonen: {
    voor: 'Hoe je ',
    nadruk: 'woont',
    na: '',
    deck: 'Huren of kopen bepaalt welk nieuws over wonen en rente voor jou telt.',
  },
  geld: {
    voor: 'Wat je ',
    nadruk: 'opzij',
    na: ' hebt, en wat je aflost',
    deck: 'Spaargeld, beleggingen en schulden in grove banden. Een precies bedrag is niet nodig.',
  },
  pensioen: {
    voor: 'Je pensioen, en waar je ',
    nadruk: 'meer',
    na: ' over wilt lezen',
    deck: 'Daarna zet de Krant je eerste tijdlijn klaar.',
  },
}

export interface KrantOnboardingProps {
  start: NieuwsprofielV1
  herkomst: Herkomst
}

export function KrantOnboarding({ start, herkomst: startHerkomst }: KrantOnboardingProps) {
  // De herkomst beweegt mee met elke opslag, zodat "Weet ik niet" na terugbladeren
  // gekozen blijft en een zelf ingevuld veld niet meer "afgeleid" heet (eindreview 0.92.28).
  const [herkomst, setHerkomst] = useState<Herkomst>(startHerkomst)
  const [stap, setStap] = useState(0)
  const [bezig, setBezig] = useState<null | 'opslaan' | 'afronden'>(null)
  const [fout, setFout] = useState<string | null>(null)
  const { profiel, gewijzigd, zet, opgeslagen } = useProfielConcept(start)

  const groep = PROFIEL_GROEPEN[stap]!
  const scherm = KRANT_ONBOARDING_SCHERMEN[groep.id]!
  const laatste = stap === PROFIEL_GROEPEN.length - 1

  async function bewaarScherm(): Promise<boolean> {
    const body = putBodyUitConcept(profiel, gewijzigd, groep.velden)
    if (!body) return true
    const res = await fetch('/api/krant/profiel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      setFout('Opslaan lukte niet. Probeer het nog eens, of sla dit scherm over.')
      return false
    }
    const data = (await res.json()) as { profiel: NieuwsprofielV1; herkomst: Herkomst }
    opgeslagen(data.profiel)
    setHerkomst(data.herkomst)
    return true
  }

  async function rondAf() {
    setBezig('afronden')
    const res = await fetch('/api/krant/onboarding/klaar', { method: 'POST' }).catch(() => null)
    if (!res?.ok) {
      setFout('Afronden lukte niet. Probeer het nog eens.')
      setBezig(null)
      return
    }
    // Harde navigatie: de app-layout leest `onboarding_completed` vers (geen
    // gecachte stand die terugstuurt naar de onboarding).
    window.location.href = KRANT_HOME_HREF
  }

  async function verder(opslaan: boolean) {
    setFout(null)
    if (opslaan) {
      setBezig('opslaan')
      const ok = await bewaarScherm().catch(() => {
        setFout('Opslaan lukte niet. Probeer het nog eens, of sla dit scherm over.')
        return false
      })
      setBezig(null)
      if (!ok) return
    }
    if (laatste) {
      await rondAf()
      return
    }
    setStap((s) => s + 1)
  }

  const primairLabel =
    bezig === 'afronden' ? 'Je tijdlijn wordt klaargezet…' : bezig === 'opslaan' ? 'Opslaan…' : laatste ? 'Klaar, naar mijn Krant' : 'Verder'

  return (
    <OnboardingShell
      kicker={groep.titel}
      romanNum={ROMEINS[stap]}
      title={
        <>
          {scherm.voor}
          <em className="font-normal italic text-[var(--module-active-700)]">{scherm.nadruk}</em>
          {scherm.na}
        </>
      }
      deck={scherm.deck}
      currentStep={stap + 1}
      totalSteps={PROFIEL_GROEPEN.length}
      onBack={stap > 0 && !bezig ? () => setStap((s) => s - 1) : undefined}
      factsPanel={<KrantZijpaneel />}
      footer={
        <div className="flex w-full flex-col gap-2.5">
          {fout && (
            <p role="alert" className="text-[13px] text-negative">
              {fout}
            </p>
          )}
          <button
            type="button"
            onClick={() => void verder(true)}
            disabled={bezig !== null}
            className="min-h-11 w-full bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {primairLabel}
          </button>
          <button
            type="button"
            onClick={() => void verder(false)}
            disabled={bezig !== null}
            className="min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {laatste ? 'Sla dit scherm over en rond af' : 'Sla dit scherm over'}
          </button>
        </div>
      }
    >
      <ProfielBody profiel={profiel} velden={groep.velden} zet={zet} gewijzigd={gewijzigd} herkomst={herkomst} />
    </OnboardingShell>
  )
}

/** Het zijpaneel: wat er met de antwoorden gebeurt, zonder nieuwe belofte. */
function KrantZijpaneel() {
  return (
    <div className="border-l-2 border-[var(--module-active-500)] pl-4 lg:border-l-0 lg:pl-0">
      <div className="mb-3 flex items-center gap-2.5">
        <span aria-hidden className="inline-block h-px w-7 shrink-0" style={{ background: 'var(--module-active-500)' }} />
        <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-700)]">Je nieuwsprofiel</span>
      </div>
      <p className="text-[14px] leading-relaxed text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
        De Krant rekent met banden, niet met precieze bedragen. Wat je overslaat of op &lsquo;weet ik niet&rsquo; zet, blijft
        leeg: dan gokt de Krant niet en krijg je het nieuws zonder bedrag voor jou.
      </p>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
        Alles wat je hier invult, pas je later aan onder Mijn nieuwsprofiel.
      </p>
    </div>
  )
}
