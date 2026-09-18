"use client";

import ThemeToggle from "./ThemeToggle";

export default function TopNav({
  onGoHome,
  onAddPolicy,
}: {
  onGoHome: () => void;
  onAddPolicy: () => void;
}) {
  return (
    <div className="sticky top-0 z-40 border-b hairline bg-[var(--paper)]/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <button
          onClick={onGoHome}
          className="flex items-center gap-2 group"
          title="Back to dashboard"
        >
          <span className="w-8 h-8 rounded-lg bg-[var(--navy)] text-white flex items-center justify-center font-serif-brand text-sm">
            G
          </span>
          <span className="font-serif-brand text-lg text-[var(--navy)] group-hover:text-[var(--navy-deep)] transition-colors">
            Gen Insurance Policy Admin
          </span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onAddPolicy}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--navy)] text-white hover:bg-[var(--navy-deep)] shadow-[var(--shadow-sm)] transition-colors"
          >
            + Add policy
          </button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
