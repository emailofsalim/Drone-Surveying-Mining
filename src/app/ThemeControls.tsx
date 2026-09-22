/** Accessibility controls — Spec §205: theme and high-contrast, persisted locally. */

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
type Contrast = 'normal' | 'high';

function readStored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function ThemeControls() {
  const [theme, setTheme] = useState<Theme>(() => readStored<Theme>('dsm.theme', 'dark'));
  const [contrast, setContrast] = useState<Contrast>(() =>
    readStored<Contrast>('dsm.contrast', 'normal'),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.contrast = contrast;
    try {
      localStorage.setItem('dsm.theme', theme);
      localStorage.setItem('dsm.contrast', contrast);
    } catch {
      /* storage unavailable — the app still works, the choice just is not remembered */
    }
  }, [theme, contrast]);

  return (
    <div className="row" style={{ gap: 'var(--sp-1)' }}>
      <button
        className="ghost"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        title="Theme"
      >
        {theme === 'dark' ? '☾' : '☀'}
      </button>
      <button
        className="ghost"
        aria-pressed={contrast === 'high'}
        onClick={() => setContrast(contrast === 'high' ? 'normal' : 'high')}
        title="High contrast"
      >
        Aa
      </button>
    </div>
  );
}
