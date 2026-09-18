import { NextRequest, NextResponse } from "next/server";
import getSupabaseAdmin, { SETTINGS_TABLE } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SETTINGS_ROW_ID = 1;

type Settings = {
  id: number;
  frequency: "off" | "daily" | "twice_daily";
  days_ahead: number;
  only_pending: boolean;
  last_run_at: string | null;
};

const DEFAULT_SETTINGS: Omit<Settings, "id"> = {
  frequency: "off",
  days_ahead: 60,
  only_pending: true,
  last_run_at: null,
};

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select("*")
      .eq("id", SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      // Seed the row on first use.
      const { data: inserted, error: insertError } = await supabase
        .from(SETTINGS_TABLE)
        .insert({ id: SETTINGS_ROW_ID, ...DEFAULT_SETTINGS })
        .select("*")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      return NextResponse.json({ settings: inserted });
    }

    return NextResponse.json({ settings: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { frequency, days_ahead, only_pending } = body;

    if (frequency && !["off", "daily", "twice_daily"].includes(frequency)) {
      return NextResponse.json(
        { error: "frequency must be one of: off, daily, twice_daily" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const update: Record<string, unknown> = {};
    if (frequency !== undefined) update.frequency = frequency;
    if (days_ahead !== undefined) update.days_ahead = days_ahead;
    if (only_pending !== undefined) update.only_pending = only_pending;

    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .upsert({ id: SETTINGS_ROW_ID, ...update })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
