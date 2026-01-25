import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';
export type BackgroundTint = 'none' | 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'slate';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
  backgroundTint: BackgroundTint;
  setBackgroundTint: (tint: BackgroundTint) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'zipp_theme';
const ACCENT_KEY = 'zipp_accent_color';
const BG_TINT_KEY = 'zipp_bg_tint';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Initialize theme from localStorage or default to 'dark'
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'dark';
  });

  // Initialize accent color from localStorage or default to 'blue'
  const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
    try {
      const stored = localStorage.getItem(ACCENT_KEY);
      if (stored && ['blue', 'purple', 'green', 'orange', 'pink', 'cyan'].includes(stored)) {
        return stored as AccentColor;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'blue';
  });

  // Initialize background tint from localStorage or default to 'none'
  const [backgroundTint, setBackgroundTintState] = useState<BackgroundTint>(() => {
    try {
      const stored = localStorage.getItem(BG_TINT_KEY);
      if (stored && ['none', 'blue', 'purple', 'green', 'orange', 'pink', 'cyan', 'slate'].includes(stored)) {
        return stored as BackgroundTint;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'none';
  });

  // Track system preference
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  // Calculate resolved theme
  const resolvedTheme = theme === 'system' ? systemPreference : theme;

  // Listen to system preference changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Apply theme class to document element
  useEffect(() => {
    const root = document.documentElement;

    // Remove existing theme classes
    root.classList.remove('light', 'dark');

    // Add current theme class
    root.classList.add(resolvedTheme);

    // Update color-scheme for native elements
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  // Apply accent color as CSS variable
  useEffect(() => {
    const root = document.documentElement;

    // Define accent color values
    const accentColors: Record<AccentColor, { primary: string; hover: string; glow: string }> = {
      blue: { primary: '59 130 246', hover: '96 165 250', glow: '59 130 246' },
      purple: { primary: '168 85 247', hover: '192 132 252', glow: '168 85 247' },
      green: { primary: '34 197 94', hover: '74 222 128', glow: '34 197 94' },
      orange: { primary: '249 115 22', hover: '251 146 60', glow: '249 115 22' },
      pink: { primary: '236 72 153', hover: '244 114 182', glow: '236 72 153' },
      cyan: { primary: '6 182 212', hover: '34 211 238', glow: '6 182 212' },
    };

    const colors = accentColors[accentColor];
    root.style.setProperty('--accent-primary', colors.primary);
    root.style.setProperty('--accent-hover', colors.hover);
    root.style.setProperty('--accent-glow', colors.glow);
  }, [accentColor]);

  // Apply background tint as CSS variables
  useEffect(() => {
    const root = document.documentElement;

    // Define background tint values for light and dark modes
    // Format: { light: { bg, bgSecondary, bgTertiary }, dark: { bg, bgSecondary, bgTertiary } }
    const bgTints: Record<BackgroundTint, {
      light: { bg: string; bgSecondary: string; bgTertiary: string };
      dark: { bg: string; bgSecondary: string; bgTertiary: string };
    }> = {
      none: {
        light: { bg: '248 250 252', bgSecondary: '241 245 249', bgTertiary: '226 232 240' },
        dark: { bg: '15 23 42', bgSecondary: '30 41 59', bgTertiary: '51 65 85' },
      },
      blue: {
        // Saturated tints for both modes
        light: { bg: '224 242 254', bgSecondary: '186 230 253', bgTertiary: '125 211 252' },
        dark: { bg: '17 24 49', bgSecondary: '23 37 84', bgTertiary: '30 58 138' },
      },
      purple: {
        // Saturated tints for both modes
        light: { bg: '243 232 255', bgSecondary: '233 213 255', bgTertiary: '216 180 254' },
        dark: { bg: '25 18 45', bgSecondary: '46 16 101', bgTertiary: '76 29 149' },
      },
      green: {
        // Saturated tints for both modes
        light: { bg: '220 252 231', bgSecondary: '187 247 208', bgTertiary: '134 239 172' },
        dark: { bg: '16 32 24', bgSecondary: '20 83 45', bgTertiary: '22 101 52' },
      },
      orange: {
        // Saturated tints for both modes
        light: { bg: '255 237 213', bgSecondary: '254 215 170', bgTertiary: '253 186 116' },
        dark: { bg: '32 24 16', bgSecondary: '67 20 7', bgTertiary: '124 45 18' },
      },
      pink: {
        // Saturated tints for both modes
        light: { bg: '252 231 243', bgSecondary: '251 207 232', bgTertiary: '249 168 212' },
        dark: { bg: '35 20 30', bgSecondary: '77 17 56', bgTertiary: '112 26 79' },
      },
      cyan: {
        // Saturated tints for both modes
        light: { bg: '207 250 254', bgSecondary: '165 243 252', bgTertiary: '103 232 249' },
        dark: { bg: '16 30 35', bgSecondary: '22 78 99', bgTertiary: '21 94 117' },
      },
      slate: {
        light: { bg: '241 245 249', bgSecondary: '226 232 240', bgTertiary: '203 213 225' },
        dark: { bg: '15 23 42', bgSecondary: '30 41 59', bgTertiary: '51 65 85' },
      },
    };

    const tintColors = bgTints[backgroundTint];
    const modeColors = resolvedTheme === 'dark' ? tintColors.dark : tintColors.light;

    root.style.setProperty('--bg-primary', modeColors.bg);
    root.style.setProperty('--bg-secondary', modeColors.bgSecondary);
    root.style.setProperty('--bg-tertiary', modeColors.bgTertiary);
  }, [backgroundTint, resolvedTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const setAccentColor = useCallback((color: AccentColor) => {
    setAccentColorState(color);
    try {
      localStorage.setItem(ACCENT_KEY, color);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const setBackgroundTint = useCallback((tint: BackgroundTint) => {
    setBackgroundTintState(tint);
    try {
      localStorage.setItem(BG_TINT_KEY, tint);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, accentColor, setAccentColor, backgroundTint, setBackgroundTint }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
