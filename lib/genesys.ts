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
 * Accepts an array of up to 1000 contacts per call; each contact has a
 * `data` object whose keys must match the contact list's configured columns.
 */

const REGION_DOMAIN = process.env.GENESYS_REGION_DOMAIN || "aps1.pure.cloud";
const LOGIN_BASE = `https://login.${REGION_DOMAIN}`;
const API_BASE = `https://api.${REGION_DOMAIN}`;
const MAX_CONTACTS_PER_REQUEST = 1000;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GENESYS_CLIENT_ID;
  const clientSecret = process.env.GENESYS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GENESYS_CLIENT_ID or GENESYS_CLIENT_SECRET environment variables."
    );
  }

  // Reuse the token until shortly before it expires.
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

/**
 * Maps a Supabase policy_list row into the `data` payload Genesys expects
 * for a contact list contact. Keys on the right must match the columns
 * configured on the actual Genesys contact list exactly (case-sensitive).
 *
 * Confirmed contact list columns (2026-09-18): Phone_Num, Policy_Num,
 * Customer_Name, Plan, Premium, Prem_due, Prem_Paid_Status, email_id,
 * whatsapp_num, Voice_flag, WhatsApp_flag, Email_Flag, Dial_Count, Due_days,
 * WA_Temp, Temp1-6.
 *
 * policy_list now also has email_id and whatsapp_num, so those are populated
 * too. The remaining columns (the channel flags, Dial_Count, WA_Temp,
 * Temp1-6) aren't in policy_list, so they're left unset — Genesys will keep
 * whatever default/blank value applies.
 *
 * Most policy_list columns are nullable, so every value here is coerced to
 * a string (empty string if null) rather than risking the literal text
 * "null" being sent to Genesys.
 */
export function policyToGenesysContact(policy: PolicyRow) {
  const s = (v: string | number | null) => (v === null || v === undefined ? "" : String(v));
  return {
    data: {
      Phone_Num: s(policy.phone_num),
      Policy_Num: s(policy.policy_no),
      Customer_Name: s(policy.policy_holder),
      Plan: s(policy.plan),
      Premium: s(policy.amount),
      Prem_due: s(policy.due_date),
      Prem_Paid_Status: s(policy.payment_status),
      email_id: s(policy.email_id),
      whatsapp_num: s(policy.whatsapp_num),
      Due_days: policy.due_date ? daysUntil(policy.due_date) : "",
    },
    callable: true,
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

export type GenesysSyncResult = {
  contactListId: string;
  totalContacts: number;
  batches: number;
  errors: { batchIndex: number; message: string }[];
};

/**
 * Inserts policies into the configured Genesys Cloud calling list.
 * Batches requests at 1000 contacts (the API's documented limit per call).
 */
export async function insertPoliciesToCallingList(
  policies: PolicyRow[],
  contactListIdOverride?: string
): Promise<GenesysSyncResult> {
  const contactListId = contactListIdOverride || process.env.GENESYS_CALLING_LIST_ID;
  if (!contactListId) {
    throw new Error("Missing GENESYS_CALLING_LIST_ID environment variable.");
  }

  const token = await getAccessToken();
  const contacts = policies.map(policyToGenesysContact);

  const errors: { batchIndex: number; message: string }[] = [];
  let batches = 0;

  for (let i = 0; i < contacts.length; i += MAX_CONTACTS_PER_REQUEST) {
    const batch = contacts.slice(i, i + MAX_CONTACTS_PER_REQUEST);
    batches += 1;

    const res = await fetch(
      `${API_BASE}/api/v2/outbound/contactlists/${contactListId}/contacts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      errors.push({ batchIndex: batches - 1, message: `HTTP ${res.status}: ${text}` });
    }
  }

  return {
    contactListId,
    totalContacts: contacts.length,
    batches,
    errors,
  };
}
