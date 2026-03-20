// NutriTrack v9.5 - target fixes
import { useState, useEffect, useRef } from "react";
import { load, save } from './storage.js';
import BarcodeScanner from './BarcodeScanner.jsx';

const FONT = ``; // System fonts - no external dependency

const C = {
  bg: "#F5F6FA", card: "#FFFFFF", text: "#1C1C1A", muted: "#9A9590",
  accent: "#6B8CAE", accentLight: "#E4ECF4",
  kcal: "#C0692A", protein: "#3D405B", carbs: "#6B9E7A", fat: "#B8922A",
  border: "#E4E8F0", danger: "#C0392B", dangerLight: "#FDECEA",
  green: "#2E7D52", amber: "#D97706", red: "#C0392B",
  greenBg: "#E8F5EE", amberBg: "#FEF3C7", redBg: "#FDECEA",
};

function sum(arr, key) { return arr.reduce((a, i) => a + (i[key] || 0), 0); }
function uid() { return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function formatTime(ts) { if (!ts) return null; return new Date(ts).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true }); }
function formatDate(d) { return new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }); }
function toDateStr(date) { return date.toISOString().split("T")[0]; }
const TODAY = new Date().toISOString().split("T")[0];

function getStatus(actual, target, higherIsBetter = false) {
  if (!target) return "neutral";
  const ratio = actual / target;
  if (higherIsBetter) { if (ratio >= 0.9) return "green"; if (ratio >= 0.7) return "amber"; return "red"; }
  else { if (ratio <= 1.1) return "green"; if (ratio <= 1.3) return "amber"; return "red"; }
}
function statusColor(s) { return s === "green" ? C.green : s === "amber" ? C.amber : s === "red" ? C.red : C.muted; }
function statusBg(s) { return s === "green" ? C.greenBg : s === "amber" ? C.amberBg : s === "red" ? C.redBg : C.bg; }

const MACRO_CONFIG = {
  kcal: { label: "Kcal", color: C.kcal, unit: "", higherIsBetter: false },
  protein: { label: "Protein", color: C.protein, unit: "g", higherIsBetter: true },
  carbs: { label: "Carbs", color: C.carbs, unit: "g", higherIsBetter: false },
  fat: { label: "Fat", color: C.fat, unit: "g", higherIsBetter: false },
};

function calcTargets(primary, value) {
  const v = parseFloat(value) || 0;
  // Standard: 1g protein=4kcal, 1g carbs=4kcal, 1g fat=9kcal
  // Split: 30% protein, 45% carbs, 25% fat of total calories
  if (primary === "protein") {
    const kcal = Math.round(v * 4 / 0.30);
    return { protein: v, kcal, carbs: Math.round(kcal * 0.45 / 4), fat: Math.round(kcal * 0.25 / 9) };
  }
  if (primary === "kcal") {
    return { kcal: v, protein: Math.round(v * 0.30 / 4), carbs: Math.round(v * 0.45 / 4), fat: Math.round(v * 0.25 / 9) };
  }
  if (primary === "carbs") {
    const kcal = Math.round(v * 4 / 0.45);
    return { carbs: v, kcal, protein: Math.round(kcal * 0.30 / 4), fat: Math.round(kcal * 0.25 / 9) };
  }
  // fat
  const kcal = Math.round(v * 9 / 0.25);
  return { fat: v, kcal, protein: Math.round(kcal * 0.30 / 4), carbs: Math.round(kcal * 0.45 / 4) };
}

// Get active target for a given date from target history
function getActiveTarget(targetHistory, dateStr) {
  if (!targetHistory || targetHistory.length === 0) return null;
  // Sort by startDate desc, then by original index desc (later entry wins on tie)
  const withIndex = targetHistory.map((t, i) => ({ ...t, _idx: i }));
  const applicable = withIndex
    .filter(t => t.startDate <= dateStr)
    .sort((a, b) => {
      const dateDiff = b.startDate.localeCompare(a.startDate);
      return dateDiff !== 0 ? dateDiff : b._idx - a._idx;
    });
  return applicable[0] || null;
}

function getActiveHabitSet(habitHistory, dateStr) {
  if (!habitHistory || habitHistory.length === 0) return { habits: [] };
  const withIndex = habitHistory.map((t, i) => ({ ...t, _idx: i }));
  const applicable = withIndex
    .filter(t => t.startDate <= dateStr)
    .sort((a, b) => {
      const dateDiff = b.startDate.localeCompare(a.startDate);
      return dateDiff !== 0 ? dateDiff : b._idx - a._idx;
    });
  return applicable[0] || { habits: [] };
}

function isDayActive(activeDays, dateStr) {
  if (!activeDays || activeDays.length === 7) return true;
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return activeDays.includes(dow);
}

const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const ALL_DAYS = [0,1,2,3,4,5,6];

const DEFAULT_HABITS = [
  "Ice water face bath", "Eltroxin with 20m break", "30 min exercise",
  "Prayer", "Post-lunch medication", "Seed cycling",
  "Pre-dinner medication", "Water 3L", "Reading 30m", "PM skincare"
];

const INITIAL_TARGET_HISTORY = [{
  id: uid(), startDate: TODAY, endDate: null,
  kcal: 2000, protein: 120, carbs: 200, fat: 65, primary: "protein",
  activeDays: [0,1,2,3,4,5,6], label: "Default target"
}];

const INITIAL_HABIT_HISTORY = [{
  id: uid(), startDate: TODAY, endDate: null,
  habits: DEFAULT_HABITS, activeDays: [0,1,2,3,4,5,6], label: "Default habits"
}];

function makeFreshDay() {
  return {
    meals: [
      { id: uid(), name: "Breakfast", loggedAt: null, items: [] },
      { id: uid(), name: "Lunch", loggedAt: null, items: [] },
      { id: uid(), name: "Dinner", loggedAt: null, items: [] },
      { id: uid(), name: "Snack 1", loggedAt: null, items: [] },
      { id: uid(), name: "Snack 2", loggedAt: null, items: [] },
      { id: uid(), name: "Snack 3", loggedAt: null, items: [] },
    ],
    habits: {}
  };
}

// ── Shared UI ──────────────────────────────────────────
function MealIconWrapper({ name, color = C.accent, size = 20 }) {
  const s = { stroke: color, strokeWidth: 1.5, fill: "none" };
  if (name === "Breakfast") return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="6" {...s}/><path d="M14 4v3M14 21v3M4 14h3M21 14h3" {...s} strokeLinecap="round"/></svg>;
  if (name === "Lunch") return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><path d="M5 20h18" {...s} strokeLinecap="round"/><path d="M8 20c0-5 2-9 6-9s6 4 6 9" {...s} strokeLinecap="round"/><path d="M17 20V8" stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none"/></svg>;
  if (name === "Dinner") return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><path d="M9 8v5a5 5 0 0010 0V8" {...s} strokeLinecap="round"/><path d="M14 18v4M10 22h8" {...s} strokeLinecap="round"/></svg>;
  if (name.startsWith("Snack")) return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><path d="M9 8c0-1.5 1.5-2.5 3-2 1.5.5 2 2 2 3" stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none"/><path d="M7 11h14l-1.5 9a2 2 0 01-2 1.5h-7a2 2 0 01-2-1.5L7 11z" {...s}/><path d="M5 11h18" {...s} strokeLinecap="round"/></svg>;
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, fontWeight: 700, color }}>{initials}</span>;
}

function Ring({ value, max, size = 108, stroke = 10, color = C.accent, label, sublabel }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, pct = Math.min(value / (max || 1), 1);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 20, fontWeight: 500, color: C.text, lineHeight: 1 }}>{label}</span>
        <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, marginTop: 2 }}>{sublabel}</span>
      </div>
    </div>
  );
}

function MacroBar({ label, value, target, higherIsBetter }) {
  const pct = Math.min(value / (target || 1), 1);
  const status = target ? getStatus(value, target, higherIsBetter) : "neutral";
  const sc = statusColor(status);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, fontWeight: 600, color: sc }}>{value} <span style={{ color: C.muted, fontWeight: 400 }}>/ {target || "—"}</span></span>
      </div>
      <div style={{ height: 5, background: C.border, borderRadius: 4 }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: sc, borderRadius: 4, transition: "width 0.5s" }}/>
      </div>
    </div>
  );
}

