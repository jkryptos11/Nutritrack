// Persistent local storage helpers
const KEYS = {
  data: 'nt_data',
  favourites: 'nt_favourites',
  customItems: 'nt_customItems',
  targetHistory: 'nt_targetHistory',
  habitHistory: 'nt_habitHistory',
}

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(KEYS[key])
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

export function save(key, value) {
  try { localStorage.setItem(KEYS[key], JSON.stringify(value)) } catch {}
}
