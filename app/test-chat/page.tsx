'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { FhinAvatar, FfinAvatar } from '@/components/app/avatars'
import { WillDots } from '@/components/app/will-dots'
import type { AIDomain } from '@/lib/ai/dna/types'

/**
 * Test page for verifying the AI chat personality switching per module.
 * This page simulates the chat FAB and panel appearance for each domain
 * without requiring authentication.
 */

type DomainConfig = {
  domain: AIDomain
  name: string
  subtitle: string
  placeholder: string
  greeting: string
  greetingDescription: string
  fabBg: string
  fabAvatar: (size: number) => React.ReactNode
  headerColor: string
  bubbleBg: string
  accentColor: string
  sendBg: string
  route: string
  moduleLabel: string
  moduleColor: string
}

const DOMAIN_CONFIGS: DomainConfig[] = [
  {
    domain: 'kern',
    name: 'FHIN',
    subtitle: 'Financieel bewaker',
    placeholder: 'Vraag FHIN iets over je financien...',
    greeting: 'Hoi, ik ben FHIN',
    greetingDescription: 'Ik bewaar je financiele waarheid — vermogen, budgetten, transacties en vrijheidstijd.',
    fabBg: 'bg-amber-600',
    fabAvatar: (size: number) => <FhinAvatar size={size} />,
    headerColor: 'text-amber-600',
    bubbleBg: 'bg-amber-50',
    accentColor: 'text-amber-600',
    sendBg: 'bg-amber-600',
    route: '/core',
    moduleLabel: 'De Kern',
    moduleColor: 'amber',
  },
  {
    domain: 'wil',
    name: 'Will',
    subtitle: 'Financieel assistent',
    placeholder: 'Vraag Will iets...',
    greeting: 'Hoi, ik ben Will',
    greetingDescription: 'Ik help je met al je financiele vragen — van budgetten tot FIRE-projecties.',
    fabBg: 'bg-teal-600',
    fabAvatar: (size: number) => <WillDots size={size} />,
    headerColor: 'text-teal-600',
    bubbleBg: 'bg-teal-50',
    accentColor: 'text-teal-600',
    sendBg: 'bg-teal-600',
    route: '/will',
    moduleLabel: 'De Wil',
    moduleColor: 'teal',
  },
  {
    domain: 'horizon',
    name: 'FFIN',
    subtitle: 'Strateeg van De Horizon',
    placeholder: 'Vraag FFIN iets over je toekomst...',
    greeting: 'Hoi, ik ben FFIN',
    greetingDescription: 'Ik analyseer je pad naar financiele vrijheid — projecties, scenario\'s en simulaties.',
    fabBg: 'bg-purple-600',
    fabAvatar: (size: number) => <FfinAvatar size={size} />,
    headerColor: 'text-purple-600',
    bubbleBg: 'bg-purple-50',
    accentColor: 'text-purple-600',
    sendBg: 'bg-purple-600',
    route: '/horizon',
    moduleLabel: 'De Horizon',
    moduleColor: 'purple',
  },
]

function routeToDomain(pathname: string): AIDomain {
  if (pathname.startsWith('/core')) return 'kern'
  if (pathname.startsWith('/will')) return 'wil'
  if (pathname.startsWith('/horizon')) return 'horizon'
  return 'wil'
}

export default function TestChatPage() {
  const pathname = usePathname()
  const [selectedDomain, setSelectedDomain] = useState<AIDomain | null>(null)

  // Show the route-based logic works
  const currentDomainFromRoute = routeToDomain(pathname)

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">AI Chat Personality Test</h1>
        <p className="text-sm text-zinc-500 mb-2">
          Verifies that the AI chat shows the correct personality per module.
        </p>
        <p className="text-xs text-zinc-400 mb-6">
          Current path: <code className="bg-zinc-200 px-1 rounded">{pathname}</code> → domain: <code className="bg-zinc-200 px-1 rounded">{currentDomainFromRoute}</code>
        </p>

        {/* Route mapping table */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Route → Domain Mapping</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left py-2 text-zinc-600">Route</th>
                <th className="text-left py-2 text-zinc-600">Domain</th>
                <th className="text-left py-2 text-zinc-600">AI Name</th>
                <th className="text-left py-2 text-zinc-600">Avatar</th>
                <th className="text-left py-2 text-zinc-600">Color</th>
              </tr>
            </thead>
            <tbody>
              {DOMAIN_CONFIGS.map(c => (
                <tr key={c.domain} className="border-b border-zinc-100">
                  <td className="py-2 font-mono text-xs">{c.route}{'/*'}</td>
                  <td className="py-2 font-mono text-xs">{c.domain}</td>
                  <td className="py-2 font-semibold">{c.name}</td>
                  <td className="py-2">{c.fabAvatar(24)}</td>
                  <td className="py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${c.fabBg} text-white`}>
                      {c.moduleColor}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="border-b border-zinc-100">
                <td className="py-2 font-mono text-xs">/dashboard, other</td>
                <td className="py-2 font-mono text-xs">wil (default)</td>
                <td className="py-2 font-semibold">Will</td>
                <td className="py-2"><WillDots size={24} /></td>
                <td className="py-2">
                  <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-teal-600 text-white">teal</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Chat preview per domain */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {DOMAIN_CONFIGS.map(config => (
            <div key={config.domain} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              {/* Module label */}
              <div className={`px-4 py-2 ${config.fabBg} text-white text-sm font-semibold`}>
                {config.moduleLabel} ({config.route})
              </div>

              {/* FAB preview */}
              <div className="p-4 border-b border-zinc-100">
                <p className="text-xs text-zinc-500 mb-2">FAB Button:</p>
                <button
                  onClick={() => setSelectedDomain(selectedDomain === config.domain ? null : config.domain)}
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${config.fabBg} text-white shadow-lg transition-transform hover:scale-105`}
                >
                  {config.fabAvatar(36)}
                </button>
              </div>

              {/* Chat panel preview */}
              {selectedDomain === config.domain && (
                <div className="border-t border-zinc-200">
                  {/* Header */}
                  <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
                    {config.fabAvatar(32)}
                    <div>
                      <span className={`text-sm font-semibold ${config.headerColor}`}>{config.name}</span>
                      <span className="ml-1 text-xs text-zinc-400">{config.subtitle}</span>
                    </div>
                  </div>

                  {/* Empty state */}
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    {config.fabAvatar(64)}
                    <p className={`mt-3 text-sm font-medium ${config.accentColor}`}>
                      {config.greeting}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {config.greetingDescription}
                    </p>
                  </div>

                  {/* Input preview */}
                  <div className="border-t border-zinc-100 px-3 py-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-400">
                        {config.placeholder}
                      </div>
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.sendBg} text-white`}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Domain info */}
                  <div className={`px-4 py-2 ${config.bubbleBg} text-xs text-zinc-500`}>
                    API domain: <code className="font-mono">{config.domain}</code> | Chat ID: <code className="font-mono">chat-{config.domain}</code>
                  </div>
                </div>
              )}

              {selectedDomain !== config.domain && (
                <div className="p-4 text-xs text-zinc-400 text-center">
                  Click FAB to preview chat panel
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
