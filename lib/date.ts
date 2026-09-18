const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parses due_date values stored as text in the form "18 Jun 2026".
 * Returns null if the string can't be parsed, so callers can decide
 * how to treat unparseable rows instead of silently including them.
 */
export function parseDueDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!match) return null;

  const [, dayStr, monthStr, yearStr] = match;
  const month = MONTHS[monthStr.slice(0, 3).toLowerCase()];
  if (month === undefined) return null;

  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);
  const date = new Date(year, month, day);

  // Guard against invalid dates like "31 Feb 2026" rolling over.
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Returns true if `date` falls within [today, today + days] inclusive, in local time. */
export function isWithinDaysAhead(date: Date, days: number): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= days;
}

/** Formats a Date back into the "18 Jun 2026" style for display consistency. */
export function formatDate(date: Date): string {
  const day = date.getDate();
  const month = Object.keys(MONTHS).find((m) => MONTHS[m] === date.getMonth());
  const monthLabel = month ? month.charAt(0).toUpperCase() + month.slice(1) : "";
  return `${day} ${monthLabel} ${date.getFullYear()}`;
}

/** Converts a "18 Jun 2026"-style string into an HTML <input type="date"> value ("2026-06-18"). */
export function dueDateToInputValue(value: string): string {
  const parsed = parseDueDate(value);
  if (!parsed) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Converts an HTML <input type="date"> value ("2026-06-18") into the "18 Jun 2026" text format. */
export function inputValueToDueDate(value: string): string {
  const [yyyy, mm, dd] = value.split("-").map((v) => parseInt(v, 10));
  if (!yyyy || !mm || !dd) return "";
  return formatDate(new Date(yyyy, mm - 1, dd));
}
