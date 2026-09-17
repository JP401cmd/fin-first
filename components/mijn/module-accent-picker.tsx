'use client'

import { ColorPickerCard, type ColorPreset } from '@/components/app/color-picker-card'
import { useModuleColors } from '@/components/app/module-color-provider'
import { ACCENT_RING, DEFAULT_MODULE_COLORS, type ModuleColorConfig } from '@/lib/color-palette'

/**
 * ModuleAccentPicker — voor elk van de vier accentkleuren een
 * ColorPickerCard: ronde swatch met native color-input (volledig eigen
 * kleur kiesbaar), live 11-shade palettestrip, de 8 voorkeuze-tinten als
 * presets, hex-weergave en een per-kaart reset naar de TriFinity-default.
 * Effect direct zichtbaar via ModuleColorProvider CSS-vars (geen reload) +
 * debounced opgeslagen naar profiles.module_colors. De native color-input
 * vuurt onChange continu tijdens slepen — gewenst (live preview); de
 * provider persisteert debounced.
 *
 * Interne keys/CSS-vars (kern/wil/horizon/fin, --color-kern-* etc.) blijven
 * ongewijzigd — die namen dragen ook de AI-DNA, WidgetModule en NavModule,
 * dus een kleur-scoped rename zou het vocabulaire splitsen (besluit UR3-32).
 * De gebruikerszichtbare indeling volgt sinds die kaart de hefbomen:
 *  - kern    -> Bezittingen (kleurt ook /overzicht en Fins linkeroog)
 *  - wil     -> Schulden    (kleurt ook /mijn en Fins rechteroog)
 *  - horizon -> Budget      (kleurt ook /toekomst en Fins onderste stip)
 *  - fin     -> Fin         (bubbel, chat-header, verzendknop, /berichten, /nieuws)
 *
 * **De stoplicht-waarschuwing is hier bewust weg** (8 sep 2026, eigenaars-
 * besluit). Tot dan hield deze kaart elke voorkeuze buiten de verzadigde
 * stoplichtband en waarschuwde `statusHint` bij een eigen kleur die er wél in
 * viel. Beide zijn losgelaten: de ring mag nu tot de gamutgrens gaan en een
 * eigen kleur krijgt geen status-waarschuwing meer. `contrastHint` blijft wél —
 * leesbaarheid is een andere afweging en die is niet losgelaten.
 *
 * `accentClashesWithStatus` bestaat nog en bewaakt onverkort de budget- en
 * fasekleuren; die zijn hier niet bij betrokken.
 */

type ModuleKey = keyof ModuleColorConfig

const MODULE_SWATCHES: Record<
  ModuleKey,
  { label: string; sublabel: string; presets: ColorPreset[] }
> = {
  kern: {
    label: 'Bezittingen',
    sublabel: 'Kleurt de hefboom Bezittingen, het Overzicht en Fins linkeroog.',
    presets: [{ name: 'Groen (standaard)', hex: DEFAULT_MODULE_COLORS.kern }, ...ACCENT_RING],
  },
  wil: {
    label: 'Schulden',
    sublabel: 'Kleurt de hefboom Schulden, de Mijn-pagina en Fins rechteroog.',
    presets: [{ name: 'Terracotta (standaard)', hex: DEFAULT_MODULE_COLORS.wil }, ...ACCENT_RING],
  },
  horizon: {
    label: 'Budget',
    sublabel: 'Kleurt de hefboom Budget, de Toekomst-pagina en Fins onderste stip.',
    presets: [{ name: 'Staalsblauw (standaard)', hex: DEFAULT_MODULE_COLORS.horizon }, ...ACCENT_RING],
  },
  fin: {
    label: 'Fin',
    sublabel: 'Fins eigen kleur: de bubbel, de chat en je berichten en krant.',
    presets: [{ name: 'Plum (standaard)', hex: DEFAULT_MODULE_COLORS.fin }, ...ACCENT_RING],
  },
}

export function ModuleAccentPicker() {
  const { config, setConfig } = useModuleColors()

  function handlePick(module: ModuleKey, hex: string) {
    setConfig({ ...config, [module]: hex })
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Accentkleuren
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
        Vier accenten met een vaste rol. De drie hefboomkleuren keren terug in
        Fins gezicht: linkeroog Bezittingen, rechteroog Schulden, onderste stip
        Budget. Fins eigen kleur zit om hem heen. Statuskleuren — op koers,
        aandacht, actie — blijven vast: die dragen betekenis, geen identiteit.
      </p>
      {(Object.keys(MODULE_SWATCHES) as ModuleKey[]).map((module) => {
        const { label, sublabel, presets } = MODULE_SWATCHES[module]
        return (
          <ColorPickerCard
            key={module}
            label={label}
            sublabel={sublabel}
            value={config[module]}
            defaultValue={DEFAULT_MODULE_COLORS[module]}
            presets={presets}
            onChange={(hex) => handlePick(module, hex)}
            contrastHint
          />
        )
      })}
    </div>
  )
}
