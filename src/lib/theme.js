const KEY = 'shaala.theme';

export function getStoredTheme() {
  const t = localStorage.getItem(KEY);
  return t === 'light' || t === 'dark' ? t : null;
}

export function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function currentTheme() {
  return getStoredTheme() ?? systemTheme();
}

export function setTheme(theme) {
  localStorage.setItem(KEY, theme);
  document.documentElement.dataset.theme = theme;
}

export function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  setTheme(next);
  return next;
}
