/**
 * Leesbare labels en indeling van de actie-codes in `admin_actions_log`.
 *
 * Gedeeld door `/beheer/audit` en het beheerdashboard. Tot het dashboard kende
 * de auditpagina tien labels; alle latere codes (`group.*`, `allowlist.*`,
 * `aow.*`, `errors.*`, `nieuws.*`) verschenen daar als kale code.
 *
 * De codes zelf worden gezet in de routes onder `app/api/admin/**` via
 * `logAdminAction` (lib/admin-audit.ts). Een onbekende code valt terug op de
 * code zelf: een label verzinnen zou een actie een betekenis geven die hij
 * niet heeft.
 */

export const ADMIN_ACTIE_LABELS: Record<string, string> = {
  'subscription.update': 'Abonnement gewijzigd',
  'user.role': 'Rol gewijzigd',
  'user.product': 'Product gewijzigd',
  'user.block': 'Account geblokkeerd',
  'user.unblock': 'Account gedeblokkeerd',
  'user.delete': 'Account verwijderd',
  'user.activity': 'Gebruik bekeken',
  'config.update': 'Configuratie gewijzigd',
  'questionnaire.verspreiding': 'Verspreiding vragenlijst gewijzigd',
  'group.create': 'Gebruikersgroep aangemaakt',
  'group.update': 'Gebruikersgroep gewijzigd',
  'group.delete': 'Gebruikersgroep verwijderd',
  'group.leden': 'Groepsleden gewijzigd',
  'group.leden.inzage': 'Groepsleden bekeken',
  'allowlist.add': 'Registratie-toegang toegevoegd',
  'allowlist.remove': 'Registratie-toegang ingetrokken',
  'aow.add': 'AOW-cohort toegevoegd',
  'aow.update': 'AOW-cohort gewijzigd',
  'aow.remove': 'AOW-cohort verwijderd',
  'errors.resolve': 'Foutsoort afgevinkt',
  'errors.reopen': 'Foutsoort heropend',
  'news-feedback.read': 'Nieuwsfeedback bekeken',
  'nieuws.artikel.verwijderen': 'Nieuwsartikel verwijderd',
  'nieuws.duiding.terugtrekken': 'Duiding teruggetrokken',
  'nieuws.duiding.opnieuw': 'Duiding opnieuw aangevraagd',
  'nieuws.duiding.steekproef': 'Steekproef duiding vastgelegd',
  // Historische acties van vóór ADR 0146 (supportview en admin-export bestaan
  // niet meer); de labels blijven zodat oude auditregels leesbaar blijven.
  'support.view': 'Gegevens ingezien',
  'data.export': 'Gegevens geëxporteerd',
}

export function adminActieLabel(actie: string): string {
  return ADMIN_ACTIE_LABELS[actie] ?? actie
}

/**
 * Acties die alleen iets LEZEN. Ze horen in het auditlog (inzage is ook een
 * handeling), maar zijn geen ingreep: er verandert niets aan het platform, dus
 * ze horen niet op een tijdlijn van wijzigingen.
 */
export const INZAGE_ACTIES: readonly string[] = [
  'user.activity',
  'group.leden.inzage',
  'news-feedback.read',
  'support.view',
  'data.export',
]

const INZAGE_SET: ReadonlySet<string> = new Set(INZAGE_ACTIES)

export function isInzageActie(actie: string): boolean {
  return INZAGE_SET.has(actie)
}

/**
 * Acties waarvan het doel een INSTELLING is en geen persoon. Alleen hiervan
 * toont het dashboard het doel; bij de overige kan `target_label` een naam of
 * e-mailadres zijn, en dat hoort op de auditpagina zelf.
 */
const ACTIES_MET_INSTELLING_ALS_DOEL: ReadonlySet<string> = new Set(['config.update'])

export function doelIsInstelling(actie: string): boolean {
  return ACTIES_MET_INSTELLING_ALS_DOEL.has(actie)
}
