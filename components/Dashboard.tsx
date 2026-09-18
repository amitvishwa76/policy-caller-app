"use client";

import { useEffect, useMemo, useState } from "react";
import { Policy, Settings } from "@/lib/types";
import { parseDueDate, isWithinDaysAhead } from "@/lib/date";
import PolicyTable from "./PolicyTable";
import SyncPanel from "./SyncPanel";
import PolicyFormModal from "./PolicyFormModal";
import TopNav from "./TopNav";

export default function Dashboard() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [days, setDays] = useState(60);
  const [onlyPending, setOnlyPending] = useState(true);
  const [showOnlyDueSoon, setShowOnlyDueSoon] = useState(false);

  const [modal, setModal] = useState<{ mode: "add" | "edit"; policy: Policy | null } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [policiesRes, settingsRes] = await Promise.all([
          fetch("/api/policies"),
          fetch("/api/settings"),
        ]);
        const policiesJson = await policiesRes.json();
        const settingsJson = await settingsRes.json();

        if (cancelled) return;

        if (!policiesRes.ok) {
          setLoadError(policiesJson.error || "Failed to load policies.");
        } else {
          setPolicies(policiesJson.policies || []);
        }

        if (settingsRes.ok && settingsJson.settings) {
          setSettings(settingsJson.settings);
          setDays(settingsJson.settings.days_ahead ?? 60);
          setOnlyPending(settingsJson.settings.only_pending ?? true);
        }
      } catch {
        if (!cancelled) setLoadError("Network error while loading data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dueSoonIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of policies) {
      if (onlyPending && (p.payment_status || "").toUpperCase() !== "PENDING") continue;
      const parsed = parseDueDate(p.due_date);
      if (parsed && isWithinDaysAhead(parsed, days)) ids.add(p.id);
    }
    return ids;
  }, [policies, days, onlyPending]);

  function handleSaved(saved: Policy) {
    setPolicies((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
    setModal(null);
  }

  function goHome() {
    setModal(null);
    setShowOnlyDueSoon(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const visiblePolicies = showOnlyDueSoon
    ? policies.filter((p) => dueSoonIds.has(p.id))
    : policies;

  return (
    <>
      <TopNav onGoHome={goHome} onAddPolicy={() => setModal({ mode: "add", policy: null })} />

      <div className="max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        <p className="text-[var(--ink-soft)] text-sm">
          Live view of <span className="font-mono-data">policy_list</span> — flag policies
          coming due and hand them to Genesys for calling.
        </p>

        {loadError && (
          <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)] p-4 text-sm">
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--ink-soft)]">
                {loading
                  ? "Loading policies…"
                  : `Showing ${visiblePolicies.length} of ${policies.length} polic${
                      policies.length === 1 ? "y" : "ies"
                    }`}
              </p>
              <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
                <input
                  type="checkbox"
                  checked={showOnlyDueSoon}
                  onChange={(e) => setShowOnlyDueSoon(e.target.checked)}
                />
                Due-soon only
              </label>
            </div>

            {loading ? (
              <div className="surface rounded-xl p-10 text-center text-[var(--ink-soft)]">
                Loading…
              </div>
            ) : (
              <PolicyTable
                policies={visiblePolicies}
                dueSoonIds={dueSoonIds}
                onEdit={(p) => setModal({ mode: "edit", policy: p })}
              />
            )}
          </div>

          <SyncPanel
            days={days}
            onDaysChange={setDays}
            onlyPending={onlyPending}
            onOnlyPendingChange={setOnlyPending}
            matchCount={dueSoonIds.size}
            settings={settings}
            onSettingsSaved={setSettings}
          />
        </div>
      </div>

      {modal && (
        <PolicyFormModal
          mode={modal.mode}
          initial={modal.policy}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
