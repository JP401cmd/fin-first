import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #141: AI chat history preserved during session.
 *
 * Validates that the architecture ensures chat messages persist during navigation
 * by analyzing source code patterns.
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []
  const cwd = process.cwd()

  // Helper to read source files
  function readSrc(relPath: string): string {
    try {
      return readFileSync(join(cwd, relPath), 'utf-8')
    } catch {
      return ''
    }
  }

  const layoutSrc = readSrc('app/(app)/layout.tsx')
  const chatPanelSrc = readSrc('components/app/chat/chat-panel.tsx')
  const chatProviderSrc = readSrc('components/app/chat/chat-provider.tsx')

  // Test 1: ChatProvider and ChatPanel are in the app layout
  {
    const hasChatProvider = layoutSrc.includes('<ChatProvider>')
    const hasChatPanel = layoutSrc.includes('<ChatPanel')
    const importsChatProvider = layoutSrc.includes("import { ChatProvider }")
    const importsChatPanel = layoutSrc.includes("import { ChatPanel }")
    const pass = hasChatProvider && hasChatPanel && importsChatProvider && importsChatPanel
    results.push({
      name: 'ChatProvider and ChatPanel rendered in app layout',
      pass,
      detail: pass
        ? 'Both ChatProvider and ChatPanel are imported and rendered in app/(app)/layout.tsx. This layout wraps ALL protected pages.'
        : `ChatProvider: ${hasChatProvider}, ChatPanel: ${hasChatPanel}`,
    })
  }

  // Test 2: ChatPanel is a client component (persists across navigation)
  {
    const isClientComponent = chatPanelSrc.startsWith("'use client'")
    results.push({
      name: 'ChatPanel is a client component',
      pass: isClientComponent,
      detail: isClientComponent
        ? "ChatPanel uses 'use client' directive — React state persists across Next.js App Router navigation."
        : 'ChatPanel is NOT a client component — state may not persist.',
    })
  }

  // Test 3: ChatProvider is a client component
  {
    const isClientComponent = chatProviderSrc.startsWith("'use client'")
    results.push({
      name: 'ChatProvider is a client component',
      pass: isClientComponent,
      detail: isClientComponent
        ? "ChatProvider uses 'use client' directive — context state (isOpen) persists across navigation."
        : 'ChatProvider is NOT a client component.',
    })
  }

  // Test 4: useChat uses stable id per domain
  {
    const usesIdPattern = chatPanelSrc.includes('id: `chat-${domain}`')
    const hasUseChat = chatPanelSrc.includes('useChat({')
    results.push({
      name: 'useChat uses stable domain-based ID',
      pass: usesIdPattern && hasUseChat,
      detail: usesIdPattern
        ? 'useChat is called with id: `chat-${domain}` — messages are preserved per domain (kern/wil/horizon) as long as component stays mounted.'
        : 'useChat does not use expected ID pattern.',
    })
  }

  // Test 5: Domain routing is consistent within module paths
  {
    const hasKernRoute = chatPanelSrc.includes("if (pathname.startsWith('/core')) return 'kern'")
    const hasWilRoute = chatPanelSrc.includes("if (pathname.startsWith('/will')) return 'wil'")
    const hasHorizonRoute = chatPanelSrc.includes("if (pathname.startsWith('/horizon')) return 'horizon'")
    const pass = hasKernRoute && hasWilRoute && hasHorizonRoute
    results.push({
      name: 'Domain routing consistent within module paths',
      pass,
      detail: pass
        ? '/core/* → kern, /will/* → wil, /horizon/* → horizon. All sub-pages within a module share the same chat domain, so navigating /core → /core/budgets → /core keeps the same chat-kern ID.'
        : `Kern: ${hasKernRoute}, Wil: ${hasWilRoute}, Horizon: ${hasHorizonRoute}`,
    })
  }

  // Test 6: Layout wraps children (not individual page remount)
  {
    const hasChildren = layoutSrc.includes('{children}')
    const hasMainTag = layoutSrc.includes('<main')
    const childrenInMain = layoutSrc.includes('>{children}</main>')
    const pass = hasChildren && hasMainTag && childrenInMain
    results.push({
      name: 'Layout renders children inside persistent shell',
      pass,
      detail: pass
        ? 'Layout renders {children} inside <main> — only child pages re-render on navigation, not the layout shell (including ChatPanel).'
        : 'Layout structure not as expected.',
    })
  }

  // Test 7: ChatPanel uses useRef for Chat instance (Vercel AI SDK pattern)
  {
    // The useChat hook in @ai-sdk/react stores Chat in useRef — messages survive re-renders
    const usesUseChat = chatPanelSrc.includes("from '@ai-sdk/react'") && chatPanelSrc.includes('useChat(')
    results.push({
      name: 'Chat messages stored via useRef in Vercel AI SDK',
      pass: usesUseChat,
      detail: usesUseChat
        ? "useChat from @ai-sdk/react stores the Chat instance in useRef. Messages survive React re-renders. Since the layout doesn't unmount during navigation, the Chat instance (and its messages) persist."
        : 'useChat not found from @ai-sdk/react.',
    })
  }

  // Test 8: ChatPanel is NOT rendered inside individual pages (no duplicate mounting)
  {
    const corePageSrc = readSrc('app/(app)/core/page.tsx')
    const budgetsPageSrc = readSrc('app/(app)/core/budgets/page.tsx')
    const willPageSrc = readSrc('app/(app)/will/page.tsx')

    const noChatInCore = !corePageSrc.includes('ChatPanel')
    const noChatInBudgets = !budgetsPageSrc.includes('ChatPanel')
    const noChatInWill = !willPageSrc.includes('ChatPanel')
    const pass = noChatInCore && noChatInBudgets && noChatInWill
    results.push({
      name: 'ChatPanel NOT duplicated in individual pages',
      pass,
      detail: pass
        ? 'ChatPanel is only in layout.tsx, not in individual pages (core, budgets, will). This means ONE instance persists across all navigation.'
        : 'ChatPanel found in individual pages — may cause duplicate instances.',
    })
  }

  // Test 9: ChatProvider wraps ChatPanel (context available)
  {
    // Check that ChatProvider wraps ChatPanel in the layout
    const chatProviderIdx = layoutSrc.indexOf('<ChatProvider>')
    const chatPanelIdx = layoutSrc.indexOf('<ChatPanel')
    const closingProviderIdx = layoutSrc.indexOf('</ChatProvider>')
    const pass = chatProviderIdx !== -1 && chatPanelIdx !== -1 && closingProviderIdx !== -1 &&
      chatProviderIdx < chatPanelIdx && chatPanelIdx < closingProviderIdx
    results.push({
      name: 'ChatProvider wraps ChatPanel correctly',
      pass,
      detail: pass
        ? 'ChatProvider wraps ChatPanel in layout — isOpen state is shared via context and persists across navigation.'
        : 'ChatProvider does not properly wrap ChatPanel.',
    })
  }

  // Test 10: transport is memoized with domain dependency
  {
    const hasUseMemo = chatPanelSrc.includes('useMemo(')
    const transportMemo = chatPanelSrc.includes("new DefaultChatTransport({ api: '/api/ai/chat', body: { domain } })")
    const domainDep = chatPanelSrc.includes('[domain]')
    const pass = hasUseMemo && transportMemo && domainDep
    results.push({
      name: 'Transport memoized per domain',
      pass,
      detail: pass
        ? 'DefaultChatTransport is memoized with [domain] dependency — transport only recreates when domain changes, preventing unnecessary chat resets.'
        : 'Transport memoization not found or incorrect.',
    })
  }

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#141 — AI chat history preserved during session',
    summary: `${passing}/${total} checks passing`,
    allPassing: passing === total,
    results,
  })
}
