import type { PolicyRow } from "./supabase";
import { parseDueDate } from "./date";

/**
 * Genesys Cloud integration.
 *
 * Region: this app is configured for the Mumbai (India) region:
 *   - Login domain:  login.aps1.pure.cloud
 *   - API domain:    api.aps1.pure.cloud
 *
 * Auth: OAuth 2.0 Client Credentials grant (server-to-server, no user login).
 * Docs: https://developer.genesys.cloud/authorization/platform-auth/use-client-credentials
 *
 * Contact insert: POST /api/v2/outbound/contactlists/{contactListId}/contacts
 * Docs: https://developer.genesys.cloud/routing/outbound/contactmanagement
 */

const REGION_DOMAIN = process.env.GENESYS_REGION_DOMAIN || "aps1.pure.cloud";
const LOGIN_BASE = `https://login.${REGION_DOMAIN}`;
const API_BASE = `https://api.${REGION_DOMAIN}`;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GENESYS_CLIENT_ID;
  const clientSecret = process.env.GENESYS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GENESYS_CLIENT_ID or GENESYS_CLIENT_SECRET environment variables."
    );
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${LOGIN_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Genesys OAuth token request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.token;
}

function getContactListId(): string {
  const id = process.env.GENESYS_CALLING_LIST_ID;
  if (!id) throw new Error("Missing GENESYS_CALLING_LIST_ID environment variable.");
  return id;
}

/**
 * The text that actually lands in the payment_link contact field. Edit this
 * to change how the link appears wherever Genesys inserts it (WhatsApp,
 * SMS, etc.) — the underlying URL/token itself is unaffected.
 */
function formatPaymentLinkMessage(url: string): string {
  return `Pay securely here: \u{1F449} ${url}`;
}

type GenesysContactData = Record<string, string>;

/**
 * Maps a Supabase policy_list row (+ that policy's dummy payment link) into
 * the `data` payload Genesys expects for a contact list contact. Keys must
 * match the contact list's configured columns exactly (case-sensitive).
 *
 * Genesys validates that a contact's `data` object contains EXACTLY the
 * column set defined on the list — sending only a subset is rejected with
 * "The contact columns do not match what is required in the list". So every
 * column below is required, even ones policy_list has no data for (blank
 * strings, except the flag columns which default to "0").
 *
 * Confirmed contact list columns (2026-09-18, updated schema): phon_num,
 * policy_num, cust_name, policy_name, premium_amt, policy_due,
 * prem_paid_status, email_id, whatsapp_num, voice_flag, whatsapp_flag,
 * email_flag, dial_count, due_days, wa_temp, payment_link,
 * payment_transcid, temp3-6.
 */
export function buildGenesysContactData(
  policy: PolicyRow,
  paymentLinkUrl: string
): GenesysContactData {
  const s = (v: string | number | null) => (v === null || v === undefined ? "" : String(v));
  return {
    phon_num: s(policy.phone_num),
    policy_num: s(policy.policy_no),
    cust_name: s(policy.policy_holder),
    policy_name: s(policy.plan),
    premium_amt: s(policy.amount),
    policy_due: s(policy.due_date),
    prem_paid_status: s(policy.payment_status),
    email_id: s(policy.email_id),
    whatsapp_num: s(policy.whatsapp_num),
    due_days: policy.due_date ? daysUntil(policy.due_date) : "",
    voice_flag: "0",
    whatsapp_flag: "0",
    email_flag: "0",
    dial_count: "0",
    wa_temp: "",
    payment_link: formatPaymentLinkMessage(paymentLinkUrl),
    payment_transcid: "",
    temp3: "",
    temp4: "",
    temp5: "",
    temp6: "",
  };
}

/** Days from today until the given "18 Jun 2026"-style due date; empty string if unparseable. */
function daysUntil(dueDateText: string): string {
  const due = parseDueDate(dueDateText);
  if (!due) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return String(diff);
}

export type ContactInsertOutcome = {
  policyId: number;
  contactId: string | null;
  error: string | null;
};

/**
 * Inserts contacts into the configured Genesys calling list — one API call
 * per contact, rather than batching. This is slightly less efficient than
 * Genesys's up-to-1000-per-call bulk endpoint, but it makes it unambiguous
 * which returned contact ID belongs to which policy (needed so a later
 * payment can update that exact contact's Prem_Paid_Status). Fine at the
 * volumes a "due in N days" filter produces; revisit if you're regularly
 * syncing thousands of policies in one go.
 */
export async function insertContactsToCallingList(
  items: { policyId: number; data: GenesysContactData }[]
): Promise<ContactInsertOutcome[]> {
  const contactListId = getContactListId();
  const token = await getAccessToken();

  const results: ContactInsertOutcome[] = [];

  for (const item of items) {
    try {
      const res = await fetch(
        `${API_BASE}/api/v2/outbound/contactlists/${contactListId}/contacts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{ data: item.data, callable: true }]),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        results.push({ policyId: item.policyId, contactId: null, error: `HTTP ${res.status}: ${text}` });
        continue;
      }

      const json = await res.json();
      const created = Array.isArray(json) ? json[0] : json;
      results.push({ policyId: item.policyId, contactId: created?.id ?? null, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ policyId: item.policyId, contactId: null, error: message });
    }
  }

  return results;
}

/**
 * Updates a single existing contact's data fields (e.g. Prem_Paid_Status
 * after a payment). Genesys's update endpoint replaces the contact's data
 * object, so we fetch the current contact first and merge in just the
 * changed fields rather than risking clobbering the rest.
 */
export async function updateGenesysContactFields(
  contactId: string,
  changes: Partial<GenesysContactData>
): Promise<void> {
  const contactListId = getContactListId();
  const token = await getAccessToken();

  const getRes = await fetch(
    `${API_BASE}/api/v2/outbound/contactlists/${contactListId}/contacts/${contactId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!getRes.ok) {
    const text = await getRes.text();
    throw new Error(`Failed to fetch Genesys contact ${contactId}: HTTP ${getRes.status}: ${text}`);
  }
  const current = await getRes.json();

  const putRes = await fetch(
    `${API_BASE}/api/v2/outbound/contactlists/${contactListId}/contacts/${contactId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: contactId,
        contactListId,
        data: { ...current.data, ...changes },
        callable: current.callable,
      }),
    }
  );

  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`Failed to update Genesys contact ${contactId}: HTTP ${putRes.status}: ${text}`);
  }
}
