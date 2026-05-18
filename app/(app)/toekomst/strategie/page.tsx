import { redirect } from 'next/navigation'

/**
 * /toekomst/strategie redirect naar /toekomst met de strategie-modal open.
 * De content leeft in components/app/horizon/strategie-modal.tsx en wordt
 * door HorizonPage (op /toekomst) opgepakt via de strategie-query-param.
 */
export default function ToekomstStrategieRedirectPage() {
  redirect('/toekomst?strategie=open')
}
