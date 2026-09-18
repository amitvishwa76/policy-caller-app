import { NextRequest, NextResponse } from "next/server";
import getSupabaseAdmin from "@/lib/supabase";
import { checkAndAutoSync } from "@/lib/autoSync";

export const dynamic = "force-dynamic";

/**
 * Periodic safety-net sweep for auto-send. Vercel Cron hits this on the
 * schedule in vercel.json. Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests when the
 * CRON_SECRET env var is set, so we verify that here to reject other callers.
 *
 * Most auto-sends actually happen immediately after a policy is added or
 * edited (see app/api/policies routes) — this sweep only matters for
 * policies that drift into the due-soon window purely because time passed,
 * with no edit to trigger an immediate check.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    const outcome = await checkAndAutoSync(supabase);
    return NextResponse.json(outcome);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
