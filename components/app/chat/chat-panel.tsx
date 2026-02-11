'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport } from 'ai'
import { useChatContext } from './chat-provider'
import { FinnAvatar } from '@/components/app/avatars'
import { X, Send, Loader2 } from 'lucide-react'

function getTextContent(msg: { parts: Array<{ type: string; text?: string }> }): string {
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

/** Markdown renderer for chat bubbles: bold, lists, headers, numbered lists */
function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: { content: string; ordered: boolean }[] = []

  const flushList = () => {
    if (listItems.length === 0) return
    const isOrdered = listItems[0].ordered
    const Tag = isOrdered ? 'ol' : 'ul'
    const listClass = isOrdered ? 'my-1 ml-4 list-decimal space-y-0.5' : 'my-1 ml-4 list-disc space-y-0.5'
    elements.push(
      <Tag key={`list-${elements.length}`} className={listClass}>
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item.content)}</li>
        ))}
      </Tag>
    )
    listItems = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Horizontal rule — skip
    if (/^---+$/.test(line.trim())) {
      flushList()
      continue
    }

    // Headers (## or #) — render as bold paragraph
    const headerMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headerMatch) {
      flushList()
      elements.push(
        <p key={`h-${i}`} className="mb-1 mt-2 font-semibold first:mt-0">
          {renderInline(headerMatch[1])}
        </p>
      )
      continue
    }

    // Unordered list (- or *)
    const ulMatch = line.match(/^\s*[-*]\s+(.+)/)
    if (ulMatch) {
      listItems.push({ content: ulMatch[1], ordered: false })
      continue
    }

    // Ordered list (1. 2. etc)
    const olMatch = line.match(/^\s*\d+\.\s+(.+)/)
    if (olMatch) {
      listItems.push({ content: olMatch[1], ordered: true })
      continue
    }

    flushList()

    if (line.trim() === '') {
      elements.push(<br key={`br-${i}`} />)
    } else {
      elements.push(
        <p key={`p-${i}`} className="mb-1 last:mb-0">
          {renderInline(line)}
        </p>
      )
    }
  }

  flushList()
  return elements
}

/** Render inline markdown: **bold** */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

export function ChatPanel() {
  const { isOpen, close, toggle } = useChatContext()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')

  const transport = useMemo(
    () => new TextStreamChatTransport({ api: '/api/ai/chat', body: { domain: 'wil' } }),
    [],
  )

  const { messages, sendMessage, status } = useChat({
    id: 'chat-will',
    transport,
  })

  const isStreaming = status === 'streaming' || status === 'submitted'

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage({ text })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // FAB trigger button (always visible)
  if (!isOpen) {
    return (
      <button
        onClick={toggle}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Open chat"
      >
        <FinnAvatar size={36} />
      </button>
    )
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={close} />

      {/* Panel */}
      <div className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col bg-white shadow-2xl md:bottom-6 md:right-6 md:h-[600px] md:w-[400px] md:rounded-2xl md:border md:border-zinc-200">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <FinnAvatar size={32} />
            <div>
              <span className="text-sm font-semibold text-teal-600">Will</span>
              <span className="ml-1 text-xs text-zinc-400">Financieel assistent</span>
            </div>
          </div>
          <button onClick={close} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FinnAvatar size={64} />
              <p className="mt-3 text-sm font-medium text-teal-600">
                Hoi, ik ben Will
              </p>
              <p className="mt-1 max-w-[260px] text-xs text-zinc-400">
                Ik help je met al je financiële vragen — van budgetten tot FIRE-projecties.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            const text = getTextContent(msg)
            if (!text) return null
            return (
              <div key={msg.id} className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="mr-2 mt-1 shrink-0">
                    <FinnAvatar size={24} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-zinc-100 text-zinc-800'
                      : 'bg-teal-50 text-zinc-700'
                  }`}
                >
                  {isUser ? text : renderMarkdown(text)}
                </div>
              </div>
            )
          })}

          {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
            <div className="mb-3 flex justify-start">
              <div className="mr-2 mt-1 shrink-0">
                <FinnAvatar size={24} />
              </div>
              <div className="rounded-2xl px-3 py-2 bg-teal-50">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-100 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Vraag Will iets..."
              rows={1}
              className="max-h-24 flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200"
            />
            <button
              type="button"
              onClick={submit}
              disabled={isStreaming || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition-colors hover:bg-teal-700 disabled:bg-zinc-300 disabled:text-zinc-500"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
