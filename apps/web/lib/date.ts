// Pure date helpers — calendar dates only, no time-of-day arithmetic.
//
// "Date" here means a YYYY-MM-DD string. The forecast API and Redis cache
// both key on this format. We avoid Date math because TZ + DST edges break
// "add 1 day" arithmetic in subtle ways; instead we split the string and
// use UTC epochs for arithmetic, then re-emit a string.

export const TZ = "America/Sao_Paulo";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

export function isValidISODate(input: unknown): input is string {
  if (typeof input !== "string" || !DATE_RE.test(input)) return false;
  const [y, m, d] = input.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return (
    back.getUTCFullYear() === y &&
    back.getUTCMonth() === m - 1 &&
    back.getUTCDate() === d
  );
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const next = new Date(t);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function diffDaysISO(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((ta - tb) / 86_400_000);
}

export function forecastDates(today = todayISO(), count = 7): string[] {
  return Array.from({ length: count }, (_, i) => addDaysISO(today, i));
}

const DATE_LABEL_FMT = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: TZ,
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  timeZone: TZ,
});

const DAY_MONTH_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: TZ,
});

function stripDots(s: string): string {
  return s.replace(/\./g, "").replace(/,/g, "");
}

function noonUTC(iso: string): Date {
  // Noon UTC is safely on the same calendar day across all Brazilian TZs.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDateLong(iso: string): string {
  return stripDots(DATE_LABEL_FMT.format(noonUTC(iso)));
}

export function formatWeekday(iso: string): string {
  return stripDots(WEEKDAY_FMT.format(noonUTC(iso)));
}

export function formatDayMonth(iso: string): string {
  return stripDots(DAY_MONTH_FMT.format(noonUTC(iso)));
}

export type DateKicker = "Hoje" | "Amanhã" | null;

export function dateKicker(iso: string, today = todayISO()): DateKicker {
  if (iso === today) return "Hoje";
  if (iso === addDaysISO(today, 1)) return "Amanhã";
  return null;
}
