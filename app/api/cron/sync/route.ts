import { NextRequest, NextResponse } from "next/server";
import getSupabaseAdmin, { POLICY_TABLE, SETTINGS_TABLE, SYNC_LOG_TABLE, PolicyRow } from "@/lib/supabase";
import { parseDueDate, isWithinDaysAhead } from "@/lib/date";
import { insertPoliciesToCallingList } from "@/lib/genesys";

export const dynamic = "force-dynamic";

const SETTINGS_ROW_ID = 1;
const FREQUENCY_INTERVALS_MS: Record<string, number> = {
  daily: 23 * 60 * 60 * 1000, // slight buffer under 24h so it doesn't drift late
  twice_daily: 11 * 60 * 60 * 1000,
};

/**
 * This route is invoked on a fixed schedule by Vercel Cron (see vercel.json,
 * e.g. every 6 hours). Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests when the
 * CRON_SECRET env var is set, so we verify that here to reject other callers.
 *
 * It only performs a real sync if enough time has passed since the last run
 * per the user's chosen frequency (off / daily / twice_daily), which is
 * stored in Supabase and editable from the web app's settings panel.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  let settings: {
    frequency: "off" | "daily" | "twice_daily";
    days_ahead: number;
    only_pending: boolean;
    last_run_at: string | null;
  } | null;

  try {
    supabase = getSupabaseAdmin();

    const { data, error: settingsError } = await supabase
      .from(SETTINGS_TABLE)
      .select("*")
      .eq("id", SETTINGS_ROW_ID)
      .maybeSingle();

    if (settingsError) {
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }
    settings = data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!settings || settings.frequency === "off") {
    return NextResponse.json({ skipped: true, reason: "Automatic sync is off." });
  }

  const interval = FREQUENCY_INTERVALS_MS[settings.frequency];
  const lastRunAt = settings.last_run_at ? new Date(settings.last_run_at).getTime() : 0;
  const dueNow = !lastRunAt || Date.now() - lastRunAt >= interval;

  if (!dueNow) {
    return NextResponse.json({ skipped: true, reason: "Not due yet per configured frequency." });
  }

  try {
    const { data, error } = await supabase.from(POLICY_TABLE).select("*");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let rows = (data || []) as PolicyRow[];
    if (settings.only_pending) {
      rows = rows.filter((r) => (r.payment_status || "").toUpperCase() === "PENDING");
    }
    rows = rows.filter((r) => {
      const parsed = parseDueDate(r.due_date);
      return parsed ? isWithinDaysAhead(parsed, settings.days_ahead) : false;
    });

    let result = null;
    if (rows.length > 0) {
      result = await insertPoliciesToCallingList(rows);
    }

    await supabase
      .from(SETTINGS_TABLE)
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", SETTINGS_ROW_ID);

    await supabase.from(SYNC_LOG_TABLE).insert({
      trigger: "cron",
      days: settings.days_ahead,
      matched: rows.length,
      inserted: rows.length,
      status: result && result.errors.length > 0 ? "partial_error" : "success",
      detail: result ? JSON.stringify(result) : "No matching policies.",
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json({ ranSync: true, matched: rows.length, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase.from(SYNC_LOG_TABLE).insert({
      trigger: "cron",
      days: settings.days_ahead,
      matched: null,
      inserted: null,
      status: "error",
      detail: message,
      ran_at: new Date().toISOString(),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
