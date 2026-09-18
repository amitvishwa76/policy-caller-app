import { parseDueDate } from "./date";

// Required in this app's own workflow (business need), even though the
// database column itself is nullable for most of these.
export const REQUIRED_POLICY_FIELDS = [
  "policy_no",
  "payment_status",
  "amount",
  "policy_holder",
  "plan",
  "due_date",
  "phone_num",
] as const;

// Optional contact-channel fields.
export const OPTIONAL_POLICY_FIELDS = ["email_id", "whatsapp_num"] as const;

export const POLICY_FIELDS = [...REQUIRED_POLICY_FIELDS, ...OPTIONAL_POLICY_FIELDS] as const;

/** Validates a full policy payload (all required fields present) — used for create. */
export function validateFullPolicyInput(body: Record<string, unknown>): string | null {
  for (const field of REQUIRED_POLICY_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === "") {
      return `Missing required field: ${field}`;
    }
  }
  return validatePolicyFieldValues(body);
}

/** Validates only the fields present in the payload — used for partial edits. */
export function validatePartialPolicyInput(body: Record<string, unknown>): string | null {
  const unknownFields = Object.keys(body).filter(
    (k) => !POLICY_FIELDS.includes(k as (typeof POLICY_FIELDS)[number])
  );
  if (unknownFields.length > 0) {
    return `Unknown field(s): ${unknownFields.join(", ")}`;
  }
  return validatePolicyFieldValues(body);
}

function validatePolicyFieldValues(body: Record<string, unknown>): string | null {
  if (body.amount !== undefined && body.amount !== null) {
    if (typeof body.amount !== "number" || Number.isNaN(body.amount) || body.amount < 0) {
      return "amount must be a non-negative number.";
    }
  }
  if (body.due_date !== undefined && body.due_date !== null) {
    if (!parseDueDate(String(body.due_date))) {
      return `due_date must look like "18 Jun 2026" (got "${body.due_date}").`;
    }
  }
  if (body.policy_no !== undefined && String(body.policy_no).trim() === "") {
    return "policy_no cannot be empty.";
  }
  if (
    body.policy_holder !== undefined &&
    body.policy_holder !== null &&
    String(body.policy_holder).trim() === ""
  ) {
    return "policy_holder cannot be empty.";
  }
  if (
    body.phone_num !== undefined &&
    body.phone_num !== null &&
    !/^\d{7,15}$/.test(String(body.phone_num).trim())
  ) {
    return "phone_num must be 7-15 digits, no spaces or symbols.";
  }
  if (
    body.whatsapp_num !== undefined &&
    body.whatsapp_num !== null &&
    String(body.whatsapp_num).trim() !== "" &&
    !/^\d{7,15}$/.test(String(body.whatsapp_num).trim())
  ) {
    return "whatsapp_num must be 7-15 digits, no spaces or symbols.";
  }
  if (
    body.email_id !== undefined &&
    body.email_id !== null &&
    String(body.email_id).trim() !== "" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email_id).trim())
  ) {
    return "email_id must be a valid email address.";
  }
  return null;
}