function NutritionTable({ items, onDeleteItem }) {
  const cols = ["Kcal","Protein","Carbs","Fat"], colColors = [C.kcal,C.protein,C.carbs,C.fat], keys = ["kcal","protein","carbs","fat"], units = ["","g","g","g"];
  // Group same-named items and show combined qty
  const grouped = [];
  items.forEach(item => {
    const existing = grouped.find(g => g.name === item.name);
    if (existing) {
      existing.qty++;
      keys.forEach(k => { existing[k] += item[k] || 0; });
      existing.ids.push(item.id);
    } else {
      grouped.push({ ...item, qty: 1, ids: [item.id] });
    }
  });
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif" }}>
      <thead><tr>
        <th style={{ textAlign: "left", fontSize: 10, color: C.muted, fontWeight: 500, padding: "4px 0 6px", width: "38%" }}>Item</th>
        {cols.map((col, i) => <th key={col} style={{ textAlign: "right", fontSize: 10, color: colColors[i], fontWeight: 600, padding: "4px 3px 6px" }}>{col}</th>)}
        <th style={{ width: 24 }}/>
      </tr></thead>
      <tbody>
        {grouped.map(item => (
          <tr key={item.ids[0]} style={{ borderTop: `1px solid ${C.border}` }}>
            <td style={{ fontSize: 12, color: C.text, padding: "8px 6px 8px 0", lineHeight: 1.3 }}>
              {item.name}
              {item.qty > 1 && <span style={{ fontSize: 10, color: C.accent, fontWeight: 600, marginLeft: 4 }}>×{item.qty}</span>}
            </td>
            {keys.map((k, i) => <td key={k} style={{ textAlign: "right", fontSize: 12, color: C.text, padding: "8px 3px", fontWeight: 500 }}>{item[k]}{units[i]}</td>)}
            <td style={{ textAlign: "right", padding: "8px 0" }}>
              <button onClick={() => item.ids.forEach(id => onDeleteItem(id))} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 15 }}>×</button>
            </td>
          </tr>
        ))}
        {items.length > 1 && <tr style={{ borderTop: `1.5px solid ${C.border}`, background: C.bg }}>
          <td style={{ fontSize: 11, color: C.muted, padding: "6px 0", fontWeight: 500 }}>Total</td>
          {keys.map((k, i) => <td key={k} style={{ textAlign: "right", fontSize: 12, color: colColors[i], padding: "6px 3px", fontWeight: 700 }}>{sum(items, k)}{units[i]}</td>)}
          <td/>
        </tr>}
      </tbody>
    </table>
  );
}

// ── Mini Calendar Picker ───────────────────────────────
function CalendarPicker({ value, onChange, onClose, minDate, maxDate }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function selectDate(d) {
    const str = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (minDate && str < minDate) return;
    if (maxDate && str > maxDate) return;
    onChange(str);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.card, borderRadius: 20, padding: "20px", width: 300, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted, padding: "4px 8px" }}>‹</button>
          <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 16, color: C.text }}>{monthNames[viewMonth]} {viewYear}</span>
          <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted, padding: "4px 8px" }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 6 }}>
          {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, padding: "3px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i}/>;
            const str = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const isSelected = str === value;
            const isDisabled = (minDate && str < minDate) || (maxDate && str > maxDate);
            return (
              <button key={i} onClick={() => selectDate(d)} disabled={isDisabled} style={{ aspectRatio: "1", borderRadius: 8, border: `1.5px solid ${isSelected ? C.accent : "transparent"}`, background: isSelected ? C.accentLight : "transparent", cursor: isDisabled ? "default" : "pointer", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, fontWeight: isSelected ? 700 : 400, color: isSelected ? C.accent : isDisabled ? C.border : C.text }}>
                {d}
              </button>
            );
          })}
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: 14, padding: "10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.muted, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function DateField({ label, value, onChange, minDate, maxDate }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ flex: 1 }}>
      <label style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      <button onClick={() => setOpen(true)} style={{ width: "100%", padding: "10px 12px", borderRadius: 11, border: `1.5px solid ${C.border}`, background: C.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: value ? C.text : C.muted, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{value || "Pick date"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      </button>
      {open && <CalendarPicker value={value} onChange={onChange} onClose={() => setOpen(false)} minDate={minDate} maxDate={maxDate}/>}
    </div>
  );
}

// ── Add Item Modal (AI Search + Saved + Scan) ──────────
function AddItemModal({ mealName, onClose, onAdd, favourites, customItems }) {
  const [activeTab, setActiveTab] = useState("ai");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [starring, setStarring] = useState({});
  const [showBarcode, setShowBarcode] = useState(false);

  async function analyse() {
    if (!text.trim()) return;
    setLoading(true); setError(null); setPreview(null);
    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreview(data.items);
    } catch (e) { setError("Couldn't analyse that. Please try again."); }
    setLoading(false);
  }

  const allSaved = [...customItems, ...favourites];
  if (showBarcode) return <BarcodeScanner
    onClose={() => setShowBarcode(false)}
    onAdd={(items) => { onAdd(items, {}); onClose(); }}
    onManualAI={(name) => { setShowBarcode(false); setText(name); setActiveTab('ai'); }}
  />;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", padding: "20px 18px 32px", maxHeight: "88%", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 18, color: C.text }}>Add to {mealName}</span>
          <button onClick={onClose} style={{ background: C.border, border: "none", borderRadius: 20, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.muted }}>×</button>
        </div>
        <div style={{ display: "flex", background: C.bg, borderRadius: 11, padding: 3, marginBottom: 16, flexShrink: 0 }}>
          {[["ai","AI Search"], ["saved",`Saved (${allSaved.length})`], ["barcode","📷 Scan"]].map(([id, label]) => (
            <button key={id} onClick={() => id === "barcode" ? setShowBarcode(true) : setActiveTab(id)} style={{ flex: 1, padding: "7px 4px", border: "none", borderRadius: 9, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer", background: activeTab === id && id !== "barcode" ? C.card : "transparent", color: activeTab === id && id !== "barcode" ? C.accent : C.muted, boxShadow: activeTab === id && id !== "barcode" ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>{label}</button>
          ))}
        </div>
        {activeTab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.muted, margin: "0 0 10px" }}>Describe any food naturally — AI estimates nutrition using Indian serving sizes</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexShrink: 0 }}>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && analyse()} placeholder="e.g. poha with coconut water"
                style={{ flex: 1, padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text }} autoFocus/>
              <button onClick={analyse} disabled={loading || !text.trim()} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 11, padding: "11px 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: (!text.trim() || loading) ? 0.5 : 1 }}>{loading ? "…" : "Search"}</button>
            </div>
            {error && <p style={{ color: C.danger, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, marginBottom: 10 }}>{error}</p>}
            {preview && <div style={{ overflowY: "auto", flex: 1 }}>
              {preview.map((item, i) => (
                <div key={i} style={{ background: C.bg, borderRadius: 11, padding: "11px 13px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 500, color: C.text, margin: "0 0 4px" }}>{item.name}</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontSize: 11, color: C.kcal, fontWeight: 600 }}>{item.kcal} kcal</span>
                      <span style={{ fontSize: 11, color: C.protein }}>P {item.protein}g</span>
                      <span style={{ fontSize: 11, color: C.carbs }}>C {item.carbs}g</span>
                      <span style={{ fontSize: 11, color: C.fat }}>F {item.fat}g</span>
                    </div>
                  </div>
                  <button onClick={() => setStarring(s => ({ ...s, [i]: !s[i] }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: "4px 6px", opacity: starring[i] ? 1 : 0.3 }}>⭐</button>
                </div>
              ))}
              <button onClick={() => { onAdd(preview, starring); onClose(); }} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>Add to {mealName}</button>
            </div>}
          </div>
        )}
        {activeTab === "saved" && (
          <div style={{ overflowY: "auto", flex: 1 }}>
            {allSaved.length === 0 && <div style={{ textAlign: "center", padding: "32px 20px" }}><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, color: C.muted }}>Nothing saved yet</p></div>}
            {customItems.length > 0 && <><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, margin: "0 0 8px" }}>Custom Meals</p>
              {customItems.map(item => <SavedRow key={item.id} item={item} badge="custom" onAdd={() => { onAdd([item], {}); onClose(); }}/>)}</>}
            {favourites.length > 0 && <><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, margin: `${customItems.length > 0 ? "14px" : "0"} 0 8px` }}>Favourites</p>
              {favourites.map(item => <SavedRow key={item.id} item={item} badge="fav" onAdd={() => { onAdd([item], {}); onClose(); }}/>)}</>}
          </div>
        )}
      </div>
    </div>
  );
}

