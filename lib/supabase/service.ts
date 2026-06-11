// lib/supabase/service.ts
//
// Service-role-client voor server-side admin-leesacties die bewust RLS
// passeren (supportview, AVG-export, platform-KPI's). Gebruik ALTIJD samen
// met een expliciete isSuperAdmin-check én een audit-log-entry; geef deze
// client nooit door aan code die met gebruikersinput query't zonder filter.
//
// Achtergrond: superadmin-inzage liep eerst via brede RLS-SELECT-policies
// ("assets superadmin select" e.d.). Die lekten alle gebruikersdata in elke
// gewone app-query van een superadmin-sessie, omdat de domein-loaders op RLS
// vertrouwen voor row-scoping. Cross-user leesrecht hoort daarom uitsluitend
// hier, server-side, achter een rolcheck — nooit in RLS voor interactieve
// sessies.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey)
}
