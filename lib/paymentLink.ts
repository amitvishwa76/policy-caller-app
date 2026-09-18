import crypto from "crypto";
import getSupabaseAdmin, { PAYMENT_LINKS_TABLE } from "./supabase";

function getBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Returns the existing payment link for a policy if one was already
 * generated, or creates a new one. The same token is reused across every
 * future sync for that policy, so the link a customer received doesn't
 * change even if the policy is re-synced.
 */
export async function getOrCreatePaymentLink(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  policyId: number
): Promise<{ token: string; url: string }> {
  const { data: existing } = await supabase
    .from(PAYMENT_LINKS_TABLE)
    .select("token")
    .eq("policy_id", policyId)
    .maybeSingle();

  const token = existing?.token || crypto.randomBytes(16).toString("hex");

  if (!existing) {
    // Race-safe: if another request created it first (unique constraint on
    // policy_id), just re-read whatever token won.
    const { error } = await supabase
      .from(PAYMENT_LINKS_TABLE)
      .insert({ token, policy_id: policyId });

    if (error && error.code === "23505") {
      const { data: winner } = await supabase
        .from(PAYMENT_LINKS_TABLE)
        .select("token")
        .eq("policy_id", policyId)
        .single();
      return { token: winner!.token, url: `${getBaseUrl()}/pay/${winner!.token}` };
    }
  }

  return { token, url: `${getBaseUrl()}/pay/${token}` };
}
