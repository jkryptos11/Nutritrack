import { useState, useEffect, useRef } from "react";
import { load, save } from './storage.js';
import BarcodeScanner from './BarcodeScanner.jsx';

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');`;

const C = {
  bg: "#F6F4EF", card: "#FFFFFF", text: "#1C1C1A", muted: "#9A9590",
  accent: "#5C6B3A", accentLight: "#EDF0E4",
  kcal: "#C0692A", protein: "#3D405B", carbs: "#6B9E7A", fat: "#B8922A",
  border: "#ECEAE4", danger: "#C0392B", dangerLight: "#FDECEA",
  green: "#2E7D52", amber: "#D97706", red: "#C0392B",
  greenBg: "#E8F5EE", amberBg: "#FEF3C7", redBg: "#FDECEA",
};

function sum(arr, key) { return arr.reduce((a, i) => a + (i[key] || 0), 0); }
function uid() { return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function formatTime(ts) { if (!ts) return null; return new Date(ts).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true }); }
function formatDate(d) { return new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }); }
function toDateStr(date) { return date.toISOString().split("T")[0]; }
function today() { return TODAY; }

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
  if (primary === "protein") return { protein: v, kcal: Math.round(v * 20), carbs: Math.round(v * 3.5), fat: Math.round(v * 0.8) };
  if (primary === "kcal") return { kcal: v, protein: Math.round(v * 0.25 / 4), carbs: Math.round(v * 0.45 / 4), fat: Math.round(v * 0.30 / 9) };
  if (primary === "carbs") return { carbs: v, kcal: Math.round(v * 4 / 0.45), protein: Math.round(v * 0.25 / 0.45), fat: Math.round(v * 0.30 / 0.45 / 4) };
  return { fat: v, kcal: Math.round(v * 9 / 0.30), protein: Math.round(v * 0.25 * 9 / 0.30 / 4), carbs: Math.round(v * 0.45 * 9 / 0.30 / 4) };
}

// Get active target for a given date from target history
function getActiveTarget(targetHistory, dateStr) {
  if (!targetHistory || targetHistory.length === 0) return null;
  const applicable = targetHistory
    .filter(t => t.startDate <= dateStr)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return applicable[0] || null;
}

function getActiveHabitSet(habitHistory, dateStr) {
  if (!habitHistory || habitHistory.length === 0) return { habits: [] };
  const applicable = habitHistory
    .filter(t => t.startDate <= dateStr)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return applicable[0] || { habits: [] };
}

const DEFAULT_HABITS = [
  "Ice water face bath", "Eltroxin with 20m break", "30 min exercise",
  "Prayer", "Post-lunch medication", "Seed cycling",
  "Pre-dinner medication", "Water 3L", "Reading 30m", "PM skincare"
];

const INITIAL_TARGET_HISTORY = [{
  id: uid(), startDate: "2026-03-01", endDate: null,
  kcal: 2000, protein: 120, carbs: 200, fat: 65, primary: "protein",
  includeWeekends: true, label: "March target"
}];

const INITIAL_HABIT_HISTORY = [{
  id: uid(), startDate: "2026-03-01", endDate: null,
  habits: DEFAULT_HABITS, includeWeekends: true, label: "Default habits"
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

function seedData() {
  const data = {};
  const todayD = new Date(); todayD.setHours(0,0,0,0);
  const past7 = Array.from({length:7},(_,i)=>{ const d=new Date(todayD); d.setDate(d.getDate()-(6-i)); return d.toISOString().split("T")[0]; });
  past7.forEach((d, i) => {
    const kcal = 1700 + Math.round(Math.random() * 600);
    const protein = 80 + Math.round(Math.random() * 60);
    data[d] = {
      meals: [
        { id: uid(), name: "Breakfast", loggedAt: new Date(d+"T08:00:00").getTime(), items: [{ id: uid(), name: "Breakfast", kcal: Math.round(kcal*0.25), protein: Math.round(protein*0.2), carbs: Math.round(kcal*0.25*0.45/4), fat: Math.round(kcal*0.25*0.3/9) }] },
        { id: uid(), name: "Lunch", loggedAt: new Date(d+"T13:00:00").getTime(), items: [{ id: uid(), name: "Lunch", kcal: Math.round(kcal*0.35), protein: Math.round(protein*0.35), carbs: Math.round(kcal*0.35*0.45/4), fat: Math.round(kcal*0.35*0.3/9) }] },
        { id: uid(), name: "Dinner", loggedAt: new Date(d+"T20:00:00").getTime(), items: [{ id: uid(), name: "Dinner", kcal: Math.round(kcal*0.30), protein: Math.round(protein*0.35), carbs: Math.round(kcal*0.30*0.45/4), fat: Math.round(kcal*0.30*0.3/9) }] },
        { id: uid(), name: "Snack 1", loggedAt: null, items: [] },
        { id: uid(), name: "Snack 2", loggedAt: null, items: [] },
        { id: uid(), name: "Snack 3", loggedAt: null, items: [] },
      ],
      habits: Object.fromEntries(DEFAULT_HABITS.map(h => [h, Math.random() > 0.3]))
    };
  });
  return data;
}

// ── Shared UI ──────────────────────────────────────────
function MealIconWrapper({ name, color = C.accent, size = 20 }) {
  const s = { stroke: color, strokeWidth: 1.5, fill: "none" };
  if (name === "Breakfast") return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="6" {...s}/><path d="M14 4v3M14 21v3M4 14h3M21 14h3" {...s} strokeLinecap="round"/></svg>;
  if (name === "Lunch") return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><path d="M5 20h18" {...s} strokeLinecap="round"/><path d="M8 20c0-5 2-9 6-9s6 4 6 9" {...s} strokeLinecap="round"/><path d="M17 20V8" stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none"/></svg>;
  if (name === "Dinner") return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><path d="M9 8v5a5 5 0 0010 0V8" {...s} strokeLinecap="round"/><path d="M14 18v4M10 22h8" {...s} strokeLinecap="round"/></svg>;
  if (name.startsWith("Snack")) return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><path d="M9 8c0-1.5 1.5-2.5 3-2 1.5.5 2 2 2 3" stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none"/><path d="M7 11h14l-1.5 9a2 2 0 01-2 1.5h-7a2 2 0 01-2-1.5L7 11z" {...s}/><path d="M5 11h18" {...s} strokeLinecap="round"/></svg>;
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, color }}>{initials}</span>;
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
        <span style={{ fontFamily: "'Lora',serif", fontSize: 20, fontWeight: 500, color: C.text, lineHeight: 1 }}>{label}</span>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, marginTop: 2 }}>{sublabel}</span>
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
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: sc }}>{value} <span style={{ color: C.muted, fontWeight: 400 }}>/ {target || "—"}</span></span>
      </div>
      <div style={{ height: 5, background: C.border, borderRadius: 4 }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: sc, borderRadius: 4, transition: "width 0.5s" }}/>
      </div>
    </div>
  );
}

