/**
 * Deeplink naar de gezondheidskassabon op /overzicht.
 *
 * De kaart "Financiële gezondheid" op de hub draagt het anker `#gezondheid`; de
 * hub opent de kassabon zodra dat anker in de URL staat (bij het laden, of na
 * een fragmentnavigatie op dezelfde pagina — zie `useOpenOnHash`). Zo leidt de
 * widget gezondheids_score naar dezelfde kassabon, met het verloop, in plaats van
 * een eigen verloop te tonen.
 *
 * Let op: een `next/link` naar hetzelfde pad met alleen een ander anker vuurt
 * geen `hashchange` (de router doet `pushState` en scrollt alleen). Wie de
 * kassabon vanaf /overzicht zelf wil openen, gebruikt een gewone `<a>`.
 */
export const GEZONDHEID_ANKER_ID = 'gezondheid'
export const GEZONDHEID_KASSABON_HASH = `#${GEZONDHEID_ANKER_ID}`
export const GEZONDHEID_KASSABON_HREF = `/overzicht${GEZONDHEID_KASSABON_HASH}`
