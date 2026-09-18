import QRCode from "qrcode";
import getSupabaseAdmin, { POLICY_TABLE, PAYMENT_LINKS_TABLE } from "@/lib/supabase";
import PaymentPageClient from "@/components/PaymentPageClient";

export const dynamic = "force-dynamic";

const DEMO_UPI_ID = process.env.DEMO_UPI_ID || "geninsurance@axis";

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (err: unknown) {
    return <ConfigError message={err instanceof Error ? err.message : "Configuration error."} />;
  }

  const { data: link } = await supabase
    .from(PAYMENT_LINKS_TABLE)
    .select("policy_id")
    .eq("token", token)
    .maybeSingle();

  if (!link) {
    return <InvalidLink />;
  }

  const { data: policy } = await supabase
    .from(POLICY_TABLE)
    .select("policy_no, policy_holder, plan, amount, due_date, payment_status")
    .eq("id", link.policy_id)
    .single();

  if (!policy) {
    return <InvalidLink />;
  }

  const upiUri = `upi://pay?pa=${encodeURIComponent(DEMO_UPI_ID)}&pn=GenInsurance&am=${
    policy.amount ?? ""
  }&tn=${encodeURIComponent(policy.policy_no)}`;
  const qrDataUrl = await QRCode.toDataURL(upiUri, { margin: 1, width: 240 });

  return (
    <PaymentPageClient
      token={token}
      policy={policy}
      qrDataUrl={qrDataUrl}
      upiId={DEMO_UPI_ID}
    />
  );
}

function ConfigError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-6">
      <div className="surface rounded-2xl p-8 max-w-sm text-center">
        <h1 className="font-serif-brand text-xl text-[var(--danger)] mb-2">
          Configuration error
        </h1>
        <p className="text-sm text-[var(--ink-soft)]">{message}</p>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-6">
      <div className="surface rounded-2xl p-8 max-w-sm text-center">
        <h1 className="font-serif-brand text-xl text-[var(--navy)] mb-2">Link not found</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          This payment link is invalid or no longer exists. Please contact your insurer for a
          new link.
        </p>
      </div>
    </div>
  );
}
