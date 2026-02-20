export type CancellationMetadata = {
  type: 'subscription_cancellation'
  subscription_name: string
  monthly_amount: number
  frequency?: string
  user_name: string
  user_address: string
  user_postcode: string
  user_city: string
}
