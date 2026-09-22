// Provider contracts only. No billing or background execution is enabled yet.
export interface BillingProvider {
  createCheckout(input: {
    dealershipId: string;
    plan: "START" | "PRO" | "PERFORMANCE";
    cycle: "MONTHLY" | "ANNUAL";
  }): Promise<{ url: string; externalId: string }>;
  verifyWebhook(
    payload: Uint8Array,
    signature: string,
  ): Promise<{
    eventId: string;
    dealershipId: string;
    status: "ACTIVE" | "PAST_DUE" | "CANCELLED";
  }>;
}
export interface JobQueue {
  enqueue(input: {
    dealershipId: string;
    kind: "content.generate" | "post.publish";
    entityId: string;
    runAt: Date;
    idempotencyKey: string;
  }): Promise<{ jobId: string }>;
}
