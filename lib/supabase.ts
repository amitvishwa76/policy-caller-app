import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using the service role key.
// This must NEVER be imported into a client component — only used
// inside API routes / server actions (files under app/api/**).
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export type PolicyRow = {
  id: number;
  policy_no: string;
  payment_status: string;
  amount: number;
  policy_holder: string;
  plan: string;
  due_date: string; // stored as text, e.g. "18 Jun 2026"
  phone_num: string;
};

export const POLICY_TABLE = "policy_list";
export const SETTINGS_TABLE = "sync_settings";
export const SYNC_LOG_TABLE = "sync_log";

export default getSupabaseAdmin;
