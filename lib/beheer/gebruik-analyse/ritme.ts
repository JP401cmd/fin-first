/**
 * Het natuurlijke ritme per waardestroom (ADR 0153) — het verwachte aantal
 * dagen tussen twee actieve dagen in die stroom. De pagina zet de gemeten
 * mediaan hiernaast en telt hoeveel gebruikers binnen dit ritme terugkwamen.
 *
 * Instelbaar per stroom-id, niet per naam: hernoemen verandert het ritme niet.
 * `null` = geen terugkeerritme verwacht (Toekomst is eenmalig en daarna bij een
 * levensmoment; Fin is een kanaal, geen waarde). Een stroom die beheer zelf
 * toevoegt, heeft tot iemand hem hier opneemt ook geen ritme.
 *
 * Bron: werkblad "Vier waardes, vier ritmes" (17 sep 2026).
 */
export const STROOM_RITME_DAGEN: Readonly<Record<string, number | null>> = {
  // Wat heb je: maand of kwartaal — de maand is de ondergrens.
  vermogen: 30,
  // Wat komt binnen en gaat eruit: dagelijks met koppeling, wekelijks met
  // bestanden — wekelijks is het eerlijke maximum zonder koppeling.
  budget: 7,
  // Waar loopt dit op uit: eenmalig, daarna bij een levensmoment.
  toekomst: null,
  // Waar kun je op sturen: wekelijks.
  grip: 7,
  // Kanaal, geen waarde.
  fin: null,
}

/** Leesbare omschrijving naast het ritme. */
export const STROOM_RITME_LABEL: Readonly<Record<string, string>> = {
  vermogen: 'maand of kwartaal',
  budget: 'dagelijks met koppeling, wekelijks met bestanden',
  toekomst: 'eenmalig, daarna bij een levensmoment',
  grip: 'wekelijks',
  fin: 'kanaal, geen eigen ritme',
}

export function ritmeVoorStroom(id: string): number | null {
  return Object.prototype.hasOwnProperty.call(STROOM_RITME_DAGEN, id) ? STROOM_RITME_DAGEN[id] : null
}
