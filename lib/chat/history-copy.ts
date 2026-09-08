import type { ChatHistoryMode } from './history/types'

/**
 * De teksten van de opslagkeuze — één bron voor de twee bedieningen.
 *
 * De keuze staat op twee plekken: compact in de instellingen ín het gesprek
 * (daar merk je dát je iets anders wilt) en volledig op /mijn/privacy. Dat zijn
 * twee BEDIENINGEN, geen twee administraties — en dus ook niet twee teksten die
 * langzaam uit elkaar lopen. Wie hier iets wijzigt, wijzigt het overal.
 */
export const CHAT_HISTORY_OPTIES: ReadonlyArray<{
  mode: ChatHistoryMode
  label: string
  /** Eén regel voor de popover. */
  kort: string
  /** De volledige uitleg voor /mijn/privacy, inclusief wat je kwijtraakt. */
  uitleg: string
}> = [
  {
    mode: 'account',
    label: 'Op mijn account',
    kort: 'Overal terug te vinden, ook op je telefoon.',
    uitleg:
      'Je gesprekken staan bij je andere gegevens en zijn op elk apparaat terug te vinden. Ze verdwijnen zodra je je account verwijdert.',
  },
  {
    mode: 'apparaat',
    label: 'Alleen op dit apparaat',
    kort: 'Blijft op dit toestel, gaat niet mee naar je telefoon.',
    uitleg:
      'Je gesprekken blijven in deze browser op dit toestel. Wis je je browsergegevens of stap je over op een ander apparaat, dan zijn ze weg — wij kunnen ze dan niet terughalen.',
  },
  {
    mode: 'uit',
    label: 'Niet bewaren',
    kort: 'Weg zodra je het venster sluit.',
    uitleg:
      'Er wordt niets bewaard: zodra je het venster sluit is het gesprek weg. Gesprekken die je eerder bewaarde blijven staan tot je ze zelf verwijdert.',
  },
]

/**
 * De privacyvloer, in gebruikerstaal. Staat onder élke plek waar de keuze
 * gemaakt wordt — de belofte "je vraag verlaat je toestel niet" mag nooit
 * naast een instelling staan die het tegendeel lijkt te zeggen.
 */
export const CHAT_HISTORY_VLOER_REGEL =
  'Gesprekken die je met de lokale AI voerde bewaren we altijd alleen op dit apparaat — ook als je hierboven "op mijn account" kiest.'

/**
 * De titel van een nieuw gesprek, afgeleid uit de eerste vraag (B5).
 *
 * Kapt op woordgrens af met een beletselteken, zodat er nooit een half woord in
 * de gesprekkenlijst staat. Woont hier en niet in `history/device-store.ts`: het
 * chatpaneel heeft 'm nodig bij elke eerste beurt, en die import trok de hele
 * IndexedDB-rug het chat-chunk in terwijl het paneel de apparaatrug alleen via
 * de lui geladen facade hoort te raken.
 */
export function chatTitelUitVraag(vraag: string): string {
  const schoon = vraag.trim().replace(/\s+/g, ' ')
  if (schoon.length <= 60) return schoon || 'Nieuw gesprek'
  const afgekapt = schoon.slice(0, 60)
  const spatie = afgekapt.lastIndexOf(' ')
  return (spatie > 24 ? afgekapt.slice(0, spatie) : afgekapt).trimEnd() + '…'
}

/** Leest een onbekende waarde als opslagkeuze; alles wat niet klopt wordt 'account'. */
export function parseChatHistoryMode(waarde: unknown): ChatHistoryMode {
  return waarde === 'apparaat' || waarde === 'uit' ? waarde : 'account'
}
