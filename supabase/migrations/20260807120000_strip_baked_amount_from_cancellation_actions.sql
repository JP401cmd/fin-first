-- Privacy-modus dekt álle bedragen — cluster A9 (opzeg-actie)
--
-- Tot nu toe bakte de opzeg-modal het maandbedrag in de vrije omschrijving van
-- de actie: "Opzegbrief klaargezet voor Netflix (€ 12/mnd). Open deze actie …".
-- Maskering in TriFinity is client-side en per call-site opt-in; een bedrag dat
-- eenmaal ín een tekstveld staat kan de privacy-toggle achteraf nooit meer
-- verbergen. De code schrijft het bedrag nu apart weg (euro_impact_monthly +
-- metadata.monthly_amount) en rendert het live via <MaskedAmount>.
--
-- Deze migratie is de eenmalige opruiming van de rijen die vóór die wijziging
-- zijn aangemaakt: het "(€ …/mnd)"-tussenvoegsel wordt uit de omschrijving
-- gehaald. Het bedrag zelf gaat niet verloren — het staat al in
-- metadata.monthly_amount en euro_impact_monthly van dezelfde rij.
--
-- Bewust nauw afgebakend:
--   * alleen rijen met metadata->>'type' = 'subscription_cancellation';
--   * alleen het letterlijke "(€…/mnd)"-patroon dat de modal genereerde, zodat
--     een door de gebruiker zelf getypte omschrijving ongemoeid blijft;
--   * idempotent — een tweede run vindt niets meer te vervangen.

update public.actions
set description = regexp_replace(description, '\s*\(€[^)]*/mnd\)', ''),
    updated_at = now()
where metadata->>'type' = 'subscription_cancellation'
  and description ~ '\(€[^)]*/mnd\)';
