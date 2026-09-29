/**
 * De VORM van een foutsoort-sleutel: 16 hexadecimale tekens.
 *
 * Een eigen module zonder imports, zodat ook de browser hem kan lezen. De
 * sleutel zelf wordt berekend in `./error-signature` (met `node:crypto`, dus
 * alleen op de server); `/beheer/errors` toetst er een waarde uit de URL mee
 * voordat hij haar gebruikt.
 */
export const ERROR_SIGNATURE_RE = /^[0-9a-f]{16}$/
