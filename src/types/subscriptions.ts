export type SubscriptionCategory =
  | 'ai-tools'
  | 'infrastructure'
  | 'hosting'
  | 'domains'
  | 'developer-tools'
  | 'media'
  | 'other'

export type BillingType = 'fixed' | 'usage-based' | 'metered'

export interface Subscription {
  id: string
  name: string
  provider: string
  costPerMonth: number
  billingCycleDay: number
  startDate: string
  endDate: string | null
  category: SubscriptionCategory
  billingType: BillingType
  color?: string
  /** For usage-based: estimated range or note */
  costNote?: string
  /** Projects this subscription supports */
  projects?: string[]
  /** Monthly cost history for usage-based services */
  monthlyHistory?: { month: string; cost: number }[]
  /** URL for the service dashboard */
  url?: string
  /** Whether this is a free tier (still worth tracking) */
  freeTier?: boolean
}

export interface OneTimeCost {
  id: string
  name: string
  provider: string
  amount: number
  date: string
  category: SubscriptionCategory
  projects?: string[]
}

export interface SpendData {
  subscriptions: Subscription[]
  oneTimeCosts: OneTimeCost[]
}
