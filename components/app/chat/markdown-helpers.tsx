import React from 'react'

/* ── Markdown helpers ──────────────────────────────────────────────── */

export function renderMarkdown(text: string) {
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

    if (/^---+$/.test(line.trim())) { flushList(); continue }

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

    const ulMatch = line.match(/^\s*[-*]\s+(.+)/)
    if (ulMatch) { listItems.push({ content: ulMatch[1], ordered: false }); continue }

    const olMatch = line.match(/^\s*\d+\.\s+(.+)/)
    if (olMatch) { listItems.push({ content: olMatch[1], ordered: true }); continue }

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

export function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : [text]
}

/* ── Tool invocation finder ────────────────────────────────────────── */

/**
 * Find a tool invocation by name across AI SDK v4/v5/v6 message part formats.
 */
export function findToolInvocation(part: Record<string, unknown>, toolName: string): {
  toolCallId: string
  state: string
  output?: unknown
} | null {
  // AI SDK v6: type 'dynamic-tool' with toolName
  if (part.type === 'dynamic-tool' && part.toolName === toolName) {
    return { toolCallId: part.toolCallId as string, state: part.state as string, output: part.output }
  }
  // AI SDK v6: typed tool part 'tool-{toolName}'
  if (part.type === `tool-${toolName}`) {
    return { toolCallId: part.toolCallId as string, state: part.state as string, output: part.output }
  }
  // AI SDK v4/v5 compat: type 'tool-invocation'
  if (part.type === 'tool-invocation') {
    const p = part as Record<string, unknown>
    // Flat structure (v4)
    if (p.toolName === toolName) {
      return { toolCallId: (p.toolInvocationId ?? p.toolCallId) as string, state: p.state as string, output: p.result ?? p.output }
    }
    // Nested structure (v5)
    const inv = p.toolInvocation as Record<string, unknown> | undefined
    if (inv?.toolName === toolName) {
      return { toolCallId: (inv.toolCallId ?? inv.toolInvocationId) as string, state: inv.state as string, output: inv.result ?? inv.output }
    }
  }
  return null
}

/* ── Tool state helpers ────────────────────────────────────────────── */

export const TOOL_LOADING_STATES = ['input-streaming', 'input-available', 'call', 'partial-call']
export const TOOL_OUTPUT_STATES = ['output-available', 'result']

/* ── Types ─────────────────────────────────────────────────────────── */

// AI SDK v6 dynamic tool invocation part
export type DynamicToolPart = {
  type: 'dynamic-tool'
  toolName: string
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
}

export type MessagePart =
  | { type: 'text'; text: string }
  | DynamicToolPart
  | { type: string; [key: string]: unknown }
