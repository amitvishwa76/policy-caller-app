export default function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toUpperCase();
  const styles: Record<string, string> = {
    PAID: "text-[var(--success)] border-[var(--success)]",
    PENDING: "text-[var(--amber)] border-[var(--amber)]",
  };
  const style = styles[normalized] || "text-[var(--ink-soft)] border-[var(--border-strong)]";

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs tracking-wide ${style}`}
    >
      {status}
    </span>
  );
}
