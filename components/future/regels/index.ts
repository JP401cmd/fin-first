import type { ComponentType } from 'react'
import type { RegelId } from '@/lib/future/regel-registry'
import type { RegelBodyProps } from './types'
import { EindstrategieBody } from './eindstrategie-body'
import { OnttrekkingsstrategieBody } from './onttrekkingsstrategie-body'
import { OnttrekkingsvolgordeBody } from './onttrekkingsvolgorde-body'
import { VerdelingToenameBody } from './verdeling-toename-body'
import { OnttrekkingAfnameBody } from './onttrekking-afname-body'

/** RegelId → body-component. Houdt de RegelBewerkenPane-switch op één regel. */
export const REGEL_BODIES: Record<RegelId, ComponentType<RegelBodyProps>> = {
  eindstrategie: EindstrategieBody,
  onttrekkingsstrategie: OnttrekkingsstrategieBody,
  onttrekkingsvolgorde: OnttrekkingsvolgordeBody,
  'verdeling-toename': VerdelingToenameBody,
  'onttrekking-afname': OnttrekkingAfnameBody,
}

export type { RegelBodyProps, RegelEditActionsState } from './types'
