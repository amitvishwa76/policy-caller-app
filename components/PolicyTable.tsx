"use client";

import { Policy } from "@/lib/types";
import StatusPill from "./StatusPill";

export default function PolicyTable({
  policies,
  dueSoonIds,
  onEdit,
}: {
  policies: Policy[];
  dueSoonIds: Set<number>;
  onEdit: (policy: Policy) => void;
}) {
  if (policies.length === 0) {
    return (
      <div className="border hairline rounded-sm p-10 text-center text-[var(--ink-soft)]">
        No policies to show. Loosen the filter or check the table has data.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border hairline rounded-sm bg-[var(--paper-raised)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b hairline text-left text-[var(--ink-soft)]">
            <th className="px-4 py-3 font-medium">Policy No.</th>
            <th className="px-4 py-3 font-medium">Holder</th>
            <th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">Amount</th>
            <th className="px-4 py-3 font-medium">Due date</th>
            <th className="px-4 py-3 font-medium">Phone</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => {
            const dueSoon = dueSoonIds.has(p.id);
            return (
              <tr
                key={p.id}
                className={`border-b hairline last:border-0 ${
                  dueSoon ? "bg-[var(--amber-soft)]/40" : ""
                }`}
              >
                <td className="px-4 py-3 font-mono-data">{p.policy_no}</td>
                <td className="px-4 py-3">{p.policy_holder}</td>
                <td className="px-4 py-3 text-[var(--ink-soft)]">{p.plan}</td>
                <td className="px-4 py-3">
                  <StatusPill status={p.payment_status} />
                </td>
                <td className="px-4 py-3 text-right font-mono-data">
                  &#8377;{Number(p.amount).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 font-mono-data">
                  {p.due_date}
                  {dueSoon && (
                    <span className="ml-2 text-xs text-[var(--amber)]">due soon</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono-data">{p.phone_num}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onEdit(p)}
                    className="text-sm text-[var(--navy)] hover:underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
