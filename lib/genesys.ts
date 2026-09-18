import type { PolicyRow } from "./supabase";

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
 * for a contact list contact. Column names on the right must match the
 * columns configured on your Genesys contact list exactly (case-sensitive).
 * Adjust this mapping to match your actual contact list schema.
 */
export function policyToGenesysContact(policy: PolicyRow) {
  return {
    data: {
      Phone: policy.phone_num,
      PolicyNo: policy.policy_no,
      PolicyHolder: policy.policy_holder,
      Plan: policy.plan,
      Amount: String(policy.amount),
      DueDate: policy.due_date,
      PaymentStatus: policy.payment_status,
    },
    callable: true,
  };
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
