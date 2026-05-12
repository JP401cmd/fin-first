'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface InlineEditProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  validate?: (v: string) => string | null
  autoEdit?: boolean
}

/**
 * Klik-om-te-bewerken cel. Confirm op blur/Enter, cancel met Escape.
 * Ge-extract uit de oorspronkelijke beheer/module-guide page zodat de
 * standard- en goal-tabs hetzelfde patroon kunnen hergebruiken.
 */
export function InlineEdit({
  value,
  onChange,
  placeholder,
  mono,
  validate,
  autoEdit,
}: InlineEditProps) {
  const [editing, setEditing] = useState(autoEdit ?? false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const startEdit = useCallback(() => {
    setDraft(value)
    setError(null)
    setEditing(true)
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const confirmEdit = useCallback(() => {
    if (validate) {
      const err = validate(draft)
      if (err) {
        setError(err)
        return
      }
    }
    onChange(draft)
    setEditing(false)
    setError(null)
  }, [draft, onChange, validate])

  const cancelEdit = useCallback(() => {
    setDraft(value)
    setEditing(false)
    setError(null)
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        confirmEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      }
    },
    [confirmEdit, cancelEdit],
  )

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className={`w-full cursor-text rounded px-1.5 py-0.5 text-left transition-colors hover:bg-[var(--subtle)] ${
          mono ? 'font-mono text-xs text-[var(--ink-2)]' : 'text-sm text-[var(--ink)]'
        } ${!value ? 'italic text-[var(--ink-4)]' : ''}`}
        title="Klik om te bewerken"
      >
        {value || placeholder || '—'}
      </button>
    )
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          if (error) setError(null)
        }}
        onKeyDown={handleKeyDown}
        onBlur={confirmEdit}
        placeholder={placeholder}
        className={`w-full rounded border px-1.5 py-0.5 outline-none ${
          mono ? 'font-mono text-xs' : 'text-sm'
        } ${
          error
            ? 'border-red-400 bg-red-50 text-red-800'
            : 'border-[var(--border-md)] bg-white text-[var(--ink)]'
        } focus:ring-1 focus:ring-[var(--ink-3)]`}
      />
      {error && (
        <p className="absolute -bottom-4 left-0 text-[10px] text-red-500">{error}</p>
      )}
    </div>
  )
}
