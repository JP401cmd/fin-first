---
id: 0003-supabase-auth-canoniek
title: Supabase Auth is het canonieke auth-model
status: aanvaard
date: 2026-06-01
elements: [t-supabase, data-cont]
---

Authenticatie en autorisatie lopen volledig via Supabase Auth met Row Level Security op `auth.uid()`. De better-auth-scaffolding in `src/lib` is geen onderdeel van het lopende model.

## Context
Er stonden resten van een tweede auth-aanpak (better-auth) in de repo, wat verwarring gaf over welk model geldt.

## Besluit
Supabase Auth + RLS is canoniek. Elke server-query draait met de RLS-context van de ingelogde gebruiker; cross-user toegang loopt uitsluitend via RLS-veilige RPC's.

## Gevolgen
De better-auth-resten zijn vermoedelijk dood en mogen opgeruimd worden — zie het aandachtspunt op Supabase.
