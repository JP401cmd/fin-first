-- Field-level encryptie — Stage A (PR2), stap 2/3: plaintext-tokens nullen.
--
-- Waarom: nadat de encrypted-only code live is en de bestaande rijen zijn
-- ge-backfilld (scripts/encrypt-existing-bank-credentials.mjs), staan er nog
-- historische plaintext-tokens in `access_token`/`refresh_token`. Deze
-- migratie leegt ze. Aparte stap vóór de DROP zodat een rollback mogelijk
-- blijft (kolommen bestaan nog, alleen leeg).
--
-- ⚠ HARDE GATE — voer deze migratie pas uit NADAT is geverifieerd dat élke
-- rij een geldige encrypted-tegenhanger heeft. Draai vóór deze migratie:
--
--   SELECT count(*) FROM public.bank_connections
--   WHERE (access_token  IS NOT NULL AND access_token_encrypted  IS NULL)
--      OR (refresh_token IS NOT NULL AND refresh_token_encrypted IS NULL);
--
-- Dit MOET 0 zijn. Anders zou nullen (en straks droppen) tokens permanent
-- verliezen. Zie het RUNBOOK op het Notion-kaartje.

UPDATE public.bank_connections
  SET access_token = NULL,
      refresh_token = NULL
  WHERE access_token IS NOT NULL
     OR refresh_token IS NOT NULL;
