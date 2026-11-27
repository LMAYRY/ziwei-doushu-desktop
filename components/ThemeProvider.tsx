'use client';
import { createContext, useContext, useEffect, useState } from 'react';

/** light = 白天（默认），dark = 黑夜 */
export type Theme = 'dark' | 'light';

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: 'light', toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 首次渲染固定为 'light'，与服务端一致，避免水合不匹配；挂载后再读本地存储。
  // 首屏颜色不依赖这个值：layout.tsx 的内联脚本已在绘制前设好 html[data-theme]。
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('ziwei-theme-v3') as Theme | null;
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('ziwei-theme-v3', theme);
  }, [theme, mounted]);

  const toggle = () => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
