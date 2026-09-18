import { NextRequest, NextResponse } from "next/server";
import getSupabaseAdmin, { POLICY_TABLE, GENESYS_SYNC_STATE_TABLE, PolicyRow } from "@/lib/supabase";
import { parseDueDate, isWithinDaysAhead } from "@/lib/date";
import { validateFullPolicyInput } from "@/lib/validation";
import { checkAndAutoSync } from "@/lib/autoSync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationError = validateFullPolicyInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(POLICY_TABLE)
      .insert({
        policy_no: body.policy_no,
        payment_status: body.payment_status,
        amount: body.amount,
        policy_holder: body.policy_holder,
        plan: body.plan,
        due_date: body.due_date,
        phone_num: body.phone_num,
        email_id: body.email_id || null,
        whatsapp_num: body.whatsapp_num || null,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Policy number "${body.policy_no}" already exists.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // A newly-added policy might already qualify for auto-send (e.g. its due
    // date is already within the configured window) — check right away
    // rather than waiting for the next scheduled sweep.
    try {
      await checkAndAutoSync(supabase);
    } catch {
      // Never fail the create just because the auto-check hit an issue.
    }

    return NextResponse.json({ policy: data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const daysParam = searchParams.get("days");
    const onlyPending = searchParams.get("onlyPending") === "true";

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(POLICY_TABLE)
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let rows = (data || []) as PolicyRow[];

    // Attach sync status so the UI can show which policies have already
    // been sent to Genesys.
    const { data: syncState } = await supabase
      .from(GENESYS_SYNC_STATE_TABLE)
      .select("policy_id, synced_at");
    const syncedMap = new Map((syncState || []).map((s) => [s.policy_id, s.synced_at]));
    const rowsWithSync = rows.map((r) => ({ ...r, synced_at: syncedMap.get(r.id) ?? null }));
    rows = rowsWithSync as PolicyRow[];

    if (onlyPending) {
      rows = rows.filter((r) => (r.payment_status || "").toUpperCase() === "PENDING");
    }

    if (daysParam !== null) {
      const days = parseInt(daysParam, 10);
      if (Number.isNaN(days) || days < 0) {
        return NextResponse.json(
          { error: "Query param 'days' must be a non-negative integer." },
          { status: 400 }
        );
      }

      rows = rows.filter((r) => {
        const parsed = parseDueDate(r.due_date);
        return parsed ? isWithinDaysAhead(parsed, days) : false;
      });
    }

    return NextResponse.json({ policies: rows, count: rows.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
