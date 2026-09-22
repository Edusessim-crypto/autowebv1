export const plans = {
  START: {
    name: "Start",
    monthly: 12790,
    annual: 107436,
    vehicles: 15,
    users: 2,
  },
  PRO: { name: "Pro", monthly: 21990, annual: 184716, vehicles: 40, users: 5 },
  PERFORMANCE: {
    name: "Performance",
    monthly: 34990,
    annual: 293916,
    vehicles: 100,
    users: 10,
  },
} as const;
export type Plan = keyof typeof plans;
export type Subscription = {
  plan: Plan;
  billingCycle: string;
  subscriptionStatus: string;
  trialEndsAt: Date;
};
export function getLimit(s: Subscription, resource: "vehicles" | "users") {
  return s.subscriptionStatus === "TRIAL"
    ? resource === "vehicles"
      ? 5
      : 2
    : plans[s.plan][resource];
}
export function canWrite(s: Subscription, now = new Date()) {
  return (
    s.subscriptionStatus === "ACTIVE" ||
    (s.subscriptionStatus === "TRIAL" && s.trialEndsAt > now)
  );
}
export function hasFeature(
  s: Subscription,
  feature:
    | "site"
    | "customDomain"
    | "customBranding"
    | "multiUnit"
    | "advancedPermissions",
) {
  if (!canWrite(s)) return false;
  if (feature === "site")
    return s.plan === "PERFORMANCE" || s.billingCycle === "ANNUAL";
  if (feature === "customDomain" || feature === "multiUnit")
    return s.plan === "PERFORMANCE";
  return s.plan !== "START";
}
export function usagePeriod(s: Subscription, now = new Date()) {
  return s.subscriptionStatus === "TRIAL"
    ? "trial"
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
      }).format(now);
}
