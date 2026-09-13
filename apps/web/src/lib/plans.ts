// Plan limits and prices. Safe to import from client code.
export const PLANS = {
  free: { name: "Free", workspaces: 2, monthly: 0, yearly: 0 },
  pro: { name: "Pro", workspaces: 5, monthly: 19, yearly: 149 },
} as const;

export type PlanKey = keyof typeof PLANS;
