"use client";

import { useState } from "react";
import { Settings } from "@/lib/types";

type SyncOutcome = {
  kind: "success" | "error" | "info";
  message: string;
} | null;

export default function SyncPanel({
  days,
  onDaysChange,
  onlyPending,
  onOnlyPendingChange,
  matchCount,
  settings,
  onSettingsSaved,
}: {
  days: number;
  onDaysChange: (v: number) => void;
  onlyPending: boolean;
  onOnlyPendingChange: (v: boolean) => void;
  matchCount: number;
  settings: Settings | null;
  onSettingsSaved: (s: Settings) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [outcome, setOutcome] = useState<SyncOutcome>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [frequency, setFrequency] = useState<Settings["frequency"]>(
    settings?.frequency ?? "off"
  );

  async function runManualSync() {
    setSyncing(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/genesys/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, onlyPending }),
      });
      const json = await res.json();

      if (!res.ok) {
        setOutcome({ kind: "error", message: json.error || "Sync failed." });
      } else if (json.count === 0) {
        setOutcome({ kind: "info", message: "No policies matched the filter — nothing sent." });
      } else {
        const errCount = json.result?.errors?.length ?? 0;
        setOutcome(
          errCount > 0
            ? {
                kind: "error",
                message: `Sent ${json.matched} contact(s), but ${errCount} batch(es) failed. Check server logs.`,
              }
            : { kind: "success", message: `Sent ${json.matched} contact(s) to the Genesys calling list.` }
        );
      }
    } catch {
      setOutcome({ kind: "error", message: "Network error while syncing." });
    } finally {
      setSyncing(false);
    }
  }

  async function saveFrequency(next: Settings["frequency"]) {
    setFrequency(next);
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: next, days_ahead: days, only_pending: onlyPending }),
      });
      const json = await res.json();
      if (res.ok) onSettingsSaved(json.settings);
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <aside className="flex flex-col gap-6">
      <section className="border hairline rounded-sm bg-[var(--paper-raised)] p-5">
        <h2 className="font-serif-brand text-lg mb-4">Due-date filter</h2>

        <label className="block text-sm text-[var(--ink-soft)] mb-1">
          Premium due within (days)
        </label>
        <input
          type="number"
          min={0}
          value={days}
          onChange={(e) => onDaysChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
          className="w-full border hairline rounded-sm px-3 py-2 mb-4 bg-transparent font-mono-data"
        />

        <label className="flex items-center gap-2 text-sm mb-4">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => onOnlyPendingChange(e.target.checked)}
          />
          Only include PENDING policies
        </label>

        <p className="text-sm text-[var(--ink-soft)] mb-4">
          <span className="font-mono-data text-[var(--ink)]">{matchCount}</span> polic
          {matchCount === 1 ? "y" : "ies"} match this filter right now.
        </p>

        <button
          onClick={runManualSync}
          disabled={syncing || matchCount === 0}
          className="w-full rounded-sm bg-[var(--navy)] text-white py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-[var(--navy-deep)] transition-colors"
        >
          {syncing ? "Sending to Genesys…" : "Send matching policies to Genesys"}
        </button>

        {outcome && (
          <p
            className={`mt-3 text-sm ${
              outcome.kind === "success"
                ? "text-[var(--success)]"
                : outcome.kind === "error"
                ? "text-[var(--danger)]"
                : "text-[var(--ink-soft)]"
            }`}
          >
            {outcome.message}
          </p>
        )}
      </section>

      <section className="border hairline rounded-sm bg-[var(--paper-raised)] p-5">
        <h2 className="font-serif-brand text-lg mb-1">Automatic sync</h2>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          Runs this same filter on a schedule and pushes results to Genesys automatically.
        </p>

        <div className="flex flex-col gap-2 mb-4">
          {(["off", "daily", "twice_daily"] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="frequency"
                checked={frequency === opt}
                onChange={() => saveFrequency(opt)}
                disabled={savingSettings}
              />
              {opt === "off" ? "Off" : opt === "daily" ? "Once daily" : "Twice daily"}
            </label>
          ))}
        </div>

        <p className="text-xs text-[var(--ink-soft)]">
          Last automatic run:{" "}
          <span className="font-mono-data">
            {settings?.last_run_at
              ? new Date(settings.last_run_at).toLocaleString("en-IN")
              : "never"}
          </span>
        </p>
      </section>
    </aside>
  );
}
