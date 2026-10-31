export const fmtM = (m: number | null | undefined, digits = 1) =>
  m == null ? "—" : `${(m * 1000).toFixed(digits)} mm`;
export const fmtRad = (r: number) => `${r >= 0 ? "+" : ""}${r.toFixed(3)}`;
export const fmtSec = (s: number | null | undefined) => (s == null ? "—" : `${s.toFixed(2)} s`);
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const shortHash = (h: string) => h.slice(0, 12);
/** Plain metres for long distances (robot reach), where millimetres read as noise. */
export const fmtMetres = (m: number | null | undefined) => (m == null ? "—" : `${m.toFixed(2)} m`);
