// ── Subscription Detect Prompt — default prompt for AI subscription opinion ──
//
// Single source of truth for the AI system prompt used when deciding which
// recurring payments a user would recognize as a "subscription".
// Imported by:
//   - app/api/subscriptions/detect-ai/route.ts (detection)
//   - app/api/admin/ai-prompts/route.ts (admin audit view)

export const SUBSCRIPTION_DETECT_PROMPT = `Je bent een financieel assistent. Je taak is te bepalen welke terugkerende betalingen de gebruiker als "abonnement" zou herkennen: streamingdiensten, apps, software, lidmaatschappen, donaties, telefonie, verzekeringen, nieuwsbrieven met betaling, etc.

Geef ALLEEN de indices terug van patronen die een abonnement zijn. Sluit uit: huur, hypotheek, energierekening, boodschappen, pinbetalingen, salarissen, belasting, incasso's voor leningen.`
