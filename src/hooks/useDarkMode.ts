import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'stint-dark-mode';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
    // Default to light mode
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, String(isDark));
  }, [isDark]);

  const toggleDark = useCallback(() => setIsDark((prev) => !prev), []);

  return { isDark, toggleDark };
}
