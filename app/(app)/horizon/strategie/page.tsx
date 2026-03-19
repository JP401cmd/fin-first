import { redirect } from 'next/navigation'

/**
 * /horizon/strategie now redirects to /horizon with the strategie modal open.
 * The actual content lives in components/app/horizon/strategie-modal.tsx.
 */
export default function StrategieRedirectPage() {
  redirect('/horizon?strategie=open')
}
