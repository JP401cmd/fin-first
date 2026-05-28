import { redirect } from 'next/navigation'

/**
 * /identity/parameters — legacy route. De parameters leven nu inline op
 * /toekomst onder de Voorkeuren-tab (eindstrategie, onttrekking, inflatie,
 * rendement). Hier alleen nog een redirect zodat externe links niet
 * doodlopen.
 *
 * Volgorde / verdeling-bij-toename / onttrekking-bij-afname zijn nog
 * placeholders ("Standaard") in VoorkeurenView — engine-koppeling
 * (fire_params-kolommen + projection-allocator) is een aparte volgende
 * stap. Tot die tijd zijn die kaarten read-only.
 */
export default function ParametersPage() {
  redirect('/toekomst?tab=voorkeuren')
}