function SavedRow({ item, badge, onAdd }) {
  return (
    <div style={{ background: C.bg, borderRadius: 11, padding: "11px 13px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 500, color: C.text, margin: 0 }}>{item.name}</p>
          <span style={{ fontSize: 9, background: badge === "custom" ? C.accentLight : "#FFF8E6", color: badge === "custom" ? C.accent : C.fat, borderRadius: 5, padding: "2px 6px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontWeight: 600, textTransform: "uppercase" }}>{badge === "custom" ? "custom" : "⭐"}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.kcal, fontWeight: 600 }}>{item.kcal} kcal</span>
          <span style={{ fontSize: 11, color: C.protein }}>P {item.protein}g</span>
          <span style={{ fontSize: 11, color: C.carbs }}>C {item.carbs}g</span>
          <span style={{ fontSize: 11, color: C.fat }}>F {item.fat}g</span>
        </div>
      </div>
      <button onClick={onAdd} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
    </div>
  );
}

// ── Add/Edit Meal Modal ────────────────────────────────
function AddMealModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const presets = ["Breakfast","Lunch","Dinner","Snack 1","Snack 2","Snack 3","Pre-Workout","Post-Workout","Supper","Brunch"];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", padding: "22px 18px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 19, color: C.text }}>Add a meal</span>
          <button onClick={onClose} style={{ background: C.border, border: "none", borderRadius: 20, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.muted }}>×</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {presets.map(p => <button key={p} onClick={() => setName(p)} style={{ background: name === p ? C.accentLight : C.bg, color: name === p ? C.accent : C.muted, border: `1.5px solid ${name === p ? C.accent : C.border}`, borderRadius: 20, padding: "6px 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, cursor: "pointer", fontWeight: name === p ? 600 : 400 }}>{p}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Or type a custom name…"
            onKeyDown={e => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); onClose(); }}}
            style={{ flex: 1, padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text }}/>
          <button onClick={() => { if (name.trim()) { onAdd(name.trim()); onClose(); }}} disabled={!name.trim()} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 11, padding: "11px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: name.trim() ? 1 : 0.4 }}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Meal Card ──────────────────────────────────────────
function MealCard({ meal, onAddItems, onDeleteItem, onDeleteMeal }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div style={{ background: C.card, borderRadius: 16, marginBottom: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px", cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 36, height: 36, background: C.accentLight, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MealIconWrapper name={meal.name}/></div>
          <div>
            <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{meal.name}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              {meal.loggedAt && <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.accent, fontWeight: 500 }}>{formatTime(meal.loggedAt)}</span>}
              {meal.loggedAt && <span style={{ fontSize: 10, color: C.muted }}>·</span>}
              <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.muted }}>{meal.items.length === 0 ? "Empty" : `${meal.items.length} item${meal.items.length > 1 ? "s" : ""} · ${sum(meal.items, "kcal")} kcal`}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, padding: "4px 6px" }}>🗑</button>
          <span style={{ color: C.muted, fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
        </div>
      </div>
      {confirmDelete && <div style={{ background: C.dangerLight, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid #F5C6C2` }}>
        <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.danger }}>Delete "{meal.name}"?</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setConfirmDelete(false)} style={{ background: "#fff", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onDeleteMeal(meal.id)} style={{ background: C.danger, color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, cursor: "pointer" }}>Delete</button>
        </div>
      </div>}
      {open && <div style={{ borderTop: `1px solid ${C.border}` }}>
        {meal.items.length > 0 && <div style={{ padding: "4px 14px 8px" }}><NutritionTable items={meal.items} onDeleteItem={onDeleteItem}/></div>}
        <div style={{ padding: "8px 14px 12px" }}>
          <button onClick={() => onAddItems(meal.id)} style={{ width: "100%", background: C.accentLight, color: C.accent, border: "none", borderRadius: 10, padding: "10px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <span style={{ fontSize: 16 }}>+</span> Add item
          </button>
        </div>
      </div>}
    </div>
  );
}

// ── Log Tab ────────────────────────────────────────────
function LogTab({ data, activeDate, setActiveDate, onDataChange, favourites, customItems, onFavourite, targetHistory }) {
  const [addItemMealId, setAddItemMealId] = useState(null);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Ensure today always has stable meal IDs in data - never use makeFreshDay() inline
  useEffect(() => {
    if (!data[activeDate]) {
      const newData = JSON.parse(JSON.stringify(data));
      newData[activeDate] = makeFreshDay();
      onDataChange(newData);
    }
  }, [activeDate]);

  const dayData = data[activeDate] || { meals: [], habits: {} };
  const activeTarget = getActiveTarget(targetHistory, activeDate);
  const all = dayData.meals.flatMap(m => m.items);

  // 7 recent dates
  const recentDates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    recentDates.push(toDateStr(d));
  }

  function handleConfirmItems(items, starring) {
    const newData = JSON.parse(JSON.stringify(data));
    if (!newData[activeDate]) newData[activeDate] = makeFreshDay();
    const meal = newData[activeDate].meals.find(m => m.id === addItemMealId);
    if (!meal.loggedAt) meal.loggedAt = Date.now();
    items.forEach((item, i) => { meal.items.push({ ...item, id: uid() }); if (starring[i]) onFavourite(item); });
    onDataChange(newData);
  }
  function handleDeleteItem(itemId) {
    const newData = JSON.parse(JSON.stringify(data));
    for (const meal of newData[activeDate].meals) meal.items = meal.items.filter(i => i.id !== itemId);
    onDataChange(newData);
  }
  function handleDeleteMeal(mealId) {
    const newData = JSON.parse(JSON.stringify(data));
    newData[activeDate].meals = newData[activeDate].meals.filter(m => m.id !== mealId);
    onDataChange(newData);
  }
  function handleAddMeal(name) {
    const newData = JSON.parse(JSON.stringify(data));
    if (!newData[activeDate]) newData[activeDate] = makeFreshDay();
    newData[activeDate].meals.push({ id: uid(), name, loggedAt: null, items: [] });
    onDataChange(newData);
  }
  const activeMeal = dayData.meals.find(m => m.id === addItemMealId);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* Date strip + calendar icon */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 5, overflowX: "auto", flex: 1 }}>
          {recentDates.map(d => {
            const active = d === activeDate;
            const hasData = data[d]?.meals.some(m => m.items.length > 0);
            return (
              <button key={d} onClick={() => setActiveDate(d)} style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 9px", borderRadius: 12, border: `1.5px solid ${active ? C.accent : C.border}`, background: active ? C.accentLight : C.card, cursor: "pointer" }}>
                <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 9, color: active ? C.accent : C.muted, fontWeight: 500 }}>{new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short" })}</span>
                <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 600, color: active ? C.accent : C.text }}>{new Date(d + "T00:00:00").getDate()}</span>
                {hasData && <div style={{ width: 4, height: 4, borderRadius: 2, background: active ? C.accent : C.muted }}/>}
              </button>
            );
          })}
        </div>
        {/* Calendar icon for any date */}
        <button onClick={() => setShowCalendar(true)} title="Jump to any date" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="3"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
        </button>
      </div>

      {/* Target vs actual banner */}
      {activeTarget && (
        <div style={{ margin: "0 14px 10px", background: C.card, borderRadius: 14, padding: "11px 14px", border: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>vs Target</span>
            <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 700, color: statusColor(getStatus(sum(all,"kcal"), activeTarget.kcal, false)) }}>{sum(all,"kcal")} / {activeTarget.kcal} kcal</span>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {[["protein","Protein",true],["carbs","Carbs",false],["fat","Fat",false]].map(([k,label,hib]) => {
              const val = sum(all, k), tgt = activeTarget[k], st = getStatus(val, tgt, hib);
              return <div key={k} style={{ flex: 1, background: statusBg(st), borderRadius: 8, padding: "6px 7px", textAlign: "center" }}>
                <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, fontWeight: 700, color: statusColor(st), margin: 0 }}>{val}g</p>
                <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 9, color: C.muted, margin: "1px 0 0", textTransform: "uppercase" }}>{label}/{tgt}g</p>
              </div>;
            })}
          </div>
        </div>
      )}

      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px" }}>
        {dayData.meals.map(meal => (
          <MealCard key={meal.id} meal={meal} onAddItems={setAddItemMealId} onDeleteItem={handleDeleteItem} onDeleteMeal={handleDeleteMeal}/>
        ))}
        <button onClick={() => setShowAddMeal(true)} style={{ width: "100%", background: "transparent", border: `1.5px dashed ${C.accent}`, borderRadius: 14, padding: "12px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, color: C.accent, fontWeight: 500, cursor: "pointer", marginTop: 2, marginBottom: 20 }}>+ Add meal</button>
      </div>
      {activeMeal && <AddItemModal mealName={activeMeal.name} onClose={() => setAddItemMealId(null)} onAdd={handleConfirmItems} favourites={favourites} customItems={customItems}/>}
      {showAddMeal && <AddMealModal onClose={() => setShowAddMeal(false)} onAdd={handleAddMeal}/>}
      {showCalendar && <CalendarPicker value={activeDate} onChange={d => { setActiveDate(d); setShowCalendar(false); }} onClose={() => setShowCalendar(false)}/>}
    </div>
  );
}

