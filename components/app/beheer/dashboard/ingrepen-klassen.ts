/**
 * Klassen waarmee een rij met een ingreep zich verbergt op het filter van de
 * omhullende laag (`IngrepenFilter`). Een eigen bestand zonder `'use client'`:
 * de rijen worden op de server gerenderd, en een constante uit een
 * clientbestand is daar geen tekst maar een verwijzing.
 *
 * Op de rij horen daarnaast:
 *   data-soort="release" | "beheeractie"
 *   data-rest="ja"   voor rijen voorbij de eerste reeks
 *
 * De klassen staan voluit uitgeschreven: Tailwind leest de bron als tekst en
 * vindt een samengestelde naam niet.
 */
export const INGREEP_RIJ_KLASSEN =
  'group-data-[toon=release]/ingrepen:data-[soort=beheeractie]:hidden group-data-[toon=beheeractie]/ingrepen:data-[soort=release]:hidden group-data-[alles=nee]/ingrepen:data-[rest=ja]:hidden'
