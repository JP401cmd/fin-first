/**
 * Namen en uitleg van de volgorde-presets voor de twee orde-regels (onttrekkingsvolgorde en
 * onttrekking bij afname). Eén bron voor de presetkiezer (`OrderPresetPicker`) en de
 * rijwaarde in katern Instellingen ("Spaargeld eerst"): pure module, zodat ook `lib/` hem
 * kan lezen zonder een client-component te importeren.
 *
 * Beschrijft de volgorde zoals de kern hem rekent (`prio-overgang.ts#orderedGroupsToPrio`:
 * plek → prio min(plek, 4), gewicht ½^(prio−1)): vooraan = het zwaarst aangesproken, de rest
 * loopt in afnemende mate mee. Geen oordeel ("gunstig", "beschermen"), geen belofte (Wft;
 * compliance-check TPR-15 14 sep 2026). Getoetst in `plan-review/wizard-kopij.test.ts`.
 */

import type { OrderPresetId } from '@/lib/pot-rules'

export const ORDER_PRESET_COPY: Record<OrderPresetId, { title: string; description: string }> = {
  'liquide-eerst': {
    title: 'Spaargeld eerst',
    description:
      'Spaargeld staat vooraan en wordt het zwaarst aangesproken; beleggingen en overig lopen in afnemende mate mee, pensioen en vastgoed het minst.',
  },
  'rendement-beschermen': {
    title: 'Beleggingen achteraan',
    description: 'Spaargeld staat vooraan; beleggingen staan achteraan en worden het minst aangesproken.',
  },
  'fiscaal-box3': {
    title: 'Beleggingen eerst',
    description:
      'Beleggingen staan vooraan en worden het zwaarst aangesproken; spaargeld loopt in mindere mate mee.',
  },
  'pensioen-sparen': {
    title: 'Pensioen achteraan',
    description:
      'Je pensioenbezittingen staan achteraan en worden het minst aangesproken; spaargeld staat vooraan.',
  },
  aangepast: {
    title: 'Aangepast',
    description: 'Bepaal de volgorde zelf met de slepen-editor hieronder.',
  },
}
