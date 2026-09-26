'use client'

/**
 * `useLiveActionBar` — registreert een action-bar in de mobiele shell zolang de aanroeper
 * gemount is (ADR 0179 D7: de opslaan-balk van het doelscenario-lab is op mobiel de
 * action-bar van de shell).
 *
 * De shell kende de live-override al (`LiveBottomBarContext` in `nav-stack-provider.tsx`,
 * gelezen door `MobileBottomBar`), maar er was geen registratiepad: `NavStackMeta` kan geen
 * `onClick` dragen (sessionStorage). Deze hook is dat pad.
 *
 * - `null` = geen bar (de pill blijft staan); een config = de bar vervangt de lege
 *   BottomBar-slot en de zwevende pill wijkt (`floating-nav-button.tsx`).
 * - De handlers lopen via een ref: een nieuwe render met verse closures herregistreert niet
 *   (geen register-lus), alleen een wijziging in label, disabled-stand of aanwezigheid doet dat.
 * - `disabled` bestaat niet in `BottomBarAction`; een uitgeschakelde knop krijgt geen
 *   `onClick`, en `ActionButton` rendert hem dan al als disabled.
 * - Unmount (of `null`) ruimt de override op.
 */

import { useEffect, useRef } from 'react'
import { useLiveBottomBar } from './nav-stack-provider'

export interface LiveActionBarKnop {
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface LiveActionBarConfig {
  primary: LiveActionBarKnop
  secondary?: LiveActionBarKnop
}

export function useLiveActionBar(config: LiveActionBarConfig | null): void {
  const live = useLiveBottomBar()
  const setConfig = live?.setConfig
  const handlersRef = useRef<{ primary?: () => void; secondary?: () => void }>({})
  handlersRef.current = { primary: config?.primary.onClick, secondary: config?.secondary?.onClick }

  // Alleen de zichtbare vorm triggert een herregistratie.
  const sleutel =
    config == null
      ? null
      : JSON.stringify([
          config.primary.label,
          !!config.primary.disabled,
          config.secondary?.label ?? null,
          !!config.secondary?.disabled,
        ])

  useEffect(() => {
    if (!setConfig) return
    if (config == null) {
      setConfig(null)
      return
    }
    setConfig({
      kind: 'action-bar',
      primary: {
        label: config.primary.label,
        onClick: config.primary.disabled ? undefined : () => handlersRef.current.primary?.(),
      },
      ...(config.secondary
        ? {
            secondary: {
              label: config.secondary.label,
              onClick: config.secondary.disabled ? undefined : () => handlersRef.current.secondary?.(),
            },
          }
        : {}),
    })
    // `config` zit in `sleutel`; de handlers in de ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setConfig, sleutel])

  useEffect(() => {
    if (!setConfig) return
    return () => setConfig(null)
  }, [setConfig])
}
