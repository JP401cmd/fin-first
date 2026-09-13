import type { AssetType } from '@/lib/asset-data'

/**
 * Bezittingstypen die de kern NIET als direct besteedbaar ziet en waarvoor stap 4
 * van de plan-review ("Je huis en ander vast bezit") relevant is: het eigen huis
 * (woningblok, `housing_strategy_config`) plus de generiek-liquideerbare typen
 * (`sale_config`; spiegel van `LIQUIDATABLE_NON_LIQUID` in
 * `lib/horizon-kernel/adapter/potten.ts`, dat die set bewust privé houdt).
 *
 * Alleen weergave-gating (toont de stap wel/niet); de kern leest deze set niet.
 */
export const NIET_LIQUIDE_ASSET_TYPES: ReadonlySet<AssetType> = new Set<AssetType>([
  'eigen_huis',
  'vehicle',
  'physical',
  'other',
  'deelneming',
  'real_estate',
])
