import getSupabaseAdmin, {
  POLICY_TABLE,
  SETTINGS_TABLE,
  SYNC_LOG_TABLE,
  GENESYS_SYNC_STATE_TABLE,
  PolicyRow,
} from "./supabase";
import { parseDueDate, isWithinDaysAhead } from "./date";
import { buildGenesysContactData, insertContactsToCallingList } from "./genesys";
import { getOrCreatePaymentLink } from "./paymentLink";

const SETTINGS_ROW_ID = 1;

export type AutoSyncOutcome =
  | { ranSync: false; reason: string }
  | { ranSync: true; matched: number; sent: number; errors: { policyId: number; message: string }[] };

/**
 * Checks whether auto-send is enabled, finds policies that now match the
 * due-soon filter AND haven't already been sent to Genesys, sends only
 * those (so nothing gets duplicated), and records them in
 * genesys_sync_state (including the Genesys contact ID, so a later payment
 * can update that exact contact). Safe to call often — a cheap no-op when
 * auto-send is off or nothing new qualifies.
 *
 * Called from two places:
 *  - the Vercel Cron endpoint (periodic sweep — catches policies that enter
 *    the due-soon window purely because time has passed, with no edit)
 *  - immediately after a policy is created/edited (catches the common case
 *    of a new/corrected policy that already qualifies right now)
 */
export async function checkAndAutoSync(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<AutoSyncOutcome> {
  const { data: settings, error: settingsError } = await supabase
    .from(SETTINGS_TABLE)
    .select("*")
    .eq("id", SETTINGS_ROW_ID)
    .maybeSingle();

  if (settingsError) {
    return { ranSync: false, reason: `Could not read settings: ${settingsError.message}` };
  }
  if (!settings || !settings.auto_send) {
    return { ranSync: false, reason: "Auto-send is off." };
  }

  const { data, error } = await supabase.from(POLICY_TABLE).select("*");
  if (error) {
    return { ranSync: false, reason: error.message };
  }

  let rows = (data || []) as PolicyRow[];
  if (settings.only_pending) {
    rows = rows.filter((r) => (r.payment_status || "").toUpperCase() === "PENDING");
  }
  rows = rows.filter((r) => {
    const parsed = parseDueDate(r.due_date);
    return parsed ? isWithinDaysAhead(parsed, settings.days_ahead) : false;
  });

  if (rows.length === 0) {
    await touchLastCheck(supabase);
    return { ranSync: false, reason: "No policies currently match the filter." };
  }

  const { data: alreadySynced, error: syncStateError } = await supabase
    .from(GENESYS_SYNC_STATE_TABLE)
    .select("policy_id")
    .in("policy_id", rows.map((r) => r.id));

  if (syncStateError) {
    return { ranSync: false, reason: syncStateError.message };
  }

  const syncedIds = new Set((alreadySynced || []).map((r) => r.policy_id as number));
  const newMatches = rows.filter((r) => !syncedIds.has(r.id));

  await touchLastCheck(supabase);

  if (newMatches.length === 0) {
    return { ranSync: false, reason: "All currently-matching policies were already sent." };
  }

  const contactItems = await Promise.all(
    newMatches.map(async (policy) => {
      const { url } = await getOrCreatePaymentLink(supabase, policy.id);
      return { policyId: policy.id, data: buildGenesysContactData(policy, url) };
    })
  );

  const results = await insertContactsToCallingList(contactItems);

  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  if (succeeded.length > 0) {
    await supabase.from(GENESYS_SYNC_STATE_TABLE).upsert(
      succeeded.map((r) => ({
        policy_id: r.policyId,
        synced_at: new Date().toISOString(),
        genesys_contact_id: r.contactId,
      }))
    );
  }

  await supabase.from(SYNC_LOG_TABLE).insert({
    trigger: "auto",
    days: settings.days_ahead,
    matched: newMatches.length,
    inserted: succeeded.length,
    status: failed.length > 0 ? "partial_error" : "success",
    detail: JSON.stringify(results),
    ran_at: new Date().toISOString(),
  });

  return {
    ranSync: true,
    matched: newMatches.length,
    sent: succeeded.length,
    errors: failed.map((f) => ({ policyId: f.policyId, message: f.error! })),
  };
}

async function touchLastCheck(supabase: ReturnType<typeof getSupabaseAdmin>) {
  await supabase
    .from(SETTINGS_TABLE)
    .update({ last_auto_check_at: new Date().toISOString() })
    .eq("id", SETTINGS_ROW_ID);
}
