'use client'

import { useState } from 'react'
import {
  OnboardingPreferences,
  buildWidgetPrefsFromPreferences,
  INITIAL_PREFERENCES,
  type PreferencesData,
} from '@/components/onboarding/onboarding-preferences'

export default function TestOnboardingPreferences() {
  const [data, setData] = useState<PreferencesData>(INITIAL_PREFERENCES)
  const [done, setDone] = useState(false)

  if (done) {
    const prefs = buildWidgetPrefsFromPreferences(data)
    const enabled = prefs.widgets.filter((w) => w.enabled)
    const disabled = prefs.widgets.filter((w) => !w.enabled)
    return (
      <div style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '0 auto', padding: 40 }}>
        <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>Voorkeuren Resultaat</h1>
        <pre style={{ fontSize: 12, background: '#f1f5f9', padding: 16, borderRadius: 8, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Enabled widgets ({enabled.length})
        </h2>
        <ul style={{ listStyle: 'disc', paddingLeft: 20, marginBottom: 16 }}>
          {enabled.map((w) => (
            <li key={w.id} style={{ fontSize: 13 }}>{w.id} ({w.size})</li>
          ))}
        </ul>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Disabled widgets ({disabled.length})
        </h2>
        <ul style={{ listStyle: 'disc', paddingLeft: 20, marginBottom: 16, color: '#999' }}>
          {disabled.map((w) => (
            <li key={w.id} style={{ fontSize: 13 }}>{w.id}</li>
          ))}
        </ul>
        <button
          onClick={() => { setDone(false); setData(INITIAL_PREFERENCES) }}
          style={{ padding: '8px 16px', background: '#18181b', color: 'white', borderRadius: 8, cursor: 'pointer' }}
        >
          Opnieuw
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 16px' }}>
      <OnboardingPreferences
        data={data}
        onChange={setData}
        onNext={() => setDone(true)}
        onBack={() => alert('Terug naar budgets')}
      />
    </div>
  )
}
