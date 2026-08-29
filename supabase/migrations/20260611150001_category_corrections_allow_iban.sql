-- IBAN-gebaseerde categorieregels waren al de bedoeling van de app
-- (categorizeTransaction priority 1a, handleSave in de categoriseer-sheet en
-- saveCorrectionRule in de import slaan ze op), maar de check-constraint
-- stond alleen counterparty_name en description toe. Die inserts faalden
-- stil; de Sleepmodus (die insert-fouten wél controleert) maakte dit
-- zichtbaar. Verruim de constraint met counterparty_iban.

alter table category_corrections
  drop constraint category_corrections_match_field_check;

alter table category_corrections
  add constraint category_corrections_match_field_check
  check (match_field = any (array[
    'counterparty_name'::text,
    'description'::text,
    'counterparty_iban'::text
  ]));