// ── Home Tab ───────────────────────────────────────────
function HomeTab({ data, date, onNavigate, habitHistory, onToggleHabit, targetHistory }) {
  const dayData = data[date] || { meals: [], habits: {} };
  const meals = dayData.meals;
  const all = meals.flatMap(m => m.items);
  const kcal = sum(all,"kcal"), protein = sum(all,"protein"), carbs = sum(all,"carbs"), fat = sum(all,"fat");
  const activeTarget = getActiveTarget(targetHistory, date);
  const activeHabitSet = getActiveHabitSet(habitHistory, date);
  const habitList = activeHabitSet.habits || [];
  const dayHabits = dayData.habits || {};
  const completedHabits = habitList.filter(h => dayHabits[h]).length;
  // Streak: consecutive days (going back from yesterday) where primary target was met
  const streak = (() => {
    let count = 0;
    const sortedDays = Object.keys(data).sort().reverse();
    for (const d of sortedDays) {
      if (d >= date) continue;
      const tgt = getActiveTarget(targetHistory, d);
      if (!tgt) break;
      if (!isDayActive(tgt.activeDays || ALL_DAYS, d)) continue;
      const dAll = (data[d]?.meals || []).flatMap(m => m.items);
      if (dAll.length === 0) break; // no data = streak broken
      const pk = tgt.primary || "kcal";
      const pv = sum(dAll, pk);
      const phib = pk === "protein";
      const met = getStatus(pv, tgt[pk], phib) === "green";
      if (met) count++;
      else break;
    }
    return count;
  })();
  const loggedMeals = meals.filter(m => m.items.length > 0 && m.loggedAt).sort((a, b) => b.loggedAt - a.loggedAt);
  const lastMeal = loggedMeals[0];
  const unloggedMeals = meals.filter(m => m.items.length === 0).slice(0, 2);
  const kcalStatus = activeTarget ? getStatus(kcal, activeTarget.kcal, false) : "neutral";
  const weekDays = Object.keys(data).sort().slice(-7);
  const activeDaysCount = weekDays.filter(d => {
    const tgt = getActiveTarget(targetHistory, d);
    return isDayActive(tgt?.activeDays || ALL_DAYS, d);
  });
  const weekScore = activeDaysCount.length ? Math.round(activeDaysCount.reduce((acc, d) => {
    const wAll = data[d].meals.flatMap(m => m.items);
    const wHabits = data[d].habits || {};
    const tgt = getActiveTarget(targetHistory, d);
    const pk = tgt?.primary || "kcal";
    const pv = sum(wAll, pk);
    const phib = pk === "protein";
    const nutritionOk = tgt ? getStatus(pv, tgt[pk], phib) === "green" : false;
    const hs = habitList.length ? habitList.filter(h => wHabits[h]).length / habitList.length : 0;
    return acc + (nutritionOk ? 0.5 : 0) + hs * 0.5;
  }, 0) / activeDaysCount.length * 100) : 0;

  return (
    <div style={{ padding: "14px 14px 20px", overflowY: "auto", flex: 1 }}>
      {/* Ring + macro bars */}
      <div style={{ background: C.card, borderRadius: 20, padding: "18px 16px", marginBottom: 12, border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}>
          <Ring value={kcal} max={activeTarget?.kcal || 2000} size={108} stroke={10}
            color={(() => { if (!activeTarget) return statusColor(kcalStatus); const pk = activeTarget.primary || "kcal"; const pv = pk==="kcal"?kcal:pk==="protein"?protein:pk==="carbs"?carbs:fat; const phib = pk==="protein"; return statusColor(getStatus(pv, activeTarget[pk], phib)); })()}
            label={kcal} sublabel="kcal"/>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>Today's nutrition</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <MacroBar label="Protein" value={protein} target={activeTarget?.protein} higherIsBetter={true}/>
              <MacroBar label="Carbs" value={carbs} target={activeTarget?.carbs} higherIsBetter={false}/>
              <MacroBar label="Fat" value={fat} target={activeTarget?.fat} higherIsBetter={false}/>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["Protein",protein,"g",true],["Carbs",carbs,"g",false],["Fat",fat,"g",false],["Kcal",kcal,"",false]].map(([label,val,unit,hib]) => {
            const st = activeTarget ? getStatus(val, activeTarget[label.toLowerCase()], hib) : "neutral";
            return <div key={label} style={{ flex: 1, background: statusBg(st), borderRadius: 9, padding: "7px 5px", textAlign: "center" }}>
              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 700, color: statusColor(st), margin: 0 }}>{val}<span style={{ fontSize: 10, fontWeight: 400 }}>{unit}</span></p>
              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 9, color: C.muted, margin: "2px 0 0", textTransform: "uppercase" }}>{label}</p>
            </div>;
          })}
        </div>
      </div>
      {/* Encouraging message when 50%+ of primary target reached */}
      {activeTarget && (() => {
        const pk = activeTarget.primary || "kcal";
        const pv = pk==="kcal"?kcal:pk==="protein"?protein:pk==="carbs"?carbs:fat;
        const pct = pv / (activeTarget[pk] || 1);
        if (pct < 0.5 || pct >= 1.0) return null;
        const pctStr = Math.round(pct*100);
        const msgs = {
          protein: `💪 ${pctStr}% of protein goal — keep pushing!`,
          kcal: `🔥 ${pctStr}% of calorie goal — great progress!`,
          carbs: `⚡ ${pctStr}% of carbs — energy levels looking good!`,
          fat: `✅ ${pctStr}% of fat target — stay mindful!`,
        };
        return <div style={{ background: C.accentLight, borderRadius: 12, padding: "10px 14px", marginBottom: 12, border: `1px solid ${C.accent}33` }}>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.accent, fontWeight: 500, margin: 0 }}>{msgs[pk]}</p>
        </div>;
      })()}
      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, background: C.accent, borderRadius: 15, padding: "13px 14px" }}>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 9, color: "rgba(255,255,255,0.6)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Streak</p>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 24, fontWeight: 500, color: "#fff", margin: 0, lineHeight: 1 }}>{streak}<span style={{ fontSize: 13, opacity: 0.75 }}> d</span></p>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: "rgba(255,255,255,0.55)", margin: "3px 0 0" }}>target met</p>
        </div>
        <div style={{ flex: 1, background: C.card, borderRadius: 15, padding: "13px 14px", border: `1px solid ${C.border}` }}>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 9, color: C.muted, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Week score</p>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 24, fontWeight: 500, color: weekScore >= 80 ? C.green : weekScore >= 60 ? C.amber : C.red, margin: 0, lineHeight: 1 }}>{weekScore}<span style={{ fontSize: 13, color: C.muted }}>%</span></p>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, margin: "3px 0 0" }}>{weekScore >= 80 ? "🏆 On fire!" : weekScore >= 60 ? "💪 Good going" : "🎯 Keep pushing"}</p>
        </div>
        <div style={{ flex: 1, background: C.card, borderRadius: 15, padding: "10px 8px", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Ring value={completedHabits} max={habitList.length || 1} size={56} stroke={6}
            color={completedHabits === habitList.length && habitList.length > 0 ? C.green : C.accent}
            label={completedHabits} sublabel={`/${habitList.length}`}/>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 9, color: C.muted, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Habits</p>
        </div>
      </div>
      {/* Last meal */}
      {lastMeal && <div style={{ background: C.card, borderRadius: 15, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.border}` }}>
        <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Last logged</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: C.accentLight, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}><MealIconWrapper name={lastMeal.name}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 600, color: C.text }}>{lastMeal.name}</span>
              <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.accent }}>{formatTime(lastMeal.loggedAt)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 11, color: C.kcal, fontWeight: 600 }}>{sum(lastMeal.items,"kcal")} kcal</span>
              <span style={{ fontSize: 11, color: C.protein }}>P {sum(lastMeal.items,"protein")}g</span>
              <span style={{ fontSize: 11, color: C.carbs }}>C {sum(lastMeal.items,"carbs")}g</span>
            </div>
          </div>
        </div>
      </div>}
      {/* Quick log */}
      {unloggedMeals.length > 0 && <div style={{ background: C.card, borderRadius: 15, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.border}` }}>
        <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Quick log</p>
        {unloggedMeals.map(meal => (
          <button key={meal.id} onClick={() => onNavigate("log")} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, border: "none", borderRadius: 10, padding: "9px 12px", cursor: "pointer", width: "100%", marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, background: C.accentLight, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}><MealIconWrapper name={meal.name} size={16}/></div>
            <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 500, color: C.text, flex: 1, textAlign: "left" }}>{meal.name}</span>
            <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.accent, fontWeight: 600 }}>Log →</span>
          </button>
        ))}
      </div>}
      {/* Habits - compact 2-col grid */}
      <div style={{ background: C.card, borderRadius: 15, padding: "14px", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, color: C.text, margin: 0 }}>Today's habits</p>
          <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, fontWeight: 600, color: completedHabits === habitList.length ? C.green : C.accent }}>{completedHabits}/{habitList.length}</span>
        </div>
        <div style={{ height: 4, background: C.border, borderRadius: 4, marginBottom: 12 }}>
          <div style={{ height: "100%", width: `${habitList.length ? completedHabits / habitList.length * 100 : 0}%`, background: completedHabits === habitList.length ? C.green : C.accent, borderRadius: 4, transition: "width 0.4s" }}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {habitList.map(habit => {
            const done = !!dayHabits[habit];
            return (
              <button key={habit} onClick={() => onToggleHabit(date, habit)} style={{ display: "flex", alignItems: "center", gap: 7, background: done ? C.greenBg : C.bg, border: `1px solid ${done ? C.green : C.border}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer", transition: "all 0.15s", textAlign: "left" }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${done ? C.green : C.border}`, background: done ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: done ? C.green : C.text, fontWeight: done ? 500 : 400, textDecoration: done ? "line-through" : "none", lineHeight: 1.3 }}>{habit}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Progress Tab ───────────────────────────────────────
function ProgressTab({ data, targetHistory, habitHistory }) {
  const [mainTab, setMainTab] = useState("diet");
  const [dietView, setDietView] = useState("calendar");
  const [selectedDay, setSelectedDay] = useState(null);
  const days = Object.keys(data).sort();

  function getTargetForDay(d) { return getActiveTarget(targetHistory, d); }
  function getHabitsForDay(d) { return getActiveHabitSet(habitHistory, d).habits || []; }

  function CalendarGrid() {
    const cells = [];
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
          {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: C.muted, padding: "4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i}/>;
            const now2 = new Date();
            const dateStr = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const dayData = data[dateStr];
            const all = dayData ? dayData.meals.flatMap(m => m.items) : [];
            const tgt = getTargetForDay(dateStr);
            // Use primary macro for status colour (change 12)
            const primaryKey = tgt?.primary || "kcal";
            const primaryVal = sum(all, primaryKey);
            const primaryHib = primaryKey === "protein";
            const hasData = all.length > 0;
            const status = hasData && tgt ? getStatus(primaryVal, tgt[primaryKey], primaryHib) : null;
            const isSelected = selectedDay === dateStr, isToday = dateStr === TODAY;
            const barColor = status ? statusColor(status) : "transparent";
            return (
              <button key={i} onClick={() => setSelectedDay(isSelected ? null : dateStr)} style={{ aspectRatio: "1", borderRadius: 8, border: `${isToday ? "2px" : "1px"} solid ${isSelected ? C.accent : isToday ? C.accent : C.border}`, background: C.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2, overflow: "hidden", position: "relative" }}>
                <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, fontWeight: isToday ? 700 : 400, color: isSelected ? C.accent : C.text }}>{d}</span>
                <div style={{ width: "80%", height: 3, borderRadius: 2, background: status ? barColor : hasData ? C.border : "transparent" }}/>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function DayDetail({ dateStr }) {
    const dayData = data[dateStr];
    if (!dayData) return <div style={{ padding: "16px", background: C.card, borderRadius: 14, marginTop: 12, border: `1px solid ${C.border}` }}><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.muted, textAlign: "center" }}>No data for this day</p></div>;
    const all = dayData.meals.flatMap(m => m.items);
    const dayHabits = dayData.habits || {};
    const hList = getHabitsForDay(dateStr);
    const tgt = getTargetForDay(dateStr);
    return (
      <div style={{ background: C.card, borderRadius: 14, padding: "14px", marginTop: 12, border: `1px solid ${C.border}` }}>
        <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, color: C.text, margin: "0 0 12px" }}>{formatDate(dateStr)}</p>
        <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
          {Object.entries(MACRO_CONFIG).map(([k, cfg]) => {
            const val = sum(all, k), t2 = tgt?.[k];
            const st = t2 ? getStatus(val, t2, cfg.higherIsBetter) : "neutral";
            return <div key={k} style={{ flex: 1, background: statusBg(st), borderRadius: 9, padding: "7px 5px", textAlign: "center" }}>
              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, fontWeight: 700, color: statusColor(st), margin: 0 }}>{val}{cfg.unit}</p>
              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 9, color: C.muted, margin: "2px 0 0", textTransform: "uppercase" }}>{cfg.label}</p>
            </div>;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.muted }}>Habits</span>
          <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 600, color: C.accent }}>{hList.filter(h => dayHabits[h]).length}/{hList.length}</span>
        </div>
      </div>
    );
  }

  function BarChart({ period }) {
    const chartDays = period === "weekly" ? days.slice(-7) : days;
    if (chartDays.length === 0) return <div style={{ background: C.card, borderRadius: 14, padding: "28px", textAlign: "center", border: `1px solid ${C.border}` }}><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.muted }}>No data yet</p></div>;
    const maxKcal = Math.max(...chartDays.map(d => sum(data[d].meals.flatMap(m => m.items), "kcal")), 1);
    return (
      <div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>Calories vs Target</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, position: "relative" }}>
          {chartDays.map(d => {
            const kcal = sum(data[d].meals.flatMap(m => m.items), "kcal");
            const tgt = getTargetForDay(d);
            const st = tgt ? getStatus(kcal, tgt.kcal, false) : "neutral";
            return <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ width: "100%", background: statusColor(st), borderRadius: "3px 3px 1px 1px", height: kcal ? `${Math.max(4, (kcal / maxKcal) * 72)}px` : 3, opacity: kcal ? 1 : 0.2 }}/>
              <span style={{ fontSize: 8, color: C.muted, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif" }}>{period==="weekly" ? new Date(d+"T00:00:00").toLocaleDateString("en",{weekday:"short"}) : new Date(d+"T00:00:00").toLocaleDateString("en",{month:"short",day:"numeric"})}</span>
            </div>;
          })}
        </div>
      </div>
    );
  }

  function HabitsProgress() {
    const recentDays = days.slice(-7);
    const habitList = getHabitsForDay(TODAY);
    const todayHabits = data[TODAY]?.habits || {};
    const todayDone = habitList.filter(h => todayHabits[h]).length;
    const todayPct = habitList.length ? todayDone / habitList.length : 0;
    return (
      <div>
        {/* Today's completion — shown first */}
        <div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, color: C.text, margin: 0 }}>Today</p>
            <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 700, color: todayPct === 1 ? C.green : C.accent }}>{todayDone}/{habitList.length}</span>
          </div>
          <div style={{ height: 5, background: C.border, borderRadius: 4, marginBottom: 12 }}>
            <div style={{ height: "100%", width: `${todayPct * 100}%`, background: todayPct === 1 ? C.green : C.accent, borderRadius: 4, transition: "width 0.4s" }}/>
          </div>
          {habitList.length === 0
            ? <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.muted, textAlign: "center", padding: "8px 0" }}>No habits set</p>
            : habitList.map(habit => {
              const done = !!todayHabits[habit];
              return <div key={habit} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: done ? C.green : C.text, textDecoration: done ? "line-through" : "none" }}>{habit}</span>
                <span style={{ fontSize: 15, color: done ? C.green : C.border }}>{done ? "✓" : "○"}</span>
              </div>;
            })
          }
        </div>
        {/* 7-day per-habit completion */}
        {recentDays.length > 0 && <div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>Last 7 days</p>
          {habitList.map(habit => {
            const done = recentDays.filter(d => (data[d]?.habits || {})[habit]).length;
            const pct = recentDays.length ? done / recentDays.length : 0;
            return <div key={habit} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.text }}>{habit}</span>
                <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, fontWeight: 600, color: pct >= 0.8 ? C.green : pct >= 0.5 ? C.amber : C.red }}>{done}/{recentDays.length}</span>
              </div>
              <div style={{ height: 4, background: C.border, borderRadius: 4 }}>
                <div style={{ height: "100%", width: `${pct * 100}%`, background: pct >= 0.8 ? C.green : pct >= 0.5 ? C.amber : C.red, borderRadius: 4 }}/>
              </div>
            </div>;
          })}
        </div>}
        {/* Daily completion grid */}
        {recentDays.length > 0 && <div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}` }}>
          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>Daily completion</p>
          <div style={{ display: "flex", gap: 4 }}>
            {recentDays.map(d => {
              const hList = getHabitsForDay(d);
              const dh = data[d]?.habits || {};
              const pct = hList.length ? hList.filter(h => dh[h]).length / hList.length : 0;
              const hasData = hList.length > 0 && Object.keys(dh).length > 0;
              const color = pct >= 0.8 ? C.green : pct >= 0.5 ? C.amber : C.red;
              const isToday = d === TODAY;
              return <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: hasData ? color + "22" : C.bg, border: `1.5px solid ${isToday ? C.accent : hasData ? color : C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, fontWeight: 600, color: hasData ? color : C.muted }}>{hasData ? Math.round(pct * 100) + "%" : "—"}</span>
                </div>
                <span style={{ fontSize: 8, color: isToday ? C.accent : C.muted, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontWeight: isToday ? 700 : 400 }}>{new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short" })}</span>
              </div>;
            })}
          </div>
        </div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", margin: "0 14px 12px", background: C.border, borderRadius: 12, padding: 3, flexShrink: 0, overflow: "hidden" }}>
        {[["diet","Diet"],["habits","Habits"]].map(([id, label]) => (
          <button key={id} onClick={() => setMainTab(id)} style={{ flex: 1, padding: "8px", border: "none", borderRadius: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", background: mainTab === id ? C.card : "transparent", color: mainTab === id ? C.accent : C.muted, boxShadow: mainTab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s", minWidth: 0 }}>{label}</button>
        ))}
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px" }}>
        {mainTab === "diet" && <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, overflow: "hidden" }}>
            {[["calendar","Calendar"],["weekly","Weekly"],["monthly","Monthly"]].map(([id, label]) => (
              <button key={id} onClick={() => setDietView(id)} style={{ flex: 1, padding: "7px 4px", border: `1.5px solid ${dietView === id ? C.accent : C.border}`, borderRadius: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, fontWeight: dietView === id ? 600 : 400, cursor: "pointer", background: dietView === id ? C.accentLight : C.card, color: dietView === id ? C.accent : C.muted, minWidth: 0 }}>{label}</button>
            ))}
          </div>
          {dietView === "calendar" && <div><div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}`, marginBottom: 12 }}><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>{new Date().toLocaleDateString('en',{month:'long',year:'numeric'})}</p><CalendarGrid/></div>{selectedDay && <DayDetail dateStr={selectedDay}/>}</div>}
          {dietView === "weekly" && <BarChart period="weekly"/>}
          {dietView === "monthly" && <BarChart period="monthly"/>}
        </div>}
        {mainTab === "habits" && <HabitsProgress/>}
      </div>
    </div>
  );
}

// ── Hub Tab ────────────────────────────────────────────
function HubTab({ targetHistory, setTargetHistory, habitHistory, setHabitHistory, favourites, customItems, onDeleteFav, onDeleteCustom, onCreateCustom }) {
  const [section, setSection] = useState("targets");
  const [showCreate, setShowCreate] = useState(false);
  const [showDotMenu, setShowDotMenu] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(null);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [showHabitForm, setShowHabitForm] = useState(false);
  const [newHabit, setNewHabit] = useState("");

  // Nutrition target form state
  const currentTarget = targetHistory[targetHistory.length - 1] || {};
  const [primaryMacro, setPrimaryMacro] = useState(currentTarget.primary || "protein");
  const [primaryValue, setPrimaryValue] = useState(String(currentTarget[currentTarget.primary || "protein"] || ""));
  const [targetLabel, setTargetLabel] = useState("");
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate, setEndDate] = useState("");
  const [activeDays, setActiveDays] = useState([...ALL_DAYS]);
  const [calcPreview, setCalcPreview] = useState(null);

  // Habit set form state
  const currentHabitSet = habitHistory[habitHistory.length - 1] || { habits: DEFAULT_HABITS };
  const [editHabits, setEditHabits] = useState([...(currentHabitSet.habits || [])]);
  const [habitLabel, setHabitLabel] = useState("");
  const [habitStartDate, setHabitStartDate] = useState(TODAY);
  const [habitEndDate, setHabitEndDate] = useState("");
  const [habitActiveDays, setHabitActiveDays] = useState([...ALL_DAYS]);

  const importInputRef = useRef(null);

  function handleExport() {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: JSON.parse(localStorage.getItem("nt_data") || "{}"),
      favourites: JSON.parse(localStorage.getItem("nt_favourites") || "[]"),
      customItems: JSON.parse(localStorage.getItem("nt_customItems") || "[]"),
      targetHistory: JSON.parse(localStorage.getItem("nt_targetHistory") || "[]"),
      habitHistory: JSON.parse(localStorage.getItem("nt_habitHistory") || "[]"),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nutritrack-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("✓ Data exported");
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!imported.version || !imported.data) throw new Error("Invalid file");
        if (imported.data) { localStorage.setItem("nt_data", JSON.stringify(imported.data)); }
        if (imported.favourites) { localStorage.setItem("nt_favourites", JSON.stringify(imported.favourites)); }
        if (imported.customItems) { localStorage.setItem("nt_customItems", JSON.stringify(imported.customItems)); }
        if (imported.targetHistory) { localStorage.setItem("nt_targetHistory", JSON.stringify(imported.targetHistory)); }
        if (imported.habitHistory) { localStorage.setItem("nt_habitHistory", JSON.stringify(imported.habitHistory)); }
        showToast("✓ Data imported — reload to see changes");
        setTimeout(() => window.location.reload(), 2000);
      } catch { showToast("✗ Invalid backup file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleCalculate() {
    const calc = calcTargets(primaryMacro, primaryValue);
    setCalcPreview(calc);
  }

  const [savedToast, setSavedToast] = useState(null);
  function showToast(msg) { setSavedToast(msg); setTimeout(() => setSavedToast(null), 2500); }

  function handleSaveTarget() {
    if (!calcPreview && !primaryValue) return;
    const calc = calcPreview || calcTargets(primaryMacro, primaryValue);
    const newEntry = { id: uid(), label: targetLabel || `Target from ${startDate}`, startDate, endDate: endDate || null, activeDays: [...activeDays], primary: primaryMacro, ...calc };
    setTargetHistory(h => [...h, newEntry]);
    setCalcPreview(null);
    setTargetLabel("");
    setStartDate(TODAY);
    setEndDate("");
    setPrimaryValue("");
    setActiveDays([...ALL_DAYS]);
    setShowTargetForm(false);
    showToast("✓ Target saved");
  }

  function handleSaveHabitSet() {
    const newEntry = { id: uid(), label: habitLabel || `Habits from ${habitStartDate}`, startDate: habitStartDate, endDate: habitEndDate || null, habits: [...editHabits], activeDays: [...habitActiveDays] };
    setHabitHistory(h => [...h, newEntry]);
    setHabitLabel("");
    setHabitStartDate(TODAY);
    setHabitEndDate("");
    setHabitActiveDays([...ALL_DAYS]);
    setShowHabitForm(false);
    showToast("✓ Habit set saved");
  }

  const sections = [["targets","Targets"],["habits","Habits"],["custom","Custom Meals"],["favs","Favourites"]];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative", width: "100%" }}>
      {savedToast && (
        <div style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", background: C.green, color: "#fff", borderRadius: 20, padding: "9px 22px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 600, zIndex: 300, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", whiteSpace: "nowrap" }}>{savedToast}</div>
      )}
      {/* Section tabs + 3-dot menu */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 14px 12px", gap: 6, flexShrink: 0, background: C.bg, zIndex: 10, width: "100%" }}>
        <div style={{ display: "flex", gap: 5, overflowX: "auto", flex: 1, paddingBottom: 2, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {sections.map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} style={{ flexShrink: 0, padding: "6px 11px", border: `1.5px solid ${section === id ? C.accent : C.border}`, borderRadius: 20, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, fontWeight: section === id ? 600 : 400, cursor: "pointer", background: section === id ? C.accentLight : C.card, color: section === id ? C.accent : C.muted, whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>
        {/* 3-dot menu */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setShowDotMenu(v => !v)} style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.card, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>⋮</button>
          {showDotMenu && (
            <div style={{ position: "absolute", right: 0, top: 42, background: C.card, borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", border: `1px solid ${C.border}`, zIndex: 50, minWidth: 220, overflow: "hidden" }}>
              {[
                ["📊", "Nutrition target history", () => { setShowHistoryModal("nutrition"); setShowDotMenu(false); }],
                ["✅", "Habit set history", () => { setShowHistoryModal("habits"); setShowDotMenu(false); }],
                ["⬇️", "Export all data", () => { handleExport(); setShowDotMenu(false); }],
                ["⬆️", "Import data", () => { handleImportClick(); setShowDotMenu(false); }],
              ].map(([icon, label, fn], i, arr) => (
                <div key={label}>
                  <button onClick={fn} style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, color: C.text, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                    <span>{icon}</span> {label}
                  </button>
                  {i < arr.length - 1 && <div style={{ height: 1, background: C.border }}/>}
                </div>
              ))}
            </div>
          )}
          <input ref={importInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile}/>
        </div>
      </div>

      <div style={{ overflowY: "auto", overflowX: "hidden", flex: 1, padding: "0 14px", width: "100%", boxSizing: "border-box" }}>
        {/* ── Targets section ── */}
        {section === "targets" && (
          <div>
            {/* Active target preview */}
            {(() => {
              const active = getActiveTarget(targetHistory, TODAY);
              return active ? (
                <div style={{ background: C.accentLight, borderRadius: 14, padding: "13px 14px", marginBottom: 16, border: `1px solid ${C.accent}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <p style={{ fontSize: 14, color: C.accent, margin: 0, fontWeight: 600 }}>{active.label}</p>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: C.accent, background: C.card, borderRadius: 8, padding: "3px 8px", fontWeight: 600 }}>Active</span>
                      <button onClick={() => { if (targetHistory.length > 1) setTargetHistory(h => h.filter(x => x.id !== active.id)); else showToast("Cannot delete the only target"); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16, padding: "2px 4px" }}>×</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, margin: "0 0 8px" }}>{active.startDate} → {active.endDate || "ongoing"}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                    {Object.entries(MACRO_CONFIG).map(([k, cfg]) => (
                      <div key={k} style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: cfg.color, margin: 0 }}>{active[k]}{cfg.unit}</p>
                        <p style={{ fontSize: 9, color: C.muted, margin: "2px 0 0", textTransform: "uppercase" }}>{cfg.label}{active.primary === k ? " ★" : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div style={{ background: C.bg, borderRadius: 14, padding: "16px", marginBottom: 16, textAlign: "center", border: `1.5px dashed ${C.border}` }}><p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No active target</p></div>;
            })()}

            {/* Toggle form */}
            <button onClick={() => setShowTargetForm(v => !v)} style={{ width: "100%", background: showTargetForm ? C.bg : C.accent, color: showTargetForm ? C.accent : "#fff", border: `1.5px solid ${C.accent}`, borderRadius: 13, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {showTargetForm ? "↑ Cancel" : "+ Set new target"}
            </button>

            {showTargetForm && <div style={{ background: C.card, borderRadius: 16, padding: "16px", border: `1px solid ${C.border}`, marginBottom: 14 }}>
              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 16, color: C.text, margin: "0 0 4px" }}>Set new nutrition target</p>
              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.muted, margin: "0 0 14px" }}>Pick your primary goal — other values auto-calculate</p>

              <input value={targetLabel} onChange={e => setTargetLabel(e.target.value)} placeholder="Label (e.g. March bulk phase)"
                style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text, marginBottom: 12, boxSizing: "border-box" }}/>

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <DateField label="Start date" value={startDate} onChange={setStartDate}/>
                <DateField label="End date (optional)" value={endDate} onChange={setEndDate} minDate={startDate}/>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {Object.entries(MACRO_CONFIG).map(([k, cfg]) => (
                  <button key={k} onClick={() => { setPrimaryMacro(k); setPrimaryValue(""); setCalcPreview(null); }} style={{ flex: "1 0 40%", padding: "10px", border: `2px solid ${primaryMacro === k ? cfg.color : C.border}`, borderRadius: 12, background: primaryMacro === k ? cfg.color + "18" : C.bg, cursor: "pointer", textAlign: "left" }}>
                    <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: cfg.color, fontWeight: 600, margin: "0 0 2px", textTransform: "uppercase" }}>{cfg.label}</p>
                    <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 17, color: C.text, margin: 0 }}>{calcPreview ? calcPreview[k] : (getActiveTarget(targetHistory, TODAY)?.[k] || "—")}{cfg.unit}</p>
                  </button>
                ))}
              </div>

              <label style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.muted, display: "block", marginBottom: 8 }}>Target for <strong style={{ color: MACRO_CONFIG[primaryMacro].color }}>{MACRO_CONFIG[primaryMacro].label}</strong></label>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input type="number" value={primaryValue} onChange={e => { setPrimaryValue(e.target.value); setCalcPreview(null); }} placeholder="Enter value"
                  style={{ flex: 1, padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, fontWeight: 600, color: MACRO_CONFIG[primaryMacro].color, background: C.bg, outline: "none" }}/>
                <button onClick={handleCalculate} disabled={!primaryValue} style={{ background: C.bg, color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 11, padding: "11px 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: primaryValue ? 1 : 0.4 }}>Calculate</button>
              </div>

              <div style={{ marginBottom: 14 }}>
                <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.muted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Active days</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {DAY_LABELS.map((label, i) => {
                    const active = activeDays.includes(i);
                    return <button key={i} onClick={() => setActiveDays(ds => active && ds.length > 1 ? ds.filter(d => d !== i) : ds.includes(i) ? ds : [...ds, i].sort())} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1.5px solid ${active ? C.accent : C.border}`, background: active ? C.accentLight : C.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, fontWeight: active ? 600 : 400, color: active ? C.accent : C.muted, cursor: "pointer" }}>{label}</button>;
                  })}
                </div>
              </div>

              <button onClick={handleSaveTarget} disabled={!primaryValue} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "13px", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: primaryValue ? 1 : 0.4 }}>Save target</button>
            </div>}
          </div>
        )}

        {/* ── Habits section ── */}
        {/* ── Habits section ── */}
        {section === "habits" && (
          <div>
            {(() => {
              const active = getActiveHabitSet(habitHistory, TODAY);
              return active && active.habits.length > 0 ? (
                <div style={{ background: C.accentLight, borderRadius: 14, padding: "13px 14px", marginBottom: 16, border: `1px solid ${C.accent}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <p style={{ fontSize: 14, color: C.accent, margin: 0, fontWeight: 600 }}>{active.label}</p>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: C.accent, background: C.card, borderRadius: 8, padding: "3px 8px", fontWeight: 600 }}>Active</span>
                      <button onClick={() => { if (habitHistory.length > 1) setHabitHistory(h => h.filter(x => x.id !== active.id)); else showToast("Cannot delete the only habit set"); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16, padding: "2px 4px" }}>×</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, margin: "0 0 8px" }}>{active.startDate} → {active.endDate || "ongoing"} · {active.habits.length} habits</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {active.habits.slice(0, 6).map(h => <span key={h} style={{ fontSize: 11, background: C.card, borderRadius: 8, padding: "3px 8px", color: C.accent }}>{h}</span>)}
                    {active.habits.length > 6 && <span style={{ fontSize: 11, color: C.muted }}>+{active.habits.length - 6} more</span>}
                  </div>
                </div>
              ) : <div style={{ background: C.bg, borderRadius: 14, padding: "16px", marginBottom: 16, textAlign: "center", border: `1.5px dashed ${C.border}` }}><p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No active habit set</p></div>;
            })()}

            <button onClick={() => setShowHabitForm(v => !v)} style={{ width: "100%", background: showHabitForm ? C.bg : C.accent, color: showHabitForm ? C.accent : "#fff", border: `1.5px solid ${C.accent}`, borderRadius: 13, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {showHabitForm ? "↑ Cancel" : "+ Set new habit list"}
            </button>

            {showHabitForm && <div style={{ background: C.card, borderRadius: 16, padding: "16px", border: `1px solid ${C.border}` }}>
              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 16, color: C.text, margin: "0 0 4px" }}>Set new habit list</p>
              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.muted, margin: "0 0 14px" }}>Define habits with a date range</p>

              <input value={habitLabel} onChange={e => setHabitLabel(e.target.value)} placeholder="Label (e.g. March habits)"
                style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text, marginBottom: 12, boxSizing: "border-box" }}/>

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <DateField label="Start date" value={habitStartDate} onChange={setHabitStartDate}/>
                <DateField label="End date (optional)" value={habitEndDate} onChange={setHabitEndDate} minDate={habitStartDate}/>
              </div>

              <div style={{ marginBottom: 14 }}>
                <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.muted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Active days</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {DAY_LABELS.map((label, i) => {
                    const active = habitActiveDays.includes(i);
                    return <button key={i} onClick={() => setHabitActiveDays(ds => active && ds.length > 1 ? ds.filter(d => d !== i) : ds.includes(i) ? ds : [...ds, i].sort())} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1.5px solid ${active ? C.accent : C.border}`, background: active ? C.accentLight : C.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, fontWeight: active ? 600 : 400, color: active ? C.accent : C.muted, cursor: "pointer" }}>{label}</button>;
                  })}
                </div>
              </div>

              <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.muted, margin: "0 0 10px" }}>Drag ☰ to reorder · tap × to remove:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {editHabits.map((h, idx) => (
                  <div key={h}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData("text/plain", idx); }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const from = parseInt(e.dataTransfer.getData("text/plain"));
                      const to = idx;
                      if (from === to) return;
                      setEditHabits(hs => {
                        const arr = [...hs];
                        const [moved] = arr.splice(from, 1);
                        arr.splice(to, 0, moved);
                        return arr;
                      });
                    }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bg, borderRadius: 10, padding: "9px 13px", cursor: "grab", userSelect: "none" }}>
                    <span style={{ color: C.muted, fontSize: 16, marginRight: 8, cursor: "grab" }}>☰</span>
                    <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.text, flex: 1 }}>{h}</span>
                    <button onClick={() => setEditHabits(hs => hs.filter(x => x !== h))} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input value={newHabit} onChange={e => setNewHabit(e.target.value)} placeholder="Add a habit…"
                  onKeyDown={e => { if (e.key === "Enter" && newHabit.trim()) { setEditHabits(hs => [...hs, newHabit.trim()]); setNewHabit(""); }}}
                  style={{ flex: 1, padding: "10px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text }}/>
                <button onClick={() => { if (newHabit.trim()) { setEditHabits(hs => [...hs, newHabit.trim()]); setNewHabit(""); }}} disabled={!newHabit.trim()} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 11, padding: "10px 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: newHabit.trim() ? 1 : 0.4 }}>Add</button>
              </div>
              <button onClick={handleSaveHabitSet} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "13px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Save habit set</button>
            </div>}
          </div>
        )}

        {/* ── Custom Meals ── */}
        {section === "custom" && (
          <div>
            <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.muted, marginBottom: 12 }}>Items with exact macros from product labels. Available in every meal's Add Item sheet.</p>
            <button onClick={() => setShowCreate(true)} style={{ width: "100%", background: C.accentLight, color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 13, padding: "12px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ fontSize: 18 }}>+</span> New custom meal
            </button>
            {customItems.length === 0 && <div style={{ border: `2px dashed ${C.border}`, borderRadius: 14, padding: "28px 20px", textAlign: "center" }}><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, color: C.muted, margin: 0 }}>No custom meals yet</p></div>}
            {customItems.map(item => (
              <div key={item.id} style={{ background: C.card, borderRadius: 13, padding: "12px 14px", marginBottom: 10, border: `1.5px solid ${C.accentLight}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 600, color: C.text, margin: 0, flex: 1, paddingRight: 8 }}>{item.name}</p>
                  <button onClick={() => onDeleteCustom(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 15 }}>×</button>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontSize: 12, color: C.kcal, fontWeight: 600 }}>{item.kcal} kcal</span>
                  <span style={{ fontSize: 12, color: C.protein }}>P {item.protein}g</span>
                  <span style={{ fontSize: 12, color: C.carbs }}>C {item.carbs}g</span>
                  <span style={{ fontSize: 12, color: C.fat }}>F {item.fat}g</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Favourites ── */}
        {section === "favs" && (
          <div>
            <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 12, color: C.muted, marginBottom: 12 }}>Items you starred while using AI Search.</p>
            {favourites.length === 0 && <div style={{ border: `2px dashed ${C.border}`, borderRadius: 14, padding: "32px 20px", textAlign: "center" }}><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, color: C.muted, margin: 0 }}>No favourites yet</p></div>}
            {favourites.map(f => (
              <div key={f.id} style={{ background: C.card, borderRadius: 13, padding: "12px 14px", marginBottom: 10, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 500, color: C.text, margin: "0 0 5px" }}>{f.name}</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 11, color: C.kcal, fontWeight: 600 }}>{f.kcal} kcal</span>
                    <span style={{ fontSize: 11, color: C.protein }}>P {f.protein}g</span>
                    <span style={{ fontSize: 11, color: C.carbs }}>C {f.carbs}g</span>
                    <span style={{ fontSize: 11, color: C.fat }}>F {f.fat}g</span>
                  </div>
                </div>
                <button onClick={() => onDeleteFav(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16, padding: "4px" }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create custom meal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 110, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", padding: "22px 18px 32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 19, color: C.text }}>New custom meal</span>
              <button onClick={() => setShowCreate(false)} style={{ background: C.border, border: "none", borderRadius: 20, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.muted }}>×</button>
            </div>
            <CreateCustomForm onSave={item => { onCreateCustom(item); setShowCreate(false); }} onCancel={() => setShowCreate(false)}/>
          </div>
        </div>
      )}

      {/* History modals */}
      {showHistoryModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 120, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", padding: "22px 18px 32px", maxHeight: "80%", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 19, color: C.text }}>{showHistoryModal === "nutrition" ? "Nutrition target history" : "Habit set history"}</span>
              <button onClick={() => setShowHistoryModal(null)} style={{ background: C.border, border: "none", borderRadius: 20, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.muted }}>×</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {showHistoryModal === "nutrition" && (
                targetHistory.length === 0 ? <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.muted, textAlign: "center", padding: "32px 0" }}>No targets set yet</p> :
                [...targetHistory].reverse().map((t, i) => (
                  <div key={t.id} style={{ background: i === 0 ? C.accentLight : C.bg, borderRadius: 13, padding: "13px 14px", marginBottom: 10, border: `1px solid ${i === 0 ? C.accent + "33" : C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>{t.label}</span>
                      {i === 0 && <span style={{ fontSize: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", color: C.accent, background: C.card, borderRadius: 8, padding: "2px 8px", fontWeight: 600, marginRight: 8 }}>Active</span>}
                      {i !== 0 && <button onClick={() => setTargetHistory(h => h.filter(x => x.id !== t.id))} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16, padding: "2px 4px" }}>×</button>}
                    </div>
                    <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.muted, margin: "0 0 8px" }}>{t.startDate} → {t.endDate || "ongoing"} · {(t.activeDays || ALL_DAYS).map(d => DAY_LABELS[d]).join(" ")}</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      {Object.entries(MACRO_CONFIG).map(([k, cfg]) => (
                        <span key={k} style={{ fontSize: 12, color: cfg.color, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontWeight: t.primary === k ? 700 : 400 }}>{cfg.label}: {t[k]}{cfg.unit}{t.primary === k ? " ★" : ""}</span>
                      ))}
                    </div>
                  </div>
                ))
              )}
              {showHistoryModal === "habits" && (
                habitHistory.length === 0 ? <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 13, color: C.muted, textAlign: "center", padding: "32px 0" }}>No habit sets saved yet</p> :
                [...habitHistory].reverse().map((h, i) => (
                  <div key={h.id} style={{ background: i === 0 ? C.accentLight : C.bg, borderRadius: 13, padding: "13px 14px", marginBottom: 10, border: `1px solid ${i === 0 ? C.accent + "33" : C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>{h.label}</span>
                      {i === 0 && <span style={{ fontSize: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", color: C.accent, background: C.card, borderRadius: 8, padding: "2px 8px", fontWeight: 600, marginRight: 8 }}>Active</span>}
                      {i !== 0 && <button onClick={() => setHabitHistory(hs => hs.filter(x => x.id !== h.id))} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16, padding: "2px 4px" }}>×</button>}
                    </div>
                    <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.muted, margin: "0 0 8px" }}>{h.startDate} → {h.endDate || "ongoing"} · {h.habits.length} habits · {(h.activeDays || ALL_DAYS).map(d => DAY_LABELS[d]).join(" ")}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {h.habits.map(hb => <span key={hb} style={{ fontSize: 11, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", background: C.card, borderRadius: 7, padding: "2px 8px", color: C.text }}>{hb}</span>)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateCustomForm({ onSave, onCancel }) {
  const [name, setName] = useState("");
  const [macros, setMacros] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const fields = [{ key:"kcal", label:"Kcal", color:C.kcal },{ key:"protein", label:"Protein (g)", color:C.protein },{ key:"carbs", label:"Carbs (g)", color:C.carbs },{ key:"fat", label:"Fat (g)", color:C.fat }];
  const valid = name.trim() && Object.values(macros).every(v => v !== "" && !isNaN(Number(v)));
  return (
    <div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. MuscleBlaze Whey — 1 scoop with water"
        style={{ width: "100%", padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text, marginBottom: 14, boxSizing: "border-box" }}/>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, color: f.color, fontWeight: 600, display: "block", marginBottom: 5, textTransform: "uppercase" }}>{f.label}</label>
            <input type="number" value={macros[f.key]} onChange={e => setMacros(m => ({ ...m, [f.key]: e.target.value }))} placeholder="0"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 16, fontWeight: 600, color: f.color, background: C.bg, outline: "none", boxSizing: "border-box" }}/>
          </div>
        ))}
      </div>
      <button onClick={() => { if (valid) onSave({ id: uid(), name: name.trim(), kcal: +macros.kcal, protein: +macros.protein, carbs: +macros.carbs, fat: +macros.fat, isCustom: true }); }} disabled={!valid}
        style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: valid ? 1 : 0.4 }}>Save</button>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("home");
  const [data, setData] = useState(() => load("data", {}));
  const [activeDate, setActiveDate] = useState(TODAY);
  const [favourites, setFavourites] = useState(() => load("favourites", []));
  const [customItems, setCustomItems] = useState(() => load("customItems", [{ id: "c1", name: "MuscleBlaze Whey — 1 scoop with water", kcal: 120, protein: 25, carbs: 3, fat: 2, isCustom: true }]));
  const [targetHistory, setTargetHistory] = useState(() => load("targetHistory", INITIAL_TARGET_HISTORY));
  const [habitHistory, setHabitHistory] = useState(() => load("habitHistory", INITIAL_HABIT_HISTORY));

  useEffect(() => { save("data", data); }, [data]);
  useEffect(() => { save("favourites", favourites); }, [favourites]);
  useEffect(() => { save("customItems", customItems); }, [customItems]);
  useEffect(() => { save("targetHistory", targetHistory); }, [targetHistory]);
  useEffect(() => { save("habitHistory", habitHistory); }, [habitHistory]);

  function handleFavourite(item) { setFavourites(f => f.find(x => x.name === item.name) ? f : [...f, { ...item, id: uid() }]); }
  function handleToggleHabit(date, habit) {
    setData(d => {
      const nd = JSON.parse(JSON.stringify(d));
      if (!nd[date]) nd[date] = makeFreshDay();
      if (!nd[date].habits) nd[date].habits = {};
      nd[date].habits[habit] = !nd[date].habits[habit];
      return nd;
    });
  }

  const tabs = [
    { id: "home", label: "Home", icon: a => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 9.5L11 3l8 6.5V19a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke={a?C.accent:C.muted} strokeWidth="1.5" fill={a?C.accentLight:"none"}/><path d="M8 20v-7h6v7" stroke={a?C.accent:C.muted} strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id: "log", label: "Log", icon: a => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="4" width="16" height="15" rx="3" stroke={a?C.accent:C.muted} strokeWidth="1.5"/><path d="M7 2v4M15 2v4M3 9h16" stroke={a?C.accent:C.muted} strokeWidth="1.5" strokeLinecap="round"/><path d="M7 13h3M7 16h8M13 13l1 1 2-2" stroke={a?C.accent:C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: "progress", label: "Progress", icon: a => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 17l5-5 4 3 5-7 2 2" stroke={a?C.accent:C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 20h16" stroke={a?C.accent:C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: "hub", label: "Hub", icon: a => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="3" stroke={a?C.accent:C.muted} strokeWidth="1.5"/><path d="M11 3v2M11 17v2M3 11h2M17 11h2M5.6 5.6l1.4 1.4M15 15l1.4 1.4M5.6 16.4l1.4-1.4M15 7l1.4-1.4" stroke={a?C.accent:C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg> },
  ];

  return (
    <>
      <style>{FONT}</style>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, position: "relative", maxWidth: 480, margin: "0 auto", overflow: "hidden", width: "100%" }}>
          <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 16px) 18px 6px", flexShrink: 0, background: C.bg, zIndex: 1 }}>
            {tab === "home" && (() => { const h = new Date().getHours(); const g = h < 12 ? "Good morning 🌅" : h < 17 ? "Good afternoon ☀️" : "Good evening 🌙"; return <><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.muted, margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{new Date().toLocaleDateString("en",{weekday:"long",month:"short",day:"numeric"})}</p><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 24, color: C.text, margin: 0, fontWeight: 500 }}>{g}</p></>; })()}
            {tab === "log" && <><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: C.muted, margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{activeDate === TODAY ? "Today" : formatDate(activeDate)}</p><p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 24, color: C.text, margin: 0, fontWeight: 500 }}>Meal Log</p></>}
            {tab === "progress" && <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 24, color: C.text, margin: 0, fontWeight: 500 }}>Progress</p>}
            {tab === "hub" && <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 24, color: C.text, margin: 0, fontWeight: 500 }}>Hub</p>}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
            {tab === "home" && <HomeTab data={data} date={TODAY} onNavigate={setTab} habitHistory={habitHistory} onToggleHabit={handleToggleHabit} targetHistory={targetHistory}/>}
            {tab === "log" && <LogTab data={data} activeDate={activeDate} setActiveDate={setActiveDate} onDataChange={setData} favourites={favourites} customItems={customItems} onFavourite={handleFavourite} targetHistory={targetHistory}/>}
            {tab === "progress" && <ProgressTab data={data} targetHistory={targetHistory} habitHistory={habitHistory}/>}
            {tab === "hub" && <HubTab targetHistory={targetHistory} setTargetHistory={setTargetHistory} habitHistory={habitHistory} setHabitHistory={setHabitHistory} favourites={favourites} customItems={customItems} onDeleteFav={id => setFavourites(f => f.filter(x => x.id !== id))} onDeleteCustom={id => setCustomItems(c => c.filter(x => x.id !== id))} onCreateCustom={item => setCustomItems(c => [...c, item])}/>}
          </div>
          <div style={{ display: "flex", background: C.card, borderTop: `1px solid ${C.border}`, padding: "10px 0 env(safe-area-inset-bottom, 20px)", flexShrink: 0 }}>
            {tabs.map(t => { const active = tab === t.id; return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                {t.icon(active)}
                <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 10, fontWeight: active ? 600 : 400, color: active ? C.accent : C.muted }}>{t.label}</span>
                {active && <div style={{ width: 18, height: 2, background: C.accent, borderRadius: 2 }}/>}
              </button>
            ); })}
          </div>
      </div>
    </>
  );
}
