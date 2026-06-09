export type PlanKey = "free" | "starter" | "creator" | "business";

export type PlanDetail = {
  bestFor: string;
  canUse: string[];
  cannotUse: string[];
};

export const PLAN_DETAILS: Record<PlanKey, PlanDetail> = {
  free: {
    bestFor: "First account test and dashboard preview.",
    canUse: [
      "100 one-time trial tokens",
      "Dashboard speech and standard clone tests",
      "Download generated MP3 audio",
      "View history and billing pages",
    ],
    cannotUse: [
      "No API keys or public API calls",
      "No batch API or webhook callbacks",
      "No Business clone rate",
      "Not for production/customer traffic",
    ],
  },
  starter: {
    bestFor: "Small API tests, bots, and first integration checks.",
    canUse: [
      "1,000 tokens per pack",
      "Create paid API keys",
      "Speech and clone API calls",
      "Small batch jobs at standard limits",
    ],
    cannotUse: [
      "No Business clone rate",
      "No custom concurrency or queue limits",
      "Not for high-volume dubbing systems",
      "Standard clone rate is 2 tokens/sec",
    ],
  },
  creator: {
    bestFor: "Regular creators, automations, and larger test batches.",
    canUse: [
      "10,000 tokens per pack",
      "Create paid API keys",
      "Speech, clone, and batch API",
      "More regular dashboard/API usage",
    ],
    cannotUse: [
      "No Business clone rate",
      "No custom high-volume queue limits",
      "No approved business launch review",
      "Standard clone rate is 2 tokens/sec",
    ],
  },
  business: {
    bestFor: "Dubbing apps, teams, and customer systems with many clone jobs.",
    canUse: [
      "Business clone rate starts at 1.5 tokens/sec",
      "High-volume prepaid can request 1 token/sec",
      "Custom daily/monthly token limits",
      "Higher concurrency, queue, and webhooks",
    ],
    cannotUse: [
      "Requires admin approval before launch",
      "Requires paid balance and API key",
      "Reference audio is required for consistent voice",
      "Usage is limited by approved business caps",
    ],
  },
};

export const PLAN_COMPARISON_ROWS: Array<{
  feature: string;
  free: string;
  starter: string;
  creator: string;
  business: string;
}> = [
  {
    feature: "Tokens",
    free: "100 one-time trial",
    starter: "1,000 per pack",
    creator: "10,000 per pack",
    business: "Custom prepaid volume",
  },
  {
    feature: "Dashboard generation",
    free: "Yes",
    starter: "Yes",
    creator: "Yes",
    business: "Yes",
  },
  {
    feature: "API keys",
    free: "No",
    starter: "Yes",
    creator: "Yes",
    business: "Yes, approved",
  },
  {
    feature: "Speech API",
    free: "No",
    starter: "Yes",
    creator: "Yes",
    business: "Yes",
  },
  {
    feature: "Clone API",
    free: "No",
    starter: "Standard",
    creator: "Standard",
    business: "Discounted",
  },
  {
    feature: "Batch jobs",
    free: "No",
    starter: "Small tests",
    creator: "Regular workloads",
    business: "High-volume",
  },
  {
    feature: "Webhook callbacks",
    free: "No",
    starter: "Testing",
    creator: "Testing",
    business: "Production use",
  },
  {
    feature: "Speech token rate",
    free: "Standard speech: 1.5 tokens/sec",
    starter: "Standard speech: 1.5 tokens/sec",
    creator: "Standard speech: 1.5 tokens/sec",
    business: "Standard speech: 1.5 tokens/sec",
  },
  {
    feature: "Clone token rate",
    free: "Dashboard trial only, no API",
    starter: "Standard clone: 2 tokens/sec",
    creator: "Standard clone: 2 tokens/sec",
    business: "Business clone only: 1.5 tokens/sec, or 1 with high-volume prepaid",
  },
  {
    feature: "Concurrency and queue",
    free: "Trial only",
    starter: "Standard limits",
    creator: "Standard limits",
    business: "Admin-approved limits",
  },
  {
    feature: "Best for",
    free: PLAN_DETAILS.free.bestFor,
    starter: PLAN_DETAILS.starter.bestFor,
    creator: PLAN_DETAILS.creator.bestFor,
    business: PLAN_DETAILS.business.bestFor,
  },
];
