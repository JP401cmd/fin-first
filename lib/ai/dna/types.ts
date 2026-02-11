export type AIDomain = 'kern' | 'wil' | 'horizon'

export type DomainPersonality = {
  domain: AIDomain
  avatarName: string
  role: string
  style: string
  expertise: string[]
  examplePhrases: string[]
}
