"use client";

import { useState } from "react";
import { Settings } from "@/lib/types";

type SyncOutcome = {
  kind: "success" | "error" | "info";
  message: string;
} | null;

/** Genesys errors come back as "HTTP 400: {...json...}" — pull out the readable `message` field if present. */
function extractGenesysError(raw: string): string {
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return raw;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart));
    return parsed.message || raw;
  } catch {
    return raw;
  }
}

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
  const [savingAutoSend, setSavingAutoSend] = useState(false);

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
        if (errCount > 0) {
          setOutcome({
            kind: "error",
            message: `Sent ${json.matched} contact(s), but ${errCount} batch(es) failed: ${extractGenesysError(
              json.result.errors[0].message
            )}`,
          });
        } else {
          setOutcome({
            kind: "success",
            message: `Sent ${json.matched} contact(s) to the Genesys calling list.`,
          });
        }
      }
    } catch {
      setOutcome({ kind: "error", message: "Network error while syncing." });
    } finally {
      setSyncing(false);
    }
  }

  async function setAutoSend(next: boolean) {
    setSavingAutoSend(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_send: next, days_ahead: days, only_pending: onlyPending }),
      });
      const json = await res.json();
      if (res.ok) {
        onSettingsSaved(json.settings);
        if (next && json.autoSyncOutcome?.ranSync) {
          setOutcome({
            kind: "success",
            message: `Auto-send is on. Sent ${json.autoSyncOutcome.matched} contact(s) already matching the filter.`,
          });
        } else if (next) {
          setOutcome({ kind: "info", message: "Auto-send is on — new due policies will be sent automatically." });
        }
      }
    } finally {
      setSavingAutoSend(false);
    }
  }

  const autoOn = settings?.auto_send ?? false;

  return (
    <aside className="flex flex-col gap-6">
      <section className="surface rounded-xl p-5">
        <h2 className="font-serif-brand text-lg mb-4">Due-date filter</h2>

        <label className="block text-sm text-[var(--ink-soft)] mb-1">
          Premium due within (days)
        </label>
        <input
          type="number"
          min={0}
          value={days}
          onChange={(e) => onDaysChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
          className="w-full surface rounded-lg px-3 py-2 mb-4 font-mono-data"
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
          className="w-full rounded-lg bg-[var(--navy)] text-white py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-[var(--navy-deep)] transition-colors"
        >
          {syncing ? "Sending to Genesys…" : "Send matching policies now"}
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

      <section className="surface rounded-xl p-5">
        <h2 className="font-serif-brand text-lg mb-1">Send mode</h2>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          Manual: use the button above whenever you want. Auto: as soon as a policy matches
          this filter (right now, or the moment it&apos;s added/edited), it&apos;s sent to
          Genesys automatically — no duplicate sends.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setAutoSend(false)}
            disabled={savingAutoSend}
            className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
              !autoOn
                ? "bg-[var(--navy)] text-white border-transparent"
                : "hairline text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            }`}
          >
            Manual
          </button>
          <button
            onClick={() => setAutoSend(true)}
            disabled={savingAutoSend}
            className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
              autoOn
                ? "bg-[var(--navy)] text-white border-transparent"
                : "hairline text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            }`}
          >
            Auto
          </button>
        </div>

        <p className="text-xs text-[var(--ink-soft)]">
          Last auto-check:{" "}
          <span className="font-mono-data">
            {settings?.last_auto_check_at
              ? new Date(settings.last_auto_check_at).toLocaleString("en-IN")
              : "never"}
          </span>
        </p>
        {autoOn && (
          <p className="text-xs text-[var(--ink-soft)] mt-1">
            A daily safety-net check also runs in case a due date drifts into range without
            any edit. Editing or adding a policy triggers an immediate check.
          </p>
        )}
      </section>
    </aside>
  );
}
