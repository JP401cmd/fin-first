'use client'

import { ColorPickerCard, type ColorPreset } from '@/components/app/color-picker-card'
import { useModuleColors } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS, type ModuleColorConfig } from '@/lib/color-palette'

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
 * Geen enkele voorkeuze kan op de verzadigde stoplicht-status landen. Let op
 * de precieze formulering: dat is NIET "alle presets onder ACCENT_CHROMA_MAX"
 * (zo stond het tot 8 sep), want die toets weegt hue én chroma. Een tint ver
 * van elke statushue mag ruim boven de band uitkomen en blijft 'ok'. De regel
 * die telt — en die de test pint — is dus: `accentClashesWithStatus` geeft
 * 'ok' voor élke preset. Een eigen kleur via de color-input mag wél warnen —
 * daar waarschuwt de kaart voor (statusHint), zonder te blokkeren. Geborgd in
 * module-accent-picker.test.tsx en lib/color-palette.accent-status.test.ts.
 */

type ModuleKey = keyof ModuleColorConfig

/**
 * Gedeelde ring van alternatieven. Tot 8 sep stonden ze allemaal op C ~ 0,065;
 * dat las als één gedempte familie. Nu verzadigd tot waar de kleur het
 * toelaat — lightness ongewijzigd (lichter maken kostte contrast met papier) —
 * met één harde regel: **elke preset moet 'ok' geven op
 * `accentClashesWithStatus`** (gepind in module-accent-picker.test.tsx).
 *
 * Die toets kijkt naar hue ÉN chroma, en dat maakt de ring bewust ongelijk.
 * Elke tint staat nu op zijn eigen plafond — welk plafond dat is verschilt:
 *  - **Gamut.** Olijf (0,106), Mos (0,141) en Petrol (0,088) zitten op de
 *    sRGB-grens voor hun kleurtoon bij L ≈ 0,52. Petrol oogt daardoor rustiger
 *    dan de rest; dat is natuurkunde, geen keuze, en niet "vergeten mee te
 *    verzadigen".
 *  - **Vangrail.** Bordeaux (4,5° van rood-status) en Oker (9,7° van amber)
 *    liggen bínnen het hue-venster en worden op ~0,094 gehouden. Bordeaux zou
 *    anders naar 0,212 lopen — vrijwel gelijk aan rood-status (0,208). Diezelfde
 *    grens optrekken is op 8 sep geprobeerd en teruggedraaid; zie de toelichting
 *    bij ACCENT_CHROMA_MAX.
 *  - **Doel.** Indigo en Oud-roze (110° resp. 45° van elke statushue) hebben
 *    ruimte zat en staan op 0,165; verder is puur smaak, niet nodig.
 *  - Olijf stond ooit op exact 90,1°, precies 20,0° van amber en daarmee net
 *    wél in het venster. 6° opgeschoven (95,6°) valt hij erbuiten.
 *
 * Verzadig nooit een tint verder zonder die toets opnieuw te draaien: een
 * accent dat in de stoplichtband landt maakt "op koers / aandacht / actie"
 * onleesbaar, en dát is precies wat UR3-32 kwam repareren.
 */
const ACCENT_RING: ColorPreset[] = [
  { name: 'Bordeaux', hex: '#985252' },
  { name: 'Oker', hex: '#905b2b' },
  { name: 'Olijf', hex: '#7b6700' },
  { name: 'Mos', hex: '#4c7800' },
  { name: 'Petrol', hex: '#00777d' },
  { name: 'Indigo', hex: '#515bc6' },
  { name: 'Oud-roze', hex: '#a33986' },
]

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
            statusHint
          />
        )
      })}
    </div>
  )
}
