'use client'

import { useState, useEffect } from 'react'
import { FinnAvatar } from '@/components/app/avatars'

const SAVING_MESSAGES = [
  'Profiel wordt opgeslagen...',
  'Budgetten worden aangemaakt...',
  'Bezittingen en schulden verwerken...',
  'Dashboard wordt geconfigureerd...',
  'Bijna klaar...',
]

export default function TestOnboardingSaving() {
  const [step, setStep] = useState<'saving' | 'error' | 'done'>('saving')
  const [progress, setProgress] = useState(0)
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    if (step !== 'saving') return
    const pt = setInterval(() => {
      setProgress((p) => { if (p >= 90) { clearInterval(pt); return 90 } return p + 3 })
    }, 100)
    const mt = setInterval(() => {
      setMsgIdx((i) => (i + 1) % SAVING_MESSAGES.length)
    }, 800)
    return () => { clearInterval(pt); clearInterval(mt) }
  }, [step])

  if (step === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-emerald-600">Klaar!</h2>
          <button onClick={() => { setStep('saving'); setProgress(0); setMsgIdx(0) }} className="mt-4 rounded-lg bg-zinc-900 px-6 py-2 text-white">Opnieuw</button>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="mb-2 text-base font-semibold text-zinc-900">Er ging iets mis</h3>
          <p className="mb-5 text-sm text-zinc-500">Test error message</p>
          <div className="flex gap-3">
            <button onClick={() => { setStep('saving'); setProgress(0); setMsgIdx(0) }} className="flex-1 min-h-[44px] rounded-lg bg-wil-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-wil-700">
              Opnieuw proberen
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">
          <div className="animate-pulse">
            <FinnAvatar size={64} />
          </div>
        </div>
        <p className="mb-4 text-sm font-medium text-zinc-700 transition-opacity duration-300">
          {SAVING_MESSAGES[msgIdx]}
        </p>
        <div className="mx-auto h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-teal-400 to-purple-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 font-mono text-xs tabular-nums text-zinc-400">{progress}%</p>
        <div className="mt-6 flex gap-3">
          <button onClick={() => setStep('error')} className="flex-1 min-h-[44px] rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-500">Simuleer error</button>
          <button onClick={() => { setProgress(100); setTimeout(() => setStep('done'), 500) }} className="flex-1 min-h-[44px] rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-500">Simuleer succes</button>
        </div>
      </div>
    </div>
  )
}
