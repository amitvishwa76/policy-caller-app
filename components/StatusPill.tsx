export default function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toUpperCase();
  const styles: Record<string, string> = {
    PAID: "text-[var(--success)] bg-[var(--success-soft)] border-transparent",
    PENDING: "text-[var(--amber)] bg-[var(--amber-soft)] border-transparent",
  };
  const style =
    styles[normalized] || "text-[var(--ink-soft)] bg-transparent border-[var(--border-strong)]";

  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${style}`}
    >
      {status}
    </span>
  );
}
