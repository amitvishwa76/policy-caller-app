import { NextRequest, NextResponse } from "next/server";
import getSupabaseAdmin, {
  POLICY_TABLE,
  PAYMENT_LINKS_TABLE,
  GENESYS_SYNC_STATE_TABLE,
  SYNC_LOG_TABLE,
} from "@/lib/supabase";
import { updateGenesysContactFields } from "@/lib/genesys";

export const dynamic = "force-dynamic";

async function resolveToken(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) {
  const { data: link } = await supabase
    .from(PAYMENT_LINKS_TABLE)
    .select("policy_id")
    .eq("token", token)
    .maybeSingle();
  return link?.policy_id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const supabase = getSupabaseAdmin();
    const policyId = await resolveToken(supabase, token);

    if (!policyId) {
      return NextResponse.json({ error: "This payment link is invalid." }, { status: 404 });
    }

    const { data: policy, error } = await supabase
      .from(POLICY_TABLE)
      .select("policy_no, policy_holder, plan, amount, due_date, payment_status")
      .eq("id", policyId)
      .single();

    if (error || !policy) {
      return NextResponse.json({ error: "This payment link is invalid." }, { status: 404 });
    }

    return NextResponse.json({ policy });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const supabase = getSupabaseAdmin();
    const policyId = await resolveToken(supabase, token);

    if (!policyId) {
      return NextResponse.json({ error: "This payment link is invalid." }, { status: 404 });
    }

    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const paidAt = new Date().toISOString();

    const { data: policy, error } = await supabase
      .from(POLICY_TABLE)
      .update({ payment_status: "PAID", paid_at: paidAt, transaction_id: transactionId })
      .eq("id", policyId)
      .select("*")
      .single();

    if (error || !policy) {
      return NextResponse.json({ error: error?.message || "Payment update failed." }, { status: 500 });
    }

    // Best-effort: also flip the Genesys contact's Prem_Paid_Status, if we
    // know which contact this policy maps to. A failure here never blocks
    // the payment itself — it's already recorded in Supabase, which is the
    // source of truth. The failure is logged for follow-up.
    let genesysUpdate: { ok: boolean; error?: string } = { ok: false };
    const { data: syncState } = await supabase
      .from(GENESYS_SYNC_STATE_TABLE)
      .select("genesys_contact_id")
      .eq("policy_id", policyId)
      .maybeSingle();

    if (syncState?.genesys_contact_id) {
      try {
        await updateGenesysContactFields(syncState.genesys_contact_id, {
          prem_paid_status: "PAID",
        });
        genesysUpdate = { ok: true };
      } catch (err: unknown) {
        genesysUpdate = { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    } else {
      genesysUpdate = { ok: false, error: "No Genesys contact recorded for this policy yet." };
    }

    await supabase.from(SYNC_LOG_TABLE).insert({
      trigger: "payment",
      days: null,
      matched: 1,
      inserted: genesysUpdate.ok ? 1 : 0,
      status: genesysUpdate.ok ? "success" : "partial_error",
      detail: genesysUpdate.ok ? "Payment recorded; Genesys contact updated." : genesysUpdate.error,
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json({ policy, genesysUpdated: genesysUpdate.ok });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
