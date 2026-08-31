-- Server-side onboarding-concept: bewaar het lopende onboarding-antwoordenblok
-- op de eigen profielrij, zodat een page-reload de invoer niet meer wist.
--
-- WAAROM (kaart UR2-01, P0): sinds de security-fix van jul 2026 bewaarde de
-- onboarding alléén een NIET-gevoelig concept in localStorage (stap-positie +
-- keuzes-zonder-bedrag). Bedragen, bezittingen, schulden, naam en geboortedatum
-- leefden uitsluitend in de in-memory React-state en waren na élke reload weg —
-- inclusief een HMR-reload, een tabje-refresh of een crash. Voor een app die om
-- gevoelige bedragen vraagt is dat een blokkerende frictiebron: de gebruiker
-- verliest alle geïnvesteerde moeite en vult in het gunstigste geval opnieuw in.
--
-- De keuze van jul 2026 blijft overeind: gevoelige onboarding-data hoort NIET in
-- localStorage (gedeeld apparaat, XSS). Ze verhuist naar de plek waar dezelfde
-- data na afronding tóch al landt — de eigen, RLS-gescopede profielrij. Het
-- concept wordt gewist zodra de onboarding is afgerond of afgebroken.
--
-- BEWUST NIET IN HET CONCEPT: het geparste pensioenoverzicht
-- (`pension.parseResult`). Dat blijft per ADR 0115 op het toestel; de
-- serialisatie in `app/(onboarding)/onboarding/draft-persistence.ts` laat het
-- veld weg en de gebruiker leest zijn overzicht na een reload opnieuw in.
--
-- TOEGANGSMODEL (geen nieuwe policy nodig):
--   profiles heeft al row-level eigen-rij toegang: GRANT op tabelniveau voor
--   'authenticated' + RLS-policy "Users can manage own profile"
--   USING (auth.uid() = id). RLS is row-level (niet kolom-level) en er bestaat
--   geen kolom-scoped GRANT, dus deze nieuwe kolom valt automatisch onder de
--   bestaande eigen-rij SELECT/UPDATE. /api/onboarding/draft doet lezen en
--   schrijven op de eigen rij via de anon RLS-client (nooit service-role).
--
-- PUUR ADDITIEF: raakt verder niets aan; veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists onboarding_draft jsonb;

comment on column public.profiles.onboarding_draft is
  'Lopend onboarding-concept van deze gebruiker (stap-positie + alle tot dusver gegeven antwoorden, inclusief bedragen/bezittingen/schulden). NULL = geen lopend concept. Gezet/gelezen/gewist door /api/onboarding/draft; wordt gewist bij het afronden of afbreken van de onboarding. Bevat bewust GEEN geparst pensioenoverzicht (ADR 0115: dat blijft op het toestel).';
