'use client'

import { type ReactNode, useState, useEffect, useRef, useCallback } from 'react'
import { useMobilePreview, DEVICE_PRESETS } from './mobile-preview-provider'

const NAV_ROUTES = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Kern', path: '/core' },
  { label: 'Wil', path: '/will' },
  { label: 'Horizon', path: '/horizon' },
]

export function MobilePreviewFrame({ children }: { children: ReactNode }) {
  const { enabled, device, setDevice, setEnabled } = useMobilePreview()
  const [isIframe, setIsIframe] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [activePath, setActivePath] = useState('/dashboard')

  useEffect(() => {
    setIsIframe(window.self !== window.top)
  }, [])

  const navigateIframe = useCallback((path: string) => {
    setActivePath(path)
    if (iframeRef.current) {
      iframeRef.current.src = path
    }
  }, [])

  // When inside an iframe or not enabled, render children normally
  if (!enabled || isIframe) return <>{children}</>

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center bg-zinc-800">
      {/* Toolbar */}
      <div className="flex w-full items-center justify-between px-4 py-3 bg-zinc-900">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-300">Device:</span>
          <select
            value={device.name}
            onChange={(e) => {
              const match = DEVICE_PRESETS.find(d => d.name === e.target.value)
              if (match) setDevice(match)
            }}
            className="rounded-md border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {DEVICE_PRESETS.map(d => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.width}&times;{d.height})
              </option>
            ))}
          </select>

          <div className="mx-2 h-5 w-px bg-zinc-700" />

          {NAV_ROUTES.map(r => (
            <button
              key={r.path}
              onClick={() => navigateIframe(r.path)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activePath === r.path
                  ? 'bg-zinc-600 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEnabled(false)}
          className="rounded-lg bg-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600"
        >
          Sluit preview
        </button>
      </div>

      {/* Phone frame container */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <PhoneFrame width={device.width} height={device.height}>
          <iframe
            ref={iframeRef}
            src="/dashboard"
            style={{ width: device.width, height: '100%', border: 'none' }}
            title="Mobile preview"
          />
        </PhoneFrame>
      </div>
    </div>
  )
}

function PhoneFrame({
  width,
  height,
  children,
}: {
  width: number
  height: number
  children: ReactNode
}) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    function calcScale() {
      const maxH = window.innerHeight - 52 - 32 - 40
      const maxW = window.innerWidth - 32
      const bezelW = width + 24
      const bezelH = height + 80
      setScale(Math.min(1, maxW / bezelW, maxH / bezelH))
    }
    calcScale()
    window.addEventListener('resize', calcScale)
    return () => window.removeEventListener('resize', calcScale)
  }, [width, height])

  const bezelW = width + 24
  const bezelH = height + 80

  return (
    <div
      style={{
        width: bezelW,
        height: bezelH,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
      }}
      className="relative flex flex-col rounded-[40px] border-4 border-zinc-600 bg-black shadow-2xl"
    >
      {/* Notch */}
      <div className="flex h-10 items-center justify-center">
        <div className="h-5 w-28 rounded-full bg-zinc-900 border border-zinc-700" />
      </div>

      {/* Content area */}
      <div
        className="relative flex-1 overflow-hidden rounded-b-[36px] bg-zinc-50"
        style={{ width, margin: '0 auto' }}
      >
        {children}
      </div>

      {/* Bottom bar indicator */}
      <div className="flex h-[30px] items-center justify-center">
        <div className="h-1 w-32 rounded-full bg-zinc-600" />
      </div>
    </div>
  )
}
