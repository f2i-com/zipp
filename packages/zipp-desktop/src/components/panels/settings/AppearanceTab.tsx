/**
 * Appearance Tab Component
 *
 * Manages theme, accent color, and background tint settings.
 * Extracted from SettingsPanel.tsx for maintainability.
 */

import { useTheme, type AccentColor } from '../../../contexts/ThemeContext';

type BackgroundTint = 'none' | 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'slate';

const ACCENT_COLORS: { id: AccentColor; color: string; label: string }[] = [
  { id: 'blue', color: 'bg-blue-500', label: 'Blue' },
  { id: 'purple', color: 'bg-purple-500', label: 'Purple' },
  { id: 'green', color: 'bg-green-500', label: 'Green' },
  { id: 'orange', color: 'bg-orange-500', label: 'Orange' },
  { id: 'pink', color: 'bg-pink-500', label: 'Pink' },
  { id: 'cyan', color: 'bg-cyan-500', label: 'Cyan' },
];

const BACKGROUND_TINTS: { id: BackgroundTint; label: string; lightBg: string; darkBg: string }[] = [
  { id: 'none', label: 'None', lightBg: 'bg-slate-100', darkBg: 'bg-slate-900' },
  { id: 'blue', label: 'Blue', lightBg: 'bg-sky-200', darkBg: 'bg-blue-950' },
  { id: 'purple', label: 'Purple', lightBg: 'bg-purple-200', darkBg: 'bg-purple-950' },
  { id: 'green', label: 'Green', lightBg: 'bg-green-200', darkBg: 'bg-green-950' },
  { id: 'orange', label: 'Orange', lightBg: 'bg-orange-200', darkBg: 'bg-orange-950' },
  { id: 'pink', label: 'Pink', lightBg: 'bg-pink-200', darkBg: 'bg-pink-950' },
  { id: 'cyan', label: 'Cyan', lightBg: 'bg-cyan-200', darkBg: 'bg-cyan-950' },
  { id: 'slate', label: 'Slate', lightBg: 'bg-slate-200', darkBg: 'bg-slate-800' },
];

export default function AppearanceTab() {
  const { theme, setTheme, resolvedTheme, accentColor, setAccentColor, backgroundTint, setBackgroundTint } = useTheme();

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Theme Selection */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          Theme
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {/* Light Theme */}
          <button
            onClick={() => setTheme('light')}
            className={`relative p-4 rounded-lg border-2 transition-all ${
              theme === 'light'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 bg-slate-100/50 dark:bg-slate-900/50'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm text-slate-700 dark:text-slate-200">Light</span>
            </div>
            {theme === 'light' && (
              <div className="absolute top-2 right-2">
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>

          {/* Dark Theme */}
          <button
            onClick={() => setTheme('dark')}
            className={`relative p-4 rounded-lg border-2 transition-all ${
              theme === 'dark'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 bg-slate-100/50 dark:bg-slate-900/50'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-lg bg-slate-700 dark:bg-slate-800 border border-slate-500 dark:border-slate-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-300 dark:text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              </div>
              <span className="text-sm text-slate-700 dark:text-slate-200">Dark</span>
            </div>
            {theme === 'dark' && (
              <div className="absolute top-2 right-2">
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>

          {/* System Theme */}
          <button
            onClick={() => setTheme('system')}
            className={`relative p-4 rounded-lg border-2 transition-all ${
              theme === 'system'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 bg-slate-100/50 dark:bg-slate-900/50'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-slate-100 to-slate-800 border border-slate-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-sm text-slate-700 dark:text-slate-200">System</span>
            </div>
            {theme === 'system' && (
              <div className="absolute top-2 right-2">
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {theme === 'system'
            ? `Currently using ${resolvedTheme} theme based on your system preferences.`
            : `Using ${theme} theme.`}
        </p>
      </div>

      {/* Accent Color */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          Accent Color
        </h3>
        <div className="flex flex-wrap gap-3">
          {ACCENT_COLORS.map((option) => (
            <button
              key={option.id}
              onClick={() => setAccentColor(option.id)}
              className={`relative w-10 h-10 rounded-full ${option.color} transition-all ${
                accentColor === option.id
                  ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-white scale-110'
                  : 'hover:scale-105'
              }`}
              title={option.label}
            >
              {accentColor === option.id && (
                <svg className="absolute inset-0 m-auto w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          The accent color is used for buttons, links, and highlights throughout the app.
        </p>
      </div>

      {/* Background Tint */}
      <div className="space-y-4 pt-4 border-t border-slate-300 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          Background Tint
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {BACKGROUND_TINTS.map((option) => (
            <button
              key={option.id}
              onClick={() => setBackgroundTint(option.id)}
              className={`relative p-3 rounded-lg border-2 transition-all ${
                backgroundTint === option.id
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-md ${resolvedTheme === 'dark' ? option.darkBg : option.lightBg} border border-slate-300 dark:border-slate-600`} />
                <span className="text-xs text-slate-600 dark:text-slate-300">{option.label}</span>
              </div>
              {backgroundTint === option.id && (
                <div className="absolute top-1 right-1">
                  <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Add a subtle color tint to the app background. Works in both light and dark modes.
        </p>
      </div>

      {/* Preview Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">Preview</h3>
        <div className="border border-slate-300 dark:border-slate-700 rounded-lg p-4 space-y-3" style={{ backgroundColor: `rgb(var(--bg-primary))` }}>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors" style={{ backgroundColor: `rgb(var(--accent-primary))` }}>
              Primary Button
            </button>
            <button className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors">
              Secondary
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Links use accent:</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="transition-colors" style={{ color: `rgb(var(--accent-primary))` }}>
              Example Link
            </a>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full animate-pulse" style={{ backgroundColor: `rgb(var(--accent-primary))` }} />
            <span className="text-xs text-slate-400">Status indicators</span>
          </div>
        </div>
      </div>
    </div>
  );
}
