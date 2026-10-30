// Date helpers. All programme dates are local "YYYY-MM-DD" strings.
// Set TZ (e.g. TZ=Australia/Sydney) on the server so "today" matches your gym.
const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const today = () => ymd(new Date());
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
// Monday of the week containing `s` (or today)
export function mondayYmd(s) {
  const d = isYmd(s) ? parseYmd(s) : new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
