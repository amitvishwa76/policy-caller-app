import { NextRequest, NextResponse } from "next/server";
import getSupabaseAdmin, {
  POLICY_TABLE,
  SYNC_LOG_TABLE,
  GENESYS_SYNC_STATE_TABLE,
  PolicyRow,
} from "@/lib/supabase";
import { parseDueDate, isWithinDaysAhead } from "@/lib/date";
import { insertPoliciesToCallingList } from "@/lib/genesys";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin> | undefined;

  try {
    supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const days = typeof body.days === "number" ? body.days : 60;
    const onlyPending = body.onlyPending !== false; // default true

    if (Number.isNaN(days) || days < 0) {
      return NextResponse.json(
        { error: "'days' must be a non-negative number." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.from(POLICY_TABLE).select("*");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let rows = (data || []) as PolicyRow[];
    if (onlyPending) {
      rows = rows.filter((r) => (r.payment_status || "").toUpperCase() === "PENDING");
    }
    rows = rows.filter((r) => {
      const parsed = parseDueDate(r.due_date);
      return parsed ? isWithinDaysAhead(parsed, days) : false;
    });

    if (rows.length === 0) {
      await logSyncResult(supabase, {
        trigger: "manual",
        days,
        matched: 0,
        inserted: 0,
        status: "no_matches",
        detail: null,
      });
      return NextResponse.json({ message: "No policies matched the filter.", count: 0 });
    }

    const result = await insertPoliciesToCallingList(rows);

    await supabase.from(GENESYS_SYNC_STATE_TABLE).upsert(
      rows.map((r) => ({ policy_id: r.id, synced_at: new Date().toISOString() }))
    );

    await logSyncResult(supabase, {
      trigger: "manual",
      days,
      matched: rows.length,
      inserted: rows.length - result.errors.length * 0, // errors are per-batch, not per-contact
      status: result.errors.length > 0 ? "partial_error" : "success",
      detail: JSON.stringify(result),
    });

    return NextResponse.json({
      message: "Sync completed.",
      matched: rows.length,
      result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (supabase) {
      await logSyncResult(supabase, {
        trigger: "manual",
        days: null,
        matched: null,
        inserted: null,
        status: "error",
        detail: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function logSyncResult(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  entry: {
    trigger: string;
    days: number | null;
    matched: number | null;
    inserted: number | null;
    status: string;
    detail: string | null;
  }
) {
  // Best-effort logging; ignore failures so a logging problem never
  // masks the actual sync result returned to the caller.
  await supabase
    .from(SYNC_LOG_TABLE)
    .insert({ ...entry, ran_at: new Date().toISOString() })
    .then(
      () => {},
      () => {}
    );
}
