/**
 * Smoke test for <FormError /> — verifies the a11y contract the component
 * promises in its docstring:
 *
 *  1. No message → renders nothing (return null, not even an empty <p>).
 *  2. Error severity → role="alert" (assertive by default).
 *  3. Warning severity → role="status" + aria-live="polite".
 *  4. The `id` prop reaches the DOM so callers can wire aria-describedby.
 *  5. `formErrorId()` returns the documented shape.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { FormError, formErrorId } from '../form-error'

describe('FormError', () => {
  it('renders nothing when message is null', () => {
    const { container } = render(<FormError id="form-error-amount" message={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when message is undefined', () => {
    const { container } = render(<FormError id="form-error-amount" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when message is an empty string', () => {
    const { container } = render(<FormError id="form-error-amount" message="" />)
    expect(container.firstChild).toBeNull()
  })

  it('uses role="alert" for error severity (default)', () => {
    const { getByRole } = render(
      <FormError id="form-error-amount" message="Vul een bedrag groter dan 0 in." />
    )
    const alert = getByRole('alert')
    expect(alert).toHaveTextContent('Vul een bedrag groter dan 0 in.')
    // role="alert" brings implicit aria-live="assertive"; we don't set it
    // explicitly, so the attribute should be absent from the DOM.
    expect(alert).not.toHaveAttribute('aria-live')
  })

  it('uses role="status" + aria-live="polite" for warning severity', () => {
    const { getByRole } = render(
      <FormError
        id="form-error-amount"
        message="Hoger dan je gemiddelde — zeker weten?"
        severity="warning"
      />
    )
    const status = getByRole('status')
    expect(status).toHaveTextContent('Hoger dan je gemiddelde — zeker weten?')
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('applies the id prop to the root element', () => {
    const id = 'form-error-amount'
    const { getByRole } = render(
      <FormError id={id} message="Vul een bedrag in." />
    )
    expect(getByRole('alert')).toHaveAttribute('id', id)
  })

  it('formErrorId() returns the documented pattern', () => {
    expect(formErrorId('amount')).toBe('form-error-amount')
    expect(formErrorId('billing-email')).toBe('form-error-billing-email')
  })
})
