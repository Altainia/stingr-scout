export type ThemeId = 'stingr' | 'light' | 'dark';

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'stingr', label: 'Stingr (purple and gold)' },
  { id: 'light', label: 'Light (yellow and black)' },
  { id: 'dark', label: 'Dark' },
];

const STORAGE_KEY = 'stingr-theme';

/** This device's chosen theme (Stingr unless another was picked). */
export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.some(t => t.id === saved) ? (saved as ThemeId) : 'stingr';
  } catch {
    return 'stingr';
  }
}

/** Switch the page to a theme and remember it on this device. */
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable: the theme still applies for this visit
  }
}
