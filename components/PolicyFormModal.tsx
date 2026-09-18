"use client";

import { useState } from "react";
import { Policy } from "@/lib/types";
import { dueDateToInputValue, inputValueToDueDate } from "@/lib/date";

type FormState = {
  policy_no: string;
  payment_status: string;
  amount: string;
  policy_holder: string;
  plan: string;
  due_date_input: string; // yyyy-mm-dd, for the <input type="date">
  phone_num: string;
  email_id: string;
  whatsapp_num: string;
};

function toFormState(policy: Policy | null): FormState {
  if (!policy) {
    return {
      policy_no: "",
      payment_status: "PENDING",
      amount: "",
      policy_holder: "",
      plan: "",
      due_date_input: "",
      phone_num: "",
      email_id: "",
      whatsapp_num: "",
    };
  }
  return {
    policy_no: policy.policy_no,
    payment_status: policy.payment_status,
    amount: policy.amount !== null ? String(policy.amount) : "",
    policy_holder: policy.policy_holder || "",
    plan: policy.plan || "",
    due_date_input: policy.due_date ? dueDateToInputValue(policy.due_date) : "",
    phone_num: policy.phone_num || "",
    email_id: policy.email_id || "",
    whatsapp_num: policy.whatsapp_num || "",
  };
}

export default function PolicyFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  initial: Policy | null;
  onClose: () => void;
  onSaved: (policy: Policy) => void;
}) {
  const [form, setForm] = useState<FormState>(toFormState(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(form.amount);
    if (Number.isNaN(amountNum) || amountNum < 0) {
      setError("Amount must be a non-negative number.");
      return;
    }
    if (!form.due_date_input) {
      setError("Pick a due date.");
      return;
    }

    const payload = {
      policy_no: form.policy_no.trim(),
      payment_status: form.payment_status,
      amount: amountNum,
      policy_holder: form.policy_holder.trim(),
      plan: form.plan.trim(),
      due_date: inputValueToDueDate(form.due_date_input),
      phone_num: form.phone_num.trim(),
      email_id: form.email_id.trim() || null,
      whatsapp_num: form.whatsapp_num.trim() || null,
    };

    setSaving(true);
    try {
      const url = mode === "add" ? "/api/policies" : `/api/policies/${initial!.id}`;
      const method = mode === "add" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Save failed.");
        return;
      }
      onSaved(json.policy);
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-[var(--paper-raised)] border hairline rounded-sm p-6 w-full max-w-md flex flex-col gap-4"
      >
        <h2 className="font-serif-brand text-xl text-[var(--navy)]">
          {mode === "add" ? "Add policy" : `Edit policy ${initial?.policy_no}`}
        </h2>

        <Field label="Policy number">
          <input
            required
            value={form.policy_no}
            onChange={(e) => update("policy_no", e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Policy holder">
          <input
            required
            value={form.policy_holder}
            onChange={(e) => update("policy_holder", e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Plan">
          <input
            required
            value={form.plan}
            onChange={(e) => update("plan", e.target.value)}
            className="input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Payment status">
            <select
              value={form.payment_status}
              onChange={(e) => update("payment_status", e.target.value)}
              className="input"
            >
              <option value="PENDING">PENDING</option>
              <option value="PAID">PAID</option>
            </select>
          </Field>

          <Field label="Amount (₹)">
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
              className="input font-mono-data"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Due date">
            <input
              required
              type="date"
              value={form.due_date_input}
              onChange={(e) => update("due_date_input", e.target.value)}
              className="input font-mono-data"
            />
          </Field>

          <Field label="Phone number">
            <input
              required
              value={form.phone_num}
              onChange={(e) => update("phone_num", e.target.value.replace(/[^\d]/g, ""))}
              className="input font-mono-data"
              inputMode="numeric"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email (optional)">
            <input
              type="email"
              value={form.email_id}
              onChange={(e) => update("email_id", e.target.value)}
              className="input"
            />
          </Field>

          <Field label="WhatsApp number (optional)">
            <input
              value={form.whatsapp_num}
              onChange={(e) => update("whatsapp_num", e.target.value.replace(/[^\d]/g, ""))}
              className="input font-mono-data"
              inputMode="numeric"
            />
          </Field>
        </div>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <div className="flex justify-end gap-3 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-sm border hairline hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm rounded-sm bg-[var(--navy)] text-white hover:bg-[var(--navy-deep)] disabled:opacity-40"
          >
            {saving ? "Saving…" : mode === "add" ? "Add policy" : "Save changes"}
          </button>
        </div>

        <style jsx>{`
          .input {
            border: 1px solid var(--border);
            border-radius: 2px;
            padding: 0.5rem 0.75rem;
            background: transparent;
            width: 100%;
          }
        `}</style>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--ink-soft)]">{label}</span>
      {children}
    </label>
  );
}
