// ── Colours ────────────────────────────────────────────
export const C = {
  bg: "#F6F4EF", card: "#FFFFFF", text: "#1C1C1A", muted: "#9A9590",
  accent: "#5C6B3A", accentLight: "#EDF0E4",
  kcal: "#C0692A", protein: "#3D405B", carbs: "#6B9E7A", fat: "#B8922A",
  border: "#ECEAE4", danger: "#C0392B", dangerLight: "#FDECEA",
  green: "#2E7D52", amber: "#D97706", red: "#C0392B",
  greenBg: "#E8F5EE", amberBg: "#FEF3C7", redBg: "#FDECEA",
}

export const MACRO_CONFIG = {
  kcal:    { label: "Kcal",    color: C.kcal,    unit: "",  higherIsBetter: false },
  protein: { label: "Protein", color: C.protein, unit: "g", higherIsBetter: true  },
  carbs:   { label: "Carbs",   color: C.carbs,   unit: "g", higherIsBetter: false },
  fat:     { label: "Fat",     color: C.fat,     unit: "g", higherIsBetter: false },
}

export const DEFAULT_HABITS = [
  "Ice water face bath", "Eltroxin with 20m break", "30 min exercise",
  "Prayer", "Post-lunch medication", "Seed cycling",
  "Pre-dinner medication", "Water 3L", "Reading 30m", "PM skincare",
]

export const TODAY = new Date().toISOString().split("T")[0]

// ── Helpers ────────────────────────────────────────────
export function sum(arr, key) { return arr.reduce((a, i) => a + (i[key] || 0), 0) }
export function uid() { return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
export function formatTime(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true })
}
export function formatDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
}
export function toDateStr(date) { return date.toISOString().split("T")[0] }

export function getStatus(actual, target, higherIsBetter = false) {
  if (!target) return "neutral"
  const ratio = actual / target
  if (higherIsBetter) { if (ratio >= 0.9) return "green"; if (ratio >= 0.7) return "amber"; return "red" }
  else { if (ratio <= 1.1) return "green"; if (ratio <= 1.3) return "amber"; return "red" }
}
export function statusColor(s) { return s === "green" ? C.green : s === "amber" ? C.amber : s === "red" ? C.red : C.muted }
export function statusBg(s) { return s === "green" ? C.greenBg : s === "amber" ? C.amberBg : s === "red" ? C.redBg : C.bg }

export function calcTargets(primary, value) {
  const v = parseFloat(value) || 0
  if (primary === "protein") return { protein: v, kcal: Math.round(v * 20), carbs: Math.round(v * 3.5), fat: Math.round(v * 0.8) }
  if (primary === "kcal")    return { kcal: v, protein: Math.round(v * 0.25 / 4), carbs: Math.round(v * 0.45 / 4), fat: Math.round(v * 0.30 / 9) }
  if (primary === "carbs")   return { carbs: v, kcal: Math.round(v * 4 / 0.45), protein: Math.round(v * 0.25 / 0.45), fat: Math.round(v * 0.30 / 0.45 / 4) }
  return { fat: v, kcal: Math.round(v * 9 / 0.30), protein: Math.round(v * 0.25 * 9 / 0.30 / 4), carbs: Math.round(v * 0.45 * 9 / 0.30 / 4) }
}

export function getActiveTarget(targetHistory, dateStr) {
  if (!targetHistory?.length) return null
  return targetHistory.filter(t => t.startDate <= dateStr).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] || null
}

export function getActiveHabitSet(habitHistory, dateStr) {
  if (!habitHistory?.length) return { habits: [] }
  return habitHistory.filter(t => t.startDate <= dateStr).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] || { habits: [] }
}

export function makeFreshDay() {
  return {
    meals: [
      { id: uid(), name: "Breakfast", loggedAt: null, items: [] },
      { id: uid(), name: "Lunch",     loggedAt: null, items: [] },
      { id: uid(), name: "Dinner",    loggedAt: null, items: [] },
      { id: uid(), name: "Snack 1",   loggedAt: null, items: [] },
      { id: uid(), name: "Snack 2",   loggedAt: null, items: [] },
      { id: uid(), name: "Snack 3",   loggedAt: null, items: [] },
    ],
    habits: {}
  }
}
