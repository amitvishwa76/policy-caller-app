"use client";

import { useEffect, useState } from "react";
import { Shield, Lock, Copy, Check, Clock, CreditCard } from "lucide-react";

type PolicyInfo = {
  policy_no: string;
  policy_holder: string | null;
  plan: string | null;
  amount: number | null;
  due_date: string | null;
  payment_status: string;
};

const EXPIRY_SECONDS = 15 * 60;

export default function PaymentPageClient({
  token,
  policy: initialPolicy,
  qrDataUrl,
  upiId,
}: {
  token: string;
  policy: PolicyInfo;
  qrDataUrl: string;
  upiId: string;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);

  useEffect(() => {
    if (policy.payment_status === "PAID") return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [policy.payment_status]);

  const alreadyPaid = policy.payment_status === "PAID";
  const expired = secondsLeft === 0 && !alreadyPaid;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable — silently ignore, the UPI ID is visible to copy by hand.
    }
  }

  async function handlePay() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${token}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Payment could not be completed.");
        return;
      }
      setPolicy(json.policy);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] flex items-start justify-center py-8 px-4">
      <div className="w-full max-w-md surface rounded-2xl overflow-hidden shadow-[var(--shadow-md)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b hairline">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-[var(--navy)] text-white flex items-center justify-center">
              <Shield size={18} />
            </span>
            <div>
              <p className="font-serif-brand text-base text-[var(--navy)] leading-tight">
                Gen Insurance
              </p>
              <p className="text-xs text-[var(--ink-soft)]">Secure Payment Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-[var(--success)]">
            <Lock size={12} />
            SSL Secured
          </div>
        </div>

        {alreadyPaid ? (
          <PaidState policy={policy} />
        ) : (
          <>
            {/* Amount banner */}
            <div className="bg-[var(--navy)] text-white px-5 py-6">
              <p className="text-xs uppercase tracking-wide text-white/70 mb-1">
                Renewal premium due
              </p>
              <p className="text-3xl font-semibold font-mono-data">
                ₹{policy.amount !== null ? Number(policy.amount).toLocaleString("en-IN") : "—"}
              </p>
              <p className="text-sm text-white/80 mt-1">
                Due by {policy.due_date || "—"} · Policy {policy.policy_no}
              </p>
            </div>

            {/* Plan row */}
            <div className="flex items-center justify-between px-5 py-3 bg-[var(--accent-soft)] border-b hairline">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[var(--navy)]" />
                <div>
                  <p className="text-sm font-medium">{policy.plan || "—"}</p>
                  <p className="text-xs text-[var(--ink-soft)]">{policy.policy_holder || "—"}</p>
                </div>
              </div>
              <span className="text-xs rounded-full bg-[var(--amber-soft)] text-[var(--amber)] px-2.5 py-1 font-medium">
                Due {policy.due_date || "—"}
              </span>
            </div>

            <div className="px-5 py-5 flex flex-col gap-5">
              <div>
                <p className="text-xs font-medium text-[var(--ink-soft)] uppercase tracking-wide mb-2">
                  Pay via UPI
                </p>
                <div className="flex items-center justify-between surface rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[var(--navy)] bg-[var(--accent-soft)] rounded px-1.5 py-0.5">
                      UPI
                    </span>
                    <div>
                      <p className="text-xs text-[var(--ink-soft)]">UPI ID</p>
                      <p className="text-sm font-mono-data">{upiId}</p>
                    </div>
                  </div>
                  <button
                    onClick={copyUpi}
                    className="text-xs px-3 py-1.5 rounded-md border hairline hover:bg-[var(--paper)] flex items-center gap-1"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="surface rounded-lg p-4 flex flex-col items-center gap-3">
                <p className="text-xs font-medium text-[var(--ink-soft)] uppercase tracking-wide">
                  Scan QR code to pay
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Payment QR code" className="w-48 h-48 rounded-lg" />
                <p className="text-xs text-[var(--ink-soft)]">Open GPay, PhonePe or Paytm → Scan QR</p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {["GPay", "PhonePe", "Paytm", "BHIM"].map((app) => (
                    <span
                      key={app}
                      className="text-xs px-2.5 py-1 rounded-full border hairline text-[var(--ink-soft)]"
                    >
                      {app}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                  expired
                    ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                    : "bg-[var(--amber-soft)] text-[var(--amber)]"
                }`}
              >
                <Clock size={14} />
                {expired ? (
                  "This link has expired. Please request a new one."
                ) : (
                  <>
                    Link expires in{" "}
                    <span className="font-mono-data">
                      {mm}:{ss}
                    </span>
                  </>
                )}
              </div>

              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

              <button
                onClick={handlePay}
                disabled={paying || expired}
                className="w-full rounded-lg bg-[var(--navy)] text-white py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[var(--navy-deep)] transition-colors"
              >
                <CreditCard size={16} />
                {paying ? "Processing…" : "Pay Now"}
              </button>

              <p className="text-xs text-center text-[var(--ink-soft)]">
                By proceeding you agree to Gen Insurance Terms &amp; Conditions.
                <br />
                This is a demo environment. No real transaction will occur.
              </p>
            </div>
          </>
        )}

        <div className="text-center text-xs text-[var(--ink-soft)] py-3 border-t hairline">
          Powered by <span className="font-medium">Gen Insurance</span>
        </div>
      </div>
    </div>
  );
}

function PaidState({ policy }: { policy: PolicyInfo }) {
  return (
    <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
      <span className="w-12 h-12 rounded-full bg-[var(--success-soft)] text-[var(--success)] flex items-center justify-center">
        <Check size={24} />
      </span>
      <p className="font-serif-brand text-lg text-[var(--navy)]">Payment received</p>
      <p className="text-sm text-[var(--ink-soft)]">
        Thank you — the premium for policy{" "}
        <span className="font-mono-data text-[var(--ink)]">{policy.policy_no}</span> has been
        marked as paid.
      </p>
    </div>
  );
}
