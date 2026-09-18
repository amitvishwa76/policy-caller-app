import { parseDueDate } from "./date";

export const POLICY_FIELDS = [
  "policy_no",
  "payment_status",
  "amount",
  "policy_holder",
  "plan",
  "due_date",
  "phone_num",
] as const;

/** Validates a full policy payload (all fields required) — used for create. */
export function validateFullPolicyInput(body: Record<string, unknown>): string | null {
  for (const field of POLICY_FIELDS) {
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
  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || Number.isNaN(body.amount) || body.amount < 0) {
      return "amount must be a non-negative number.";
    }
  }
  if (body.due_date !== undefined) {
    if (!parseDueDate(String(body.due_date))) {
      return `due_date must look like "18 Jun 2026" (got "${body.due_date}").`;
    }
  }
  if (body.policy_no !== undefined && String(body.policy_no).trim() === "") {
    return "policy_no cannot be empty.";
  }
  if (body.policy_holder !== undefined && String(body.policy_holder).trim() === "") {
    return "policy_holder cannot be empty.";
  }
  if (body.phone_num !== undefined && !/^\d{7,15}$/.test(String(body.phone_num).trim())) {
    return "phone_num must be 7-15 digits, no spaces or symbols.";
  }
  return null;
}