function NutritionTable({ items, onDeleteItem }) {
  const cols = ["Kcal","Protein","Carbs","Fat"], colColors = [C.kcal,C.protein,C.carbs,C.fat], keys = ["kcal","protein","carbs","fat"], units = ["","g","g","g"];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans',sans-serif" }}>
      <thead><tr>
        <th style={{ textAlign: "left", fontSize: 10, color: C.muted, fontWeight: 500, padding: "4px 0 6px", width: "38%" }}>Item</th>
        {cols.map((col, i) => <th key={col} style={{ textAlign: "right", fontSize: 10, color: colColors[i], fontWeight: 600, padding: "4px 3px 6px" }}>{col}</th>)}
        <th style={{ width: 24 }}/>
      </tr></thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id} style={{ borderTop: `1px solid ${C.border}` }}>
            <td style={{ fontSize: 12, color: C.text, padding: "8px 6px 8px 0", lineHeight: 1.3 }}>{item.name}</td>
            {keys.map((k, i) => <td key={k} style={{ textAlign: "right", fontSize: 12, color: C.text, padding: "8px 3px", fontWeight: 500 }}>{item[k]}{units[i]}</td>)}
            <td style={{ textAlign: "right", padding: "8px 0" }}><button onClick={() => onDeleteItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 15 }}>×</button></td>
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
  const [viewYear, setViewYear] = useState(2026);
  const [viewMonth, setViewMonth] = useState(2); // 0-indexed, 2 = March
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
          <span style={{ fontFamily: "'Lora',serif", fontSize: 16, color: C.text }}>{monthNames[viewMonth]} {viewYear}</span>
          <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.muted, padding: "4px 8px" }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 6 }}>
          {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, padding: "3px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i}/>;
            const str = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const isSelected = str === value;
            const isDisabled = (minDate && str < minDate) || (maxDate && str > maxDate);
            return (
              <button key={i} onClick={() => selectDate(d)} disabled={isDisabled} style={{ aspectRatio: "1", borderRadius: 8, border: `1.5px solid ${isSelected ? C.accent : "transparent"}`, background: isSelected ? C.accentLight : "transparent", cursor: isDisabled ? "default" : "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: isSelected ? 700 : 400, color: isSelected ? C.accent : isDisabled ? C.border : C.text }}>
                {d}
              </button>
            );
          })}
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: 14, padding: "10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.muted, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function DateField({ label, value, onChange, minDate, maxDate }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ flex: 1 }}>
      <label style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      <button onClick={() => setOpen(true)} style={{ width: "100%", padding: "10px 12px", borderRadius: 11, border: `1.5px solid ${C.border}`, background: C.bg, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: value ? C.text : C.muted, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{value || "Pick date"}</span>
        <span style={{ fontSize: 14 }}>📅</span>
      </button>
      {open && <CalendarPicker value={value} onChange={onChange} onClose={() => setOpen(false)} minDate={minDate} maxDate={maxDate}/>}
    </div>
  );
}

