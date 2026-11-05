const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Start of a rolling window. Call only after `await connection()` in Server Components. */
export function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

export function formatDateTime(date: Date | null | undefined) {
  return date ? dateTime.format(date) : "—";
}
