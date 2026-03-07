'use client'

import { SpeechBubble, SpeechBubbleCentered } from '@/components/onboarding/speech-bubble'

export default function TestSpeechBubbles() {
  return (
    <div className="min-h-screen bg-[var(--paper)] p-6 space-y-8">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Speech Bubble Test</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--ink-3)]">SpeechBubble (left accent border)</h2>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-wil-100 flex items-center justify-center text-wil-600 text-sm font-semibold">W</div>
          <SpeechBubble>Laten we beginnen met de basis. Wie ben je en wat verdien je?</SpeechBubble>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--ink-3)]">SpeechBubble (longer text)</h2>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-wil-100 flex items-center justify-center text-wil-600 text-sm font-semibold">W</div>
          <SpeechBubble>
            Budgetteren helpt je bewust te kiezen waar je tijd naartoe gaat. Het is een manier om controle te nemen over je financiele vrijheid. Maar het is niet verplicht — je kunt dit ook later aanpassen in Instellingen.
          </SpeechBubble>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--ink-3)]">SpeechBubbleCentered</h2>
        <SpeechBubbleCentered>
          Welkom bij TriFinity. Ik ben Will, je persoonlijke gids op weg naar financiele vrijheid.
        </SpeechBubbleCentered>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--ink-3)]">SpeechBubbleCentered (longer)</h2>
        <SpeechBubbleCentered>
          Je hebt de eerste stap gezet! Samen gaan we werken aan jouw financiele vrijheid. Elke euro die je bespaart is opgeslagen tijd — tijd die je straks kunt besteden aan wat echt belangrijk voor je is.
        </SpeechBubbleCentered>
      </section>
    </div>
  )
}