// ── Barcode Scanner ────────────────────────────────────
function BarcodeModal({ onClose, onAdd }) {
  const [phase, setPhase] = useState("scanning");
  const [product] = useState({ name: "Yoga Bar Protein Bar (Choc Fudge)", kcal: 190, protein: 14, carbs: 22, fat: 6, servingSize: "60g" });
  const [servings, setServings] = useState("1");
  useEffect(() => { const t = setTimeout(() => setPhase("found"), 2500); return () => clearTimeout(t); }, []);
  const sv = parseFloat(servings) || 1;
  const scaled = { name: product.name, kcal: Math.round(product.kcal * sv), protein: Math.round(product.protein * sv), carbs: Math.round(product.carbs * sv), fat: Math.round(product.fat * sv) };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", padding: "20px 18px 32px", maxHeight: "88%", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: "'Lora',serif", fontSize: 18, color: C.text }}>Scan Barcode</span>
          <button onClick={onClose} style={{ background: C.border, border: "none", borderRadius: 20, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.muted }}>×</button>
        </div>
        {phase === "scanning" && (
          <div>
            <div style={{ background: "#111", borderRadius: 16, height: 200, position: "relative", overflow: "hidden", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <style>{`@keyframes scanline{0%{top:20%}100%{top:80%}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
              <div style={{ position: "absolute", left: "10%", right: "10%", height: 2, background: "rgba(92,107,58,0.9)", animation: "scanline 1.5s ease-in-out infinite alternate", boxShadow: "0 0 8px rgba(92,107,58,0.6)" }}/>
              {[[0,0],[0,1],[1,0],[1,1]].map(([r,c],i) => <div key={i} style={{ position:"absolute", top:r?"auto":"14%", bottom:r?"14%":"auto", left:c?"auto":"14%", right:c?"14%":"auto", width:24, height:24, borderTop:r?"none":`2px solid ${C.accent}`, borderBottom:r?`2px solid ${C.accent}`:"none", borderLeft:c?"none":`2px solid ${C.accent}`, borderRight:c?`2px solid ${C.accent}`:"none" }}/>)}
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0, marginTop: 60 }}>Point at barcode — auto-scanning…</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: C.accent, animation: "pulse 1s ease infinite" }}/>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.muted }}>Detecting barcode…</span>
            </div>
          </div>
        )}
        {phase === "found" && (
          <div>
            <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span>✓</span><span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.green, fontWeight: 500 }}>Product found!</span>
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 3px" }}>{product.name}</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted, margin: "0 0 10px" }}>Per serving ({product.servingSize})</p>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.kcal, fontWeight: 600 }}>{product.kcal} kcal</span>
                <span style={{ fontSize: 12, color: C.protein }}>P {product.protein}g</span>
                <span style={{ fontSize: 12, color: C.carbs }}>C {product.carbs}g</span>
                <span style={{ fontSize: 12, color: C.fat }}>F {product.fat}g</span>
              </div>
            </div>
            <label style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted, display: "block", marginBottom: 8 }}>Number of servings</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {["0.5","1","1.5","2"].map(s => <button key={s} onClick={() => setServings(s)} style={{ flex: 1, padding: "9px", border: `1.5px solid ${servings===s?C.accent:C.border}`, borderRadius: 10, background: servings===s?C.accentLight:C.bg, color: servings===s?C.accent:C.muted, fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: servings===s?600:400, cursor: "pointer" }}>{s}</button>)}
              <input type="number" value={servings} onChange={e => setServings(e.target.value)} placeholder="Own" style={{ flex: 1, padding: "9px", border: `1.5px solid ${C.border}`, borderRadius: 10, background: C.bg, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.text, outline: "none", textAlign: "center" }}/>
            </div>
            <div style={{ background: C.accentLight, borderRadius: 11, padding: "10px 14px", marginBottom: 14 }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.accent, margin: "0 0 5px", fontWeight: 600 }}>Total for {servings} serving{sv !== 1 ? "s" : ""}</p>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ fontSize: 13, color: C.kcal, fontWeight: 700 }}>{scaled.kcal} kcal</span>
                <span style={{ fontSize: 13, color: C.protein, fontWeight: 600 }}>P {scaled.protein}g</span>
                <span style={{ fontSize: 13, color: C.carbs }}>C {scaled.carbs}g</span>
                <span style={{ fontSize: 13, color: C.fat }}>F {scaled.fat}g</span>
              </div>
            </div>
            <button onClick={() => { onAdd([scaled], {}); onClose(); }} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "14px", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Add to meal</button>
          </div>
        )}
      </div>
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

  const allSaved = [...customItems.map(i => ({ ...i, _type: "custom" })), ...favourites.map(i => ({ ...i, _type: "fav" }))];
  if (showBarcode) return <BarcodeScanner onClose={() => setShowBarcode(false)} onAdd={(items) => { onAdd(items, {}); onClose(); }}/>;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: C.card, borderRadius: "24px 24px 0 0", width: "100%", padding: "20px 18px 32px", maxHeight: "88%", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontFamily: "'Lora',serif", fontSize: 18, color: C.text }}>Add to {mealName}</span>
          <button onClick={onClose} style={{ background: C.border, border: "none", borderRadius: 20, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.muted }}>×</button>
        </div>
        <div style={{ display: "flex", background: C.bg, borderRadius: 11, padding: 3, marginBottom: 16, flexShrink: 0 }}>
          {[["ai","AI Search"], ["saved",`Saved (${allSaved.length})`], ["barcode","📷 Scan"]].map(([id, label]) => (
            <button key={id} onClick={() => id === "barcode" ? setShowBarcode(true) : setActiveTab(id)} style={{ flex: 1, padding: "7px 4px", border: "none", borderRadius: 9, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer", background: activeTab === id && id !== "barcode" ? C.card : "transparent", color: activeTab === id && id !== "barcode" ? C.accent : C.muted, boxShadow: activeTab === id && id !== "barcode" ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>{label}</button>
          ))}
        </div>
        {activeTab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted, margin: "0 0 10px" }}>Describe any food naturally — AI estimates nutrition using Indian serving sizes</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexShrink: 0 }}>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && analyse()} placeholder="e.g. poha with coconut water"
                style={{ flex: 1, padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text }} autoFocus/>
              <button onClick={analyse} disabled={loading || !text.trim()} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 11, padding: "11px 14px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: (!text.trim() || loading) ? 0.5 : 1 }}>{loading ? "…" : "Search"}</button>
            </div>
            {error && <p style={{ color: C.danger, fontFamily: "'DM Sans',sans-serif", fontSize: 13, marginBottom: 10 }}>{error}</p>}
            {preview && <div style={{ overflowY: "auto", flex: 1 }}>
              {preview.map((item, i) => (
                <div key={i} style={{ background: C.bg, borderRadius: 11, padding: "11px 13px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, color: C.text, margin: "0 0 4px" }}>{item.name}</p>
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
              <button onClick={() => { onAdd(preview, starring); onClose(); }} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "14px", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>Add to {mealName}</button>
            </div>}
          </div>
        )}
        {activeTab === "saved" && (
          <div style={{ overflowY: "auto", flex: 1 }}>
            {allSaved.length === 0 && <div style={{ textAlign: "center", padding: "32px 20px" }}><p style={{ fontFamily: "'Lora',serif", fontSize: 15, color: C.muted }}>Nothing saved yet</p></div>}
            {customItems.length > 0 && <><p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, margin: "0 0 8px" }}>Custom Meals</p>
              {customItems.map(item => <SavedRow key={item.id} item={item} badge="custom" onAdd={() => { onAdd([item], {}); onClose(); }}/>)}</>}
            {favourites.length > 0 && <><p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, margin: `${customItems.length > 0 ? "14px" : "0"} 0 8px` }}>Favourites</p>
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
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, color: C.text, margin: 0 }}>{item.name}</p>
          <span style={{ fontSize: 9, background: badge === "custom" ? C.accentLight : "#FFF8E6", color: badge === "custom" ? C.accent : C.fat, borderRadius: 5, padding: "2px 6px", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, textTransform: "uppercase" }}>{badge === "custom" ? "custom" : "⭐"}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.kcal, fontWeight: 600 }}>{item.kcal} kcal</span>
          <span style={{ fontSize: 11, color: C.protein }}>P {item.protein}g</span>
          <span style={{ fontSize: 11, color: C.carbs }}>C {item.carbs}g</span>
          <span style={{ fontSize: 11, color: C.fat }}>F {item.fat}g</span>
        </div>
      </div>
      <button onClick={onAdd} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
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
          <span style={{ fontFamily: "'Lora',serif", fontSize: 19, color: C.text }}>Add a meal</span>
          <button onClick={onClose} style={{ background: C.border, border: "none", borderRadius: 20, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.muted }}>×</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {presets.map(p => <button key={p} onClick={() => setName(p)} style={{ background: name === p ? C.accentLight : C.bg, color: name === p ? C.accent : C.muted, border: `1.5px solid ${name === p ? C.accent : C.border}`, borderRadius: 20, padding: "6px 14px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, cursor: "pointer", fontWeight: name === p ? 600 : 400 }}>{p}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Or type a custom name…"
            onKeyDown={e => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); onClose(); }}}
            style={{ flex: 1, padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text }}/>
          <button onClick={() => { if (name.trim()) { onAdd(name.trim()); onClose(); }}} disabled={!name.trim()} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 11, padding: "11px 16px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: name.trim() ? 1 : 0.4 }}>Add</button>
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
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{meal.name}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              {meal.loggedAt && <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.accent, fontWeight: 500 }}>{formatTime(meal.loggedAt)}</span>}
              {meal.loggedAt && <span style={{ fontSize: 10, color: C.muted }}>·</span>}
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted }}>{meal.items.length === 0 ? "Empty" : `${meal.items.length} item${meal.items.length > 1 ? "s" : ""} · ${sum(meal.items, "kcal")} kcal`}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, padding: "4px 6px" }}>🗑</button>
          <span style={{ color: C.muted, fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
        </div>
      </div>
      {confirmDelete && <div style={{ background: C.dangerLight, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid #F5C6C2` }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.danger }}>Delete "{meal.name}"?</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setConfirmDelete(false)} style={{ background: "#fff", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", fontFamily: "'DM Sans',sans-serif", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onDeleteMeal(meal.id)} style={{ background: C.danger, color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontFamily: "'DM Sans',sans-serif", fontSize: 12, cursor: "pointer" }}>Delete</button>
        </div>
      </div>}
      {open && <div style={{ borderTop: `1px solid ${C.border}` }}>
        {meal.items.length > 0 && <div style={{ padding: "4px 14px 8px" }}><NutritionTable items={meal.items} onDeleteItem={onDeleteItem}/></div>}
        <div style={{ padding: "8px 14px 12px" }}>
          <button onClick={() => onAddItems(meal.id)} style={{ width: "100%", background: C.accentLight, color: C.accent, border: "none", borderRadius: 10, padding: "10px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
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
  const dayData = data[activeDate] || makeFreshDay();
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
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: active ? C.accent : C.muted, fontWeight: 500 }}>{new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short" })}</span>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: active ? C.accent : C.text }}>{new Date(d + "T00:00:00").getDate()}</span>
                {hasData && <div style={{ width: 4, height: 4, borderRadius: 2, background: active ? C.accent : C.muted }}/>}
              </button>
            );
          })}
        </div>
        {/* Calendar icon for any date */}
        <button onClick={() => setShowCalendar(true)} title="Jump to any date" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📅</button>
      </div>

      {/* Target vs actual banner */}
      {activeTarget && (
        <div style={{ margin: "0 14px 10px", background: C.card, borderRadius: 14, padding: "11px 14px", border: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>vs Target</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: statusColor(getStatus(sum(all,"kcal"), activeTarget.kcal, false)) }}>{sum(all,"kcal")} / {activeTarget.kcal} kcal</span>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {[["protein","Protein",true],["carbs","Carbs",false],["fat","Fat",false]].map(([k,label,hib]) => {
              const val = sum(all, k), tgt = activeTarget[k], st = getStatus(val, tgt, hib);
              return <div key={k} style={{ flex: 1, background: statusBg(st), borderRadius: 8, padding: "6px 7px", textAlign: "center" }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: statusColor(st), margin: 0 }}>{val}g</p>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.muted, margin: "1px 0 0", textTransform: "uppercase" }}>{label}/{tgt}g</p>
              </div>;
            })}
          </div>
        </div>
      )}

      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px" }}>
        {dayData.meals.map(meal => (
          <MealCard key={meal.id} meal={meal} onAddItems={setAddItemMealId} onDeleteItem={handleDeleteItem} onDeleteMeal={handleDeleteMeal}/>
        ))}
        <button onClick={() => setShowAddMeal(true)} style={{ width: "100%", background: "transparent", border: `1.5px dashed ${C.accent}`, borderRadius: 14, padding: "12px", fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: C.accent, fontWeight: 500, cursor: "pointer", marginTop: 2, marginBottom: 20 }}>+ Add meal</button>
      </div>
      {activeMeal && <AddItemModal mealName={activeMeal.name} onClose={() => setAddItemMealId(null)} onAdd={handleConfirmItems} favourites={favourites} customItems={customItems}/>}
      {showAddMeal && <AddMealModal onClose={() => setShowAddMeal(false)} onAdd={handleAddMeal}/>}
      {showCalendar && <CalendarPicker value={activeDate} onChange={d => { setActiveDate(d); setShowCalendar(false); }} onClose={() => setShowCalendar(false)}/>}
    </div>
  );
}

