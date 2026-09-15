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

/**
 * Gedeelde ring van achttien alternatieven: een raster van 20° over de hele
 * kleurencirkel, elk op zijn **sRGB-gamutgrens** — de fysieke bovengrens, niet
 * een gekozen getal.
 *
 * Het raster begint bewust op 17° en niet op 0°. Dat is de offset die de
 * grootste afstand houdt tot de vier standaarden (kern 165,6° · wil 49,9° ·
 * horizon 244,2° · fin 308,2°): minimaal 7,1°, tegen 4,1° bij zestien tinten en
 * 3,2° bij twintig. Zonder die offset zou op elke kaart een ring-tint vrijwel
 * samenvallen met de standaard erboven.
 *
 * Sinds 8 sep 2026 geldt hier GEEN chroma-plafond meer: de koppeling met de
 * stoplicht-semantiek is voor accenten losgelaten (eigenaarsbesluit, zie
 * DEFAULT_MODULE_COLORS in lib/color-palette.ts). Scharlaken en Karmijn liggen
 * daardoor bewust naast "actie"-rood, Oker naast "aandacht"-amber en Smaragd
 * naast "op koers"-groen. Dat is geen ongeluk en geen drift.
 *
 * **EIGENAARSBESLUIT 15 sep 2026: elke tint op zijn eigen chroma-optimale
 * lightness, niet meer allemaal op één vaste L ~ 0,52.** Voorheen was de hele
 * ring op één lightness geplat (gekozen omdat dat de bovengrens was voor de
 * meest beperkte hue in de set); dat liet chroma liggen bij elke hue waarvan
 * de sRGB-piek elders ligt. Per tint gezocht naar de lightness die de chroma
 * maximaliseert zónder onder de AA-ondergrens (4,5:1 op papier `#faf9f6`,
 * marge ingebouwd) te zakken: groen/oranje/geel pieken pas ver boven L 0,52
 * (te donker leesbaar, dus daar geldt de AA-grens als plafond); blauw/paars
 * (Indigo, Violet) piekt juist ónder of rond L 0,52 — die twee kregen dus
 * hun eigen, lagere piek-L in plaats van de AA-grens, en werden zo ook
 * feller. Netto chroma-winst t.o.v. 8 sep: 4-14% op vrijwel alle tinten.
 *
 * Waarom ze niet allemaal even fel ogen: sRGB laat in het groen/teal nog altijd
 * maar C ~ 0,10-0,13 toe tegen ~0,29-0,30 in het blauw/paars. Dat is de gamut,
 * geen terughoudendheid.
 *
 * Alle achttien halen minimaal 4,55:1 tegen papier (WCAG AA voor tekst = 4,5),
 * gepind in module-accent-picker.test.tsx.
 */
const ACCENT_RING: ColorPreset[] = [
  { name: 'Scharlaken', hex: '#e30046' },
  { name: 'Roest', hex: '#d03e00' },
  { name: 'Karamel', hex: '#b05c00' },
  { name: 'Oker', hex: '#996900' },
  { name: 'Olijf', hex: '#867100' },
  { name: 'Mos', hex: '#6c7900' },
  { name: 'Gras', hex: '#398200' },
  { name: 'Smaragd', hex: '#00834f' },
  { name: 'Jade', hex: '#00816e' },
  { name: 'Petrol', hex: '#007f82' },
  { name: 'Staal', hex: '#007d96' },
  { name: 'Kobalt', hex: '#0079ae' },
  { name: 'Ultramarijn', hex: '#006ee5' },
  { name: 'Indigo', hex: '#4b00fe' },
  { name: 'Violet', hex: '#8900fe' },
  { name: 'Orchidee', hex: '#be00ea' },
  { name: 'Magenta', hex: '#d200b2' },
  { name: 'Karmijn', hex: '#dd007e' },
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
          />
        )
      })}
    </div>
  )
}
