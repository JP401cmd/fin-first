'use client'

import { useId, useState } from 'react'
import { sanitizeAmountInput, type AmountSignPolicy } from '@/lib/amount-input'

/**
 * `<AmountInput>` — DE canonieke bedrag-invoer van de app (bevinding H9).
 *
 * ## Wat dit anders doet dan de velden die het vervangt
 *
 * Het patroon dat hier vervangen wordt is `onChange={(e) =>
 * setX(e.target.value.replace(/[^0-9.,]/g, ''))}`, letterlijk gekopieerd naar
 * 15+ bestanden. Dat stript per toetsaanslag alles wat geen cijfer/punt/komma
 * is — letters én het minteken — en zegt er niets over. Getypt `-500` werd
 * stilzwijgend `500`, en de gebruiker rekende de rest van zijn plan door op een
 * bedrag dat hij nooit heeft ingevoerd.
 *
 * Deze component weigert nog steeds dezelfde tekens, maar **zichtbaar**: naast
 * het veld verschijnt wat er geweigerd is en waarom. Dat is de hele bugfix.
 *
 * ## Drie dingen die een aanroeper moet kiezen
 *
 * 1. `sign` — mag dit veld negatief zijn? Expliciet, want de app had drie
 *    parse-helpers met drie verschillende antwoorden en de gebruiker kon nooit
 *    zien welk antwoord voor zijn veld gold. `positive-only` is de default,
 *    omdat de overgrote meerderheid van de bedragvelden dat is; velden waar
 *    negatief een echte domeinregel is (netto-vermogen-backfill) zetten
 *    `allow-negative`.
 * 2. `error` — een validatiefout van BUITEN (uit de save-handler). Die wint van
 *    de tik-melding en zet het veld op `aria-invalid`, zodat "er gebeurt niets
 *    waarneembaars" niet meer kan: de fout staat bij het veld, niet onderaan een
 *    lang formulier.
 * 3. `inputRef` — nodig om naar de fout te kunnen scrollen. Zonder dat blijft
 *    een foutmelding buiten beeld op een lang formulier even onvindbaar als
 *    voorheen.
 *
 * ## Waarom `type="text"` en niet `type="number"`
 *
 * `type="number"` laat de browser zelf beslissen wat er met ongeldige tekens
 * gebeurt — meestal: stilzwijgend weggooien, of `value` leeg teruggeven zonder
 * dat de gebruiker iets ziet veranderen. Dat is dezelfde bug een laag lager, en
 * niet te repareren vanuit React. `inputMode="decimal"` geeft op mobiel
 * hetzelfde numerieke toetsenbord zonder die verrassing.
 */
export interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  /** Mag dit veld negatief zijn? Altijd bewust kiezen. */
  sign?: AmountSignPolicy
  /** Validatiefout van buiten (save-handler). Wint van de tik-melding. */
  error?: string | null
  id?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  title?: string
  className?: string
  'aria-label'?: string
  'data-testid'?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  onBlur?: () => void
}

export function AmountInput({
  value,
  onChange,
  sign = 'positive-only',
  error = null,
  id,
  name,
  placeholder,
  disabled,
  readOnly,
  title,
  className,
  inputRef,
  onBlur,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: AmountInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-melding`

  // De tik-melding is bewust vluchtig: hij verschijnt zodra er iets geweigerd
  // wordt en verdwijnt bij de eerstvolgende toetsaanslag die wél helemaal
  // geaccepteerd is. Een blijvende melding zou na correctie een fout suggereren
  // die er niet meer is.
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)

  const message = error ?? rejectionReason
  const isInvalid = Boolean(error)

  function handleChange(raw: string) {
    const result = sanitizeAmountInput(raw, sign)
    setRejectionReason(result.reason)
    onChange(result.value)
  }

  return (
    <>
      <input
        id={inputId}
        name={name}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readOnly}
        title={title}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={isInvalid || undefined}
        aria-describedby={message ? messageId : undefined}
        data-testid={testId}
        className={
          className ??
          `w-full rounded-[var(--r)] border px-3 py-2 text-sm ${
            isInvalid
              ? 'border-negative bg-negative/5 text-negative'
              : 'border-[var(--border-ed)]'
          }`
        }
      />
      {/* Altijd gemount: een regio die pas bij een fout in de DOM verschijnt,
          wordt door schermlezers niet betrouwbaar voorgelezen. */}
      <p
        id={messageId}
        role={isInvalid ? 'alert' : 'status'}
        aria-live="polite"
        className={`mt-1 text-[11px] leading-snug ${message ? 'text-negative' : 'sr-only'}`}
      >
        {message ?? ''}
      </p>
    </>
  )
}