// ── Home Tab ───────────────────────────────────────────
function HomeTab({ data, date, onNavigate, habitHistory, onToggleHabit, targetHistory }) {
  const dayData = data[date] || makeFreshDay();
  const meals = dayData.meals;
  const all = meals.flatMap(m => m.items);
  const kcal = sum(all,"kcal"), protein = sum(all,"protein"), carbs = sum(all,"carbs"), fat = sum(all,"fat");
  const activeTarget = getActiveTarget(targetHistory, date);
  const activeHabitSet = getActiveHabitSet(habitHistory, date);
  const habitList = activeHabitSet.habits || [];
  const dayHabits = dayData.habits || {};
  const completedHabits = habitList.filter(h => dayHabits[h]).length;
  const streak = Object.keys(data).filter(d => data[d].meals.some(m => m.items.length > 0)).length;
  const loggedMeals = meals.filter(m => m.items.length > 0 && m.loggedAt).sort((a, b) => b.loggedAt - a.loggedAt);
  const lastMeal = loggedMeals[0];
  const unloggedMeals = meals.filter(m => m.items.length === 0).slice(0, 2);
  const kcalStatus = activeTarget ? getStatus(kcal, activeTarget.kcal, false) : "neutral";
  const weekDays = Object.keys(data).slice(-7);
  const weekScore = weekDays.length ? Math.round(weekDays.reduce((acc, d) => {
    const wAll = data[d].meals.flatMap(m => m.items);
    const wHabits = data[d].habits || {};
    const tgt = getActiveTarget(targetHistory, d);
    const nutritionOk = tgt ? getStatus(sum(wAll,"kcal"), tgt.kcal, false) === "green" : false;
    const hs = habitList.length ? habitList.filter(h => wHabits[h]).length / habitList.length : 0;
    return acc + (nutritionOk ? 0.5 : 0) + hs * 0.5;
  }, 0) / weekDays.length * 100) : 0;

  return (
    <div style={{ padding: "14px 14px 20px", overflowY: "auto", flex: 1 }}>
      {/* Ring + macro bars */}
      <div style={{ background: C.card, borderRadius: 20, padding: "18px 16px", marginBottom: 12, border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}>
          <Ring value={kcal} max={activeTarget?.kcal || 2000} size={108} stroke={10} color={statusColor(kcalStatus)} label={kcal} sublabel="kcal"/>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "'Lora',serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>Today's nutrition</p>
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
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: statusColor(st), margin: 0 }}>{val}<span style={{ fontSize: 10, fontWeight: 400 }}>{unit}</span></p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.muted, margin: "2px 0 0", textTransform: "uppercase" }}>{label}</p>
            </div>;
          })}
        </div>
      </div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, background: C.accent, borderRadius: 15, padding: "13px 14px" }}>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: "rgba(255,255,255,0.6)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Streak</p>
          <p style={{ fontFamily: "'Lora',serif", fontSize: 24, fontWeight: 500, color: "#fff", margin: 0, lineHeight: 1 }}>{streak}<span style={{ fontSize: 13, opacity: 0.75 }}> d</span></p>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "rgba(255,255,255,0.55)", margin: "3px 0 0" }}>days logged</p>
        </div>
        <div style={{ flex: 1, background: C.card, borderRadius: 15, padding: "13px 14px", border: `1px solid ${C.border}` }}>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.muted, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Week score</p>
          <p style={{ fontFamily: "'Lora',serif", fontSize: 24, fontWeight: 500, color: weekScore >= 80 ? C.green : weekScore >= 60 ? C.amber : C.red, margin: 0, lineHeight: 1 }}>{weekScore}<span style={{ fontSize: 13, color: C.muted }}>%</span></p>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, margin: "3px 0 0" }}>{weekScore >= 80 ? "🏆 On fire!" : weekScore >= 60 ? "💪 Good going" : "🎯 Keep pushing"}</p>
        </div>
        <div style={{ flex: 1, background: C.card, borderRadius: 15, padding: "13px 14px", border: `1px solid ${C.border}` }}>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.muted, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Habits</p>
          <p style={{ fontFamily: "'Lora',serif", fontSize: 24, fontWeight: 500, color: C.text, margin: 0, lineHeight: 1 }}>{completedHabits}<span style={{ fontSize: 13, color: C.muted }}>/{habitList.length}</span></p>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, margin: "3px 0 0" }}>done today</p>
        </div>
      </div>
      {/* Last meal */}
      {lastMeal && <div style={{ background: C.card, borderRadius: 15, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.border}` }}>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Last logged</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: C.accentLight, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}><MealIconWrapper name={lastMeal.name}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: C.text }}>{lastMeal.name}</span>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.accent }}>{formatTime(lastMeal.loggedAt)}</span>
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
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Quick log</p>
        {unloggedMeals.map(meal => (
          <button key={meal.id} onClick={() => onNavigate("log")} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, border: "none", borderRadius: 10, padding: "9px 12px", cursor: "pointer", width: "100%", marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, background: C.accentLight, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}><MealIconWrapper name={meal.name} size={16}/></div>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, color: C.text, flex: 1, textAlign: "left" }}>{meal.name}</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.accent, fontWeight: 600 }}>Log →</span>
          </button>
        ))}
      </div>}
      {/* Habits - compact 2-col grid */}
      <div style={{ background: C.card, borderRadius: 15, padding: "14px", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <p style={{ fontFamily: "'Lora',serif", fontSize: 15, color: C.text, margin: 0 }}>Today's habits</p>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: completedHabits === habitList.length ? C.green : C.accent }}>{completedHabits}/{habitList.length}</span>
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
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: done ? C.green : C.text, fontWeight: done ? 500 : 400, textDecoration: done ? "line-through" : "none", lineHeight: 1.3 }}>{habit}</span>
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
    const firstDay = new Date(2026, 2, 1).getDay();
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= 31; d++) cells.push(d);
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
          {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.muted, padding: "4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i}/>;
            const dateStr = `2026-03-${String(d).padStart(2, "0")}`;
            const dayData = data[dateStr];
            const all = dayData ? dayData.meals.flatMap(m => m.items) : [];
            const kcal = sum(all, "kcal");
            const tgt = getTargetForDay(dateStr);
            const status = kcal > 0 && tgt ? getStatus(kcal, tgt.kcal, false) : null;
            const isSelected = selectedDay === dateStr, isToday = dateStr === TODAY;
            return (
              <button key={i} onClick={() => setSelectedDay(isSelected ? null : dateStr)} style={{ aspectRatio: "1", borderRadius: 8, border: `${isToday ? "2px" : "1px"} solid ${isSelected ? C.accent : isToday ? C.accent : C.border}`, background: status ? statusBg(status) : C.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 1 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: isToday ? 700 : 400, color: isSelected ? C.accent : C.text }}>{d}</span>
                {status && <div style={{ width: 5, height: 5, borderRadius: 3, background: statusColor(status) }}/>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function DayDetail({ dateStr }) {
    const dayData = data[dateStr];
    if (!dayData) return <div style={{ padding: "16px", background: C.card, borderRadius: 14, marginTop: 12, border: `1px solid ${C.border}` }}><p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.muted, textAlign: "center" }}>No data for this day</p></div>;
    const all = dayData.meals.flatMap(m => m.items);
    const dayHabits = dayData.habits || {};
    const hList = getHabitsForDay(dateStr);
    const tgt = getTargetForDay(dateStr);
    return (
      <div style={{ background: C.card, borderRadius: 14, padding: "14px", marginTop: 12, border: `1px solid ${C.border}` }}>
        <p style={{ fontFamily: "'Lora',serif", fontSize: 15, color: C.text, margin: "0 0 12px" }}>{formatDate(dateStr)}</p>
        <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
          {Object.entries(MACRO_CONFIG).map(([k, cfg]) => {
            const val = sum(all, k), t2 = tgt?.[k];
            const st = t2 ? getStatus(val, t2, cfg.higherIsBetter) : "neutral";
            return <div key={k} style={{ flex: 1, background: statusBg(st), borderRadius: 9, padding: "7px 5px", textAlign: "center" }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: statusColor(st), margin: 0 }}>{val}{cfg.unit}</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.muted, margin: "2px 0 0", textTransform: "uppercase" }}>{cfg.label}</p>
            </div>;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted }}>Habits</span>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: C.accent }}>{hList.filter(h => dayHabits[h]).length}/{hList.length}</span>
        </div>
      </div>
    );
  }

  function BarChart({ period }) {
    const chartDays = period === "weekly" ? days.slice(-7) : days;
    const maxKcal = Math.max(...chartDays.map(d => sum(data[d].meals.flatMap(m => m.items), "kcal")), 1);
    return (
      <div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <p style={{ fontFamily: "'Lora',serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>Calories vs Target</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, position: "relative" }}>
          {chartDays.map(d => {
            const kcal = sum(data[d].meals.flatMap(m => m.items), "kcal");
            const tgt = getTargetForDay(d);
            const st = tgt ? getStatus(kcal, tgt.kcal, false) : "neutral";
            return <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ width: "100%", background: statusColor(st), borderRadius: "3px 3px 1px 1px", height: kcal ? `${Math.max(4, (kcal / maxKcal) * 72)}px` : 3, opacity: kcal ? 1 : 0.2 }}/>
              <span style={{ fontSize: 8, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>{new Date(d+"T00:00:00").toLocaleDateString("en",{weekday:"short"})}</span>
            </div>;
          })}
        </div>
      </div>
    );
  }

  function HabitsProgress() {
    const recentDays = days.slice(-7);
    const habitList = getHabitsForDay(TODAY);
    return (
      <div>
        <div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <p style={{ fontFamily: "'Lora',serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>7-day habit completion</p>
          {habitList.map(habit => {
            const done = recentDays.filter(d => (data[d]?.habits || {})[habit]).length;
            const pct = done / recentDays.length;
            return <div key={habit} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.text }}>{habit}</span>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: pct >= 0.8 ? C.green : pct >= 0.5 ? C.amber : C.red }}>{done}/7</span>
              </div>
              <div style={{ height: 4, background: C.border, borderRadius: 4 }}>
                <div style={{ height: "100%", width: `${pct * 100}%`, background: pct >= 0.8 ? C.green : pct >= 0.5 ? C.amber : C.red, borderRadius: 4 }}/>
              </div>
            </div>;
          })}
        </div>
        <div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}` }}>
          <p style={{ fontFamily: "'Lora',serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>Daily completion</p>
          <div style={{ display: "flex", gap: 4 }}>
            {recentDays.map(d => {
              const hList = getHabitsForDay(d);
              const dayHabits = data[d]?.habits || {};
              const pct = hList.length ? hList.filter(h => dayHabits[h]).length / hList.length : 0;
              const color = pct >= 0.8 ? C.green : pct >= 0.5 ? C.amber : C.red;
              return <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: pct > 0 ? color + "22" : C.border, border: `1px solid ${pct > 0 ? color : C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, color: pct > 0 ? color : C.muted }}>{Math.round(pct * 100)}%</span>
                </div>
                <span style={{ fontSize: 8, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>{new Date(d+"T00:00:00").toLocaleDateString("en",{weekday:"short"})}</span>
              </div>;
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ display: "flex", margin: "0 14px 12px", background: C.border, borderRadius: 12, padding: 3, flexShrink: 0, overflow: "hidden" }}>
        {[["diet","Diet"],["habits","Habits"]].map(([id, label]) => (
          <button key={id} onClick={() => setMainTab(id)} style={{ flex: 1, padding: "8px", border: "none", borderRadius: 10, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", background: mainTab === id ? C.card : "transparent", color: mainTab === id ? C.accent : C.muted, boxShadow: mainTab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s", minWidth: 0 }}>{label}</button>
        ))}
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px" }}>
        {mainTab === "diet" && <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, overflow: "hidden" }}>
            {[["calendar","Calendar"],["weekly","Weekly"],["monthly","Monthly"]].map(([id, label]) => (
              <button key={id} onClick={() => setDietView(id)} style={{ flex: 1, padding: "7px 4px", border: `1.5px solid ${dietView === id ? C.accent : C.border}`, borderRadius: 10, fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: dietView === id ? 600 : 400, cursor: "pointer", background: dietView === id ? C.accentLight : C.card, color: dietView === id ? C.accent : C.muted, minWidth: 0 }}>{label}</button>
            ))}
          </div>
          {dietView === "calendar" && <div><div style={{ background: C.card, borderRadius: 14, padding: "14px", border: `1px solid ${C.border}`, marginBottom: 12 }}><p style={{ fontFamily: "'Lora',serif", fontSize: 14, color: C.text, margin: "0 0 12px" }}>March 2026</p><CalendarGrid/></div>{selectedDay && <DayDetail dateStr={selectedDay}/>}</div>}
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
  const [showHistoryModal, setShowHistoryModal] = useState(null); // "nutrition" | "habits"
  const [newHabit, setNewHabit] = useState("");

  // Nutrition target form state
  const currentTarget = targetHistory[targetHistory.length - 1] || {};
  const [primaryMacro, setPrimaryMacro] = useState(currentTarget.primary || "protein");
  const [primaryValue, setPrimaryValue] = useState(String(currentTarget[currentTarget.primary || "protein"] || ""));
  const [targetLabel, setTargetLabel] = useState("");
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate, setEndDate] = useState("");
  const [includeWeekends, setIncludeWeekends] = useState(true);
  const [calcPreview, setCalcPreview] = useState(null);

  // Habit set form state
  const currentHabitSet = habitHistory[habitHistory.length - 1] || { habits: DEFAULT_HABITS };
  const [editHabits, setEditHabits] = useState([...(currentHabitSet.habits || [])]);
  const [habitLabel, setHabitLabel] = useState("");
  const [habitStartDate, setHabitStartDate] = useState(TODAY);
  const [habitEndDate, setHabitEndDate] = useState("");
  const [habitIncludeWeekends, setHabitIncludeWeekends] = useState(true);

  function handleCalculate() {
    const calc = calcTargets(primaryMacro, primaryValue);
    setCalcPreview(calc);
  }

  function handleSaveTarget() {
    if (!calcPreview && !primaryValue) return;
    const calc = calcPreview || calcTargets(primaryMacro, primaryValue);
    const newEntry = { id: uid(), label: targetLabel || `Target from ${startDate}`, startDate, endDate: endDate || null, includeWeekends, primary: primaryMacro, ...calc };
    setTargetHistory(h => [...h, newEntry]);
    setCalcPreview(null);
    setTargetLabel("");
  }

  function handleSaveHabitSet() {
    const newEntry = { id: uid(), label: habitLabel || `Habits from ${habitStartDate}`, startDate: habitStartDate, endDate: habitEndDate || null, habits: [...editHabits], includeWeekends: habitIncludeWeekends };
    setHabitHistory(h => [...h, newEntry]);
    setHabitLabel("");
  }

  const sections = [["targets","Targets"],["habits","Habits"],["custom","Custom Meals"],["favs","Favourites"]];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* Section tabs + 3-dot menu */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 14px 12px", gap: 6, flexShrink: 0, background: C.bg, zIndex: 10 }}>
        <div style={{ display: "flex", gap: 5, overflowX: "auto", flex: 1, paddingBottom: 2, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          {sections.map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} style={{ flexShrink: 0, padding: "6px 11px", border: `1.5px solid ${section === id ? C.accent : C.border}`, borderRadius: 20, fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: section === id ? 600 : 400, cursor: "pointer", background: section === id ? C.accentLight : C.card, color: section === id ? C.accent : C.muted, whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>
        {/* 3-dot menu */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setShowDotMenu(v => !v)} style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.card, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>⋮</button>
          {showDotMenu && (
            <div style={{ position: "absolute", right: 0, top: 42, background: C.card, borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", border: `1px solid ${C.border}`, zIndex: 50, minWidth: 210, overflow: "hidden" }}>
              <button onClick={() => { setShowHistoryModal("nutrition"); setShowDotMenu(false); }} style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: C.text, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <span>📊</span> Nutrition target history
              </button>
              <div style={{ height: 1, background: C.border }}/>
              <button onClick={() => { setShowHistoryModal("habits"); setShowDotMenu(false); }} style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: C.text, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <span>✅</span> Habit set history
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px" }}>
        {/* ── Targets section ── */}
        {section === "targets" && (
          <div>
            {/* Active target preview */}
            {targetHistory.length > 0 && (() => {
              const active = getActiveTarget(targetHistory, TODAY);
              return active ? (
                <div style={{ background: C.accentLight, borderRadius: 14, padding: "13px 14px", marginBottom: 16, border: `1px solid ${C.accent}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <p style={{ fontFamily: "'Lora',serif", fontSize: 14, color: C.accent, margin: 0 }}>{active.label}</p>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.accent, background: C.card, borderRadius: 8, padding: "3px 8px", fontWeight: 600 }}>Active</span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted, margin: "0 0 8px" }}>{active.startDate} → {active.endDate || "ongoing"}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    {Object.entries(MACRO_CONFIG).map(([k, cfg]) => (
                      <div key={k} style={{ flex: 1, textAlign: "center" }}>
                        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: cfg.color, margin: 0 }}>{active[k]}{cfg.unit}</p>
                        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.muted, margin: "2px 0 0", textTransform: "uppercase" }}>{cfg.label}{active.primary === k ? " ★" : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            <div style={{ background: C.card, borderRadius: 16, padding: "16px", border: `1px solid ${C.border}`, marginBottom: 14 }}>
              <p style={{ fontFamily: "'Lora',serif", fontSize: 16, color: C.text, margin: "0 0 4px" }}>Set new nutrition target</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted, margin: "0 0 14px" }}>Pick your primary goal — other values auto-calculate</p>

              <input value={targetLabel} onChange={e => setTargetLabel(e.target.value)} placeholder="Label (e.g. March bulk phase)"
                style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text, marginBottom: 12, boxSizing: "border-box" }}/>

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <DateField label="Start date" value={startDate} onChange={setStartDate}/>
                <DateField label="End date (optional)" value={endDate} onChange={setEndDate} minDate={startDate}/>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {Object.entries(MACRO_CONFIG).map(([k, cfg]) => (
                  <button key={k} onClick={() => { setPrimaryMacro(k); setPrimaryValue(""); setCalcPreview(null); }} style={{ flex: "1 0 40%", padding: "10px", border: `2px solid ${primaryMacro === k ? cfg.color : C.border}`, borderRadius: 12, background: primaryMacro === k ? cfg.color + "18" : C.bg, cursor: "pointer", textAlign: "left" }}>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: cfg.color, fontWeight: 600, margin: "0 0 2px", textTransform: "uppercase" }}>{cfg.label}</p>
                    <p style={{ fontFamily: "'Lora',serif", fontSize: 17, color: C.text, margin: 0 }}>{calcPreview ? calcPreview[k] : (getActiveTarget(targetHistory, TODAY)?.[k] || "—")}{cfg.unit}</p>
                  </button>
                ))}
              </div>

              <label style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted, display: "block", marginBottom: 8 }}>Target for <strong style={{ color: MACRO_CONFIG[primaryMacro].color }}>{MACRO_CONFIG[primaryMacro].label}</strong></label>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input type="number" value={primaryValue} onChange={e => { setPrimaryValue(e.target.value); setCalcPreview(null); }} placeholder="Enter value"
                  style={{ flex: 1, padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: MACRO_CONFIG[primaryMacro].color, background: C.bg, outline: "none" }}/>
                <button onClick={handleCalculate} disabled={!primaryValue} style={{ background: C.bg, color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 11, padding: "11px 14px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: primaryValue ? 1 : 0.4 }}>Calculate</button>
              </div>

              <button onClick={() => setIncludeWeekends(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 11, padding: "10px 13px", cursor: "pointer", width: "100%", marginBottom: 14 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${includeWeekends ? C.accent : C.border}`, background: includeWeekends ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {includeWeekends && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                </div>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.text }}>Include Saturday & Sunday</span>
              </button>

              <button onClick={handleSaveTarget} disabled={!primaryValue} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "13px", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: primaryValue ? 1 : 0.4 }}>Save target</button>
            </div>
          </div>
        )}

        {/* ── Habits section ── */}
        {section === "habits" && (
          <div>
            {habitHistory.length > 0 && (() => {
              const active = getActiveHabitSet(habitHistory, TODAY);
              return active ? (
                <div style={{ background: C.accentLight, borderRadius: 14, padding: "13px 14px", marginBottom: 16, border: `1px solid ${C.accent}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <p style={{ fontFamily: "'Lora',serif", fontSize: 14, color: C.accent, margin: 0 }}>{active.label}</p>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.accent, background: C.card, borderRadius: 8, padding: "3px 8px", fontWeight: 600 }}>Active</span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted, margin: "0 0 8px" }}>{active.startDate} → {active.endDate || "ongoing"} · {active.habits.length} habits</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {active.habits.slice(0, 6).map(h => <span key={h} style={{ fontSize: 11, fontFamily: "'DM Sans',sans-serif", background: C.card, borderRadius: 8, padding: "3px 8px", color: C.accent }}>{h}</span>)}
                    {active.habits.length > 6 && <span style={{ fontSize: 11, fontFamily: "'DM Sans',sans-serif", color: C.muted }}>+{active.habits.length - 6} more</span>}
                  </div>
                </div>
              ) : null;
            })()}

            <div style={{ background: C.card, borderRadius: 16, padding: "16px", border: `1px solid ${C.border}` }}>
              <p style={{ fontFamily: "'Lora',serif", fontSize: 16, color: C.text, margin: "0 0 4px" }}>Set new habit list</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted, margin: "0 0 14px" }}>Define habits with a date range</p>

              <input value={habitLabel} onChange={e => setHabitLabel(e.target.value)} placeholder="Label (e.g. March habits)"
                style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text, marginBottom: 12, boxSizing: "border-box" }}/>

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <DateField label="Start date" value={habitStartDate} onChange={setHabitStartDate}/>
                <DateField label="End date (optional)" value={habitEndDate} onChange={setHabitEndDate} minDate={habitStartDate}/>
              </div>

              <button onClick={() => setHabitIncludeWeekends(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 11, padding: "10px 13px", cursor: "pointer", width: "100%", marginBottom: 14 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${habitIncludeWeekends ? C.accent : C.border}`, background: habitIncludeWeekends ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {habitIncludeWeekends && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                </div>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.text }}>Include Saturday & Sunday</span>
              </button>

              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted, margin: "0 0 10px" }}>Drag ☰ to reorder · tap × to remove:</p>
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
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.text, flex: 1 }}>{h}</span>
                    <button onClick={() => setEditHabits(hs => hs.filter(x => x !== h))} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input value={newHabit} onChange={e => setNewHabit(e.target.value)} placeholder="Add a habit…"
                  onKeyDown={e => { if (e.key === "Enter" && newHabit.trim()) { setEditHabits(hs => [...hs, newHabit.trim()]); setNewHabit(""); }}}
                  style={{ flex: 1, padding: "10px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text }}/>
                <button onClick={() => { if (newHabit.trim()) { setEditHabits(hs => [...hs, newHabit.trim()]); setNewHabit(""); }}} disabled={!newHabit.trim()} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 11, padding: "10px 14px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: newHabit.trim() ? 1 : 0.4 }}>Add</button>
              </div>
              <button onClick={handleSaveHabitSet} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "13px", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Save habit set</button>
            </div>
          </div>
        )}

        {/* ── Custom Meals ── */}
        {section === "custom" && (
          <div>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted, marginBottom: 12 }}>Items with exact macros from product labels. Available in every meal's Add Item sheet.</p>
            <button onClick={() => setShowCreate(true)} style={{ width: "100%", background: C.accentLight, color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 13, padding: "12px", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ fontSize: 18 }}>+</span> New custom meal
            </button>
            {customItems.length === 0 && <div style={{ border: `2px dashed ${C.border}`, borderRadius: 14, padding: "28px 20px", textAlign: "center" }}><p style={{ fontFamily: "'Lora',serif", fontSize: 15, color: C.muted, margin: 0 }}>No custom meals yet</p></div>}
            {customItems.map(item => (
              <div key={item.id} style={{ background: C.card, borderRadius: 13, padding: "12px 14px", marginBottom: 10, border: `1.5px solid ${C.accentLight}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: C.text, margin: 0, flex: 1, paddingRight: 8 }}>{item.name}</p>
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
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.muted, marginBottom: 12 }}>Items you starred while using AI Search.</p>
            {favourites.length === 0 && <div style={{ border: `2px dashed ${C.border}`, borderRadius: 14, padding: "32px 20px", textAlign: "center" }}><p style={{ fontFamily: "'Lora',serif", fontSize: 15, color: C.muted, margin: 0 }}>No favourites yet</p></div>}
            {favourites.map(f => (
              <div key={f.id} style={{ background: C.card, borderRadius: 13, padding: "12px 14px", marginBottom: 10, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, color: C.text, margin: "0 0 5px" }}>{f.name}</p>
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
              <span style={{ fontFamily: "'Lora',serif", fontSize: 19, color: C.text }}>New custom meal</span>
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
              <span style={{ fontFamily: "'Lora',serif", fontSize: 19, color: C.text }}>{showHistoryModal === "nutrition" ? "Nutrition target history" : "Habit set history"}</span>
              <button onClick={() => setShowHistoryModal(null)} style={{ background: C.border, border: "none", borderRadius: 20, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.muted }}>×</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {showHistoryModal === "nutrition" && (
                targetHistory.length === 0 ? <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.muted, textAlign: "center", padding: "32px 0" }}>No targets set yet</p> :
                [...targetHistory].reverse().map((t, i) => (
                  <div key={t.id} style={{ background: i === 0 ? C.accentLight : C.bg, borderRadius: 13, padding: "13px 14px", marginBottom: 10, border: `1px solid ${i === 0 ? C.accent + "33" : C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: C.text }}>{t.label}</span>
                      {i === 0 && <span style={{ fontSize: 10, fontFamily: "'DM Sans',sans-serif", color: C.accent, background: C.card, borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>Active</span>}
                    </div>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted, margin: "0 0 8px" }}>{t.startDate} → {t.endDate || "ongoing"} · {t.includeWeekends ? "incl. weekends" : "weekdays only"}</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      {Object.entries(MACRO_CONFIG).map(([k, cfg]) => (
                        <span key={k} style={{ fontSize: 12, color: cfg.color, fontFamily: "'DM Sans',sans-serif", fontWeight: t.primary === k ? 700 : 400 }}>{cfg.label}: {t[k]}{cfg.unit}{t.primary === k ? " ★" : ""}</span>
                      ))}
                    </div>
                  </div>
                ))
              )}
              {showHistoryModal === "habits" && (
                habitHistory.length === 0 ? <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.muted, textAlign: "center", padding: "32px 0" }}>No habit sets saved yet</p> :
                [...habitHistory].reverse().map((h, i) => (
                  <div key={h.id} style={{ background: i === 0 ? C.accentLight : C.bg, borderRadius: 13, padding: "13px 14px", marginBottom: 10, border: `1px solid ${i === 0 ? C.accent + "33" : C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: C.text }}>{h.label}</span>
                      {i === 0 && <span style={{ fontSize: 10, fontFamily: "'DM Sans',sans-serif", color: C.accent, background: C.card, borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>Active</span>}
                    </div>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted, margin: "0 0 8px" }}>{h.startDate} → {h.endDate || "ongoing"} · {h.habits.length} habits · {h.includeWeekends ? "incl. weekends" : "weekdays only"}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {h.habits.map(hb => <span key={hb} style={{ fontSize: 11, fontFamily: "'DM Sans',sans-serif", background: C.card, borderRadius: 7, padding: "2px 8px", color: C.text }}>{hb}</span>)}
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

function CreateCustomForm({ onSave }) {
  const [name, setName] = useState("");
  const [macros, setMacros] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const fields = [{ key:"kcal", label:"Kcal", color:C.kcal },{ key:"protein", label:"Protein (g)", color:C.protein },{ key:"carbs", label:"Carbs (g)", color:C.carbs },{ key:"fat", label:"Fat (g)", color:C.fat }];
  const valid = name.trim() && Object.values(macros).every(v => v !== "" && !isNaN(Number(v)));
  return (
    <div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. MuscleBlaze Whey — 1 scoop with water"
        style={{ width: "100%", padding: "11px 13px", borderRadius: 11, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 14, background: C.bg, outline: "none", color: C.text, marginBottom: 14, boxSizing: "border-box" }}/>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: f.color, fontWeight: 600, display: "block", marginBottom: 5, textTransform: "uppercase" }}>{f.label}</label>
            <input type="number" value={macros[f.key]} onChange={e => setMacros(m => ({ ...m, [f.key]: e.target.value }))} placeholder="0"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 600, color: f.color, background: C.bg, outline: "none", boxSizing: "border-box" }}/>
          </div>
        ))}
      </div>
      <button onClick={() => { if (valid) onSave({ id: uid(), name: name.trim(), kcal: +macros.kcal, protein: +macros.protein, carbs: +macros.carbs, fat: +macros.fat, isCustom: true }); }} disabled={!valid}
        style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 13, padding: "14px", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: valid ? 1 : 0.4 }}>Save</button>
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

  const activeTarget = getActiveTarget(targetHistory, TODAY);
  const activeHabitSet = getActiveHabitSet(habitHistory, TODAY);

  const tabs = [
    { id: "home", label: "Home", icon: a => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 9.5L11 3l8 6.5V19a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke={a?C.accent:C.muted} strokeWidth="1.5" fill={a?C.accentLight:"none"}/><path d="M8 20v-7h6v7" stroke={a?C.accent:C.muted} strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id: "log", label: "Log", icon: a => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="4" width="16" height="15" rx="3" stroke={a?C.accent:C.muted} strokeWidth="1.5"/><path d="M7 2v4M15 2v4M3 9h16" stroke={a?C.accent:C.muted} strokeWidth="1.5" strokeLinecap="round"/><path d="M7 13h3M7 16h8M13 13l1 1 2-2" stroke={a?C.accent:C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: "progress", label: "Progress", icon: a => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 17l5-5 4 3 5-7 2 2" stroke={a?C.accent:C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 20h16" stroke={a?C.accent:C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: "hub", label: "Hub", icon: a => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="3" stroke={a?C.accent:C.muted} strokeWidth="1.5"/><path d="M11 3v2M11 17v2M3 11h2M17 11h2M5.6 5.6l1.4 1.4M15 15l1.4 1.4M5.6 16.4l1.4-1.4M15 7l1.4-1.4" stroke={a?C.accent:C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg> },
  ];

  return (
    <>
      <style>{FONT}</style>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg, position: "relative", maxWidth: 480, margin: "0 auto" }}>
          <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 16px) 18px 6px", flexShrink: 0, background: C.bg }}>
            {tab === "home" && <><p style={{ fontFamily: "'Lora',serif", fontSize: 11, color: C.muted, margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{new Date().toLocaleDateString("en",{weekday:"long",month:"short",day:"numeric"})}</p><p style={{ fontFamily: "'Lora',serif", fontSize: 24, color: C.text, margin: 0, fontWeight: 500 }}>Good morning 👋</p></>}
            {tab === "log" && <><p style={{ fontFamily: "'Lora',serif", fontSize: 11, color: C.muted, margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Meal Log</p><p style={{ fontFamily: "'Lora',serif", fontSize: 24, color: C.text, margin: 0, fontWeight: 500 }}>{activeDate === TODAY ? "Today" : formatDate(activeDate)}</p></>}
            {tab === "progress" && <p style={{ fontFamily: "'Lora',serif", fontSize: 24, color: C.text, margin: 0, fontWeight: 500 }}>Progress</p>}
            {tab === "hub" && <p style={{ fontFamily: "'Lora',serif", fontSize: 24, color: C.text, margin: 0, fontWeight: 500 }}>Hub</p>}
          </div>
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
            {tab === "home" && <HomeTab data={data} date={TODAY} onNavigate={setTab} habitHistory={habitHistory} onToggleHabit={handleToggleHabit} targetHistory={targetHistory}/>}
            {tab === "log" && <LogTab data={data} activeDate={activeDate} setActiveDate={setActiveDate} onDataChange={setData} favourites={favourites} customItems={customItems} onFavourite={handleFavourite} targetHistory={targetHistory}/>}
            {tab === "progress" && <ProgressTab data={data} targetHistory={targetHistory} habitHistory={habitHistory}/>}
            {tab === "hub" && <HubTab targetHistory={targetHistory} setTargetHistory={setTargetHistory} habitHistory={habitHistory} setHabitHistory={setHabitHistory} favourites={favourites} customItems={customItems} onDeleteFav={id => setFavourites(f => f.filter(x => x.id !== id))} onDeleteCustom={id => setCustomItems(c => c.filter(x => x.id !== id))} onCreateCustom={item => setCustomItems(c => [...c, item])}/>}
          </div>
          <div style={{ display: "flex", background: C.card, borderTop: `1px solid ${C.border}`, padding: "10px 0 env(safe-area-inset-bottom, 20px)", flexShrink: 0 }}>
            {tabs.map(t => { const active = tab === t.id; return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                {t.icon(active)}
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: active ? 600 : 400, color: active ? C.accent : C.muted }}>{t.label}</span>
                {active && <div style={{ width: 18, height: 2, background: C.accent, borderRadius: 2 }}/>}
              </button>
            ); })}
          </div>
      </div>
    </>
  );
}
