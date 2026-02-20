'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { Notification } from '@/app/api/notifications/route'

type NotificationContextType = {
  notifications: Notification[]
  history: Notification[]
  unreadCount: number
  loading: boolean
  isModalOpen: boolean
  openModal: () => void
  closeModal: () => void
  markAsRead: (id: string) => void
  markAllRead: () => void
  refresh: () => void
}

const NotificationContext = createContext<NotificationContextType | null>(null)

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [history, setHistory] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const skipNextPollRef = useRef(false)

  const fetchNotifications = useCallback(async () => {
    if (skipNextPollRef.current) {
      skipNextPollRef.current = false
      return
    }
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setHistory(data.history ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      // Silent fail — progressive enhancement
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling every 60s
  useEffect(() => {
    fetchNotifications()
    intervalRef.current = setInterval(fetchNotifications, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchNotifications])

  const openModal = useCallback(() => setIsModalOpen(true), [])
  const closeModal = useCallback(() => setIsModalOpen(false), [])

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update on both notifications and history
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setHistory((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))

    // Skip the next poll cycle to prevent race condition overwriting read-state
    skipNextPollRef.current = true

    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markRead: id }),
    }).catch(() => {})
  }, [])

  const markAllRead = useCallback(async () => {
    const allIds = [
      ...notifications.filter((n) => !n.read).map((n) => n.id),
      ...history.filter((n) => !n.read).map((n) => n.id),
    ]
    const uniqueIds = [...new Set(allIds)]
    if (uniqueIds.length === 0) return

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setHistory((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)

    // Skip the next poll cycle to prevent race condition overwriting read-state
    skipNextPollRef.current = true

    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: uniqueIds }),
    }).catch(() => {})
  }, [notifications, history])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        history,
        unreadCount,
        loading,
        isModalOpen,
        openModal,
        closeModal,
        markAsRead,
        markAllRead,
        refresh: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
