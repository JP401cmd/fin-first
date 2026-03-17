'use client'

import { useState } from 'react'
import { WillDots, FinnAvatar } from '@/components/app/will-dots'

const STATES = ['idle', 'talking', 'listening', 'thinking', 'streaming', 'success', 'error'] as const

export default function TestWillDotsPage() {
  const [activeState, setActiveState] = useState<typeof STATES[number]>('idle')

  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 32, background: '#faf9f6', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>WillDots Component Test</h1>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Interactive state switcher</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {STATES.map(s => (
            <button
              key={s}
              onClick={() => setActiveState(s)}
              style={{
                padding: '6px 16px',
                background: activeState === s ? '#1a1916' : '#fff',
                color: activeState === s ? '#fff' : '#1a1916',
                border: '1px solid #c8c5ba',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <div style={{ background: '#fff', padding: 24, border: '1px solid #e2e0d8' }}>
            <WillDots size={80} state={activeState} />
          </div>
          <div style={{ background: '#1a1916', padding: 24 }}>
            <WillDots size={80} state={activeState} />
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>All states at once (48px)</h2>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          {STATES.map(st => (
            <div key={st} style={{ textAlign: 'center' }}>
              <WillDots size={48} state={st} />
              <div style={{ fontSize: 11, marginTop: 4 }}>{st}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Different sizes (idle)</h2>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {[24, 48, 80, 120].map(s => (
            <div key={s} style={{ textAlign: 'center' }}>
              <WillDots size={s} />
              <div style={{ fontSize: 12, marginTop: 4 }}>{s}px</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Backward compat: FinnAvatar alias</h2>
        <FinnAvatar size={64} />
      </section>
    </div>
  )
}
