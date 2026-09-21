// ── Herberekening na terugtrekken (B4) — stub tot 1B ─────────────────────────
//
// Trekt beheer een duiding terug (fase 2 van 1A: POST /api/admin/news-duiding/
// terugtrekken), dan moeten de edities waarin dat artikel stond opnieuw worden
// berekend. In 1A bestaat er nog geen editie die duidingen leest, dus is er
// niets te herberekenen. 1B vult deze functie: via de meta-kolommen
// (`artikel-id → editie-item → user_id`) de geraakte edities van de lopende
// week vinden, de matcher opnieuw draaien zonder dit artikel en de oude editie
// als vervangen markeren. Nooit editie-inhoud lezen vanuit beheer (ADR 0146).
//
// Contract voor 1B (blok ONDERZOEK op kaart 1A, punt 6 en 7).

import type { SupabaseClient } from '@supabase/supabase-js'

export interface HerberekeningResultaat {
  /** Aantal edities dat opnieuw is berekend. */
  edities: number
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function herberekenNaTerugtrekking(_service: SupabaseClient, _articleId: string): Promise<HerberekeningResultaat> {
  return { edities: 0 }
}
