import { NextRequest, NextResponse } from "next/server";
import getSupabaseAdmin, { SETTINGS_TABLE } from "@/lib/supabase";
import { checkAndAutoSync } from "@/lib/autoSync";

export const dynamic = "force-dynamic";

const SETTINGS_ROW_ID = 1;

type Settings = {
  id: number;
  days_ahead: number;
  only_pending: boolean;
  auto_send: boolean;
  last_auto_check_at: string | null;
};

const DEFAULT_SETTINGS: Omit<Settings, "id"> = {
  days_ahead: 60,
  only_pending: true,
  auto_send: false,
  last_auto_check_at: null,
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
    const { auto_send, days_ahead, only_pending } = body;

    if (auto_send !== undefined && typeof auto_send !== "boolean") {
      return NextResponse.json({ error: "auto_send must be a boolean." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const update: Record<string, unknown> = {};
    if (auto_send !== undefined) update.auto_send = auto_send;
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

    let autoSyncOutcome = null;
    if (auto_send === true) {
      try {
        autoSyncOutcome = await checkAndAutoSync(supabase);
      } catch {
        // Don't fail the settings save just because the immediate check hit
        // an issue — the next scheduled sweep or edit-triggered check will
        // retry it.
      }
    }

    return NextResponse.json({ settings: data, autoSyncOutcome });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
