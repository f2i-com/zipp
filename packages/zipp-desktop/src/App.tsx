import { useState, useCallback, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import ZippApp from './components/ZippApp';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';
import SplashScreen from './components/SplashScreen';
import { loadRuntimePlugins } from './dynamicModules';
import { initMediaServerPort } from 'zipp-core';
import { createLogger } from './utils/logger';

const logger = createLogger('App');

function App() {
  // Check if we should skip splash (set by API restart)
  const shouldSkipSplash = localStorage.getItem('skipSplash') === 'true';
  const [showSplash, setShowSplash] = useState(!shouldSkipSplash);
  const [appReady, setAppReady] = useState(false);

  const handleStart = useCallback(async (appDataPath?: string) => {
    // Initialize media server port (for dynamic port support)
    try {
      await initMediaServerPort();
    } catch (err) {
      logger.error('Failed to get media server port', { error: err });
    }

    // Load runtime plugins when user clicks start
    // appDataPath is the root folder, plugins are in {appDataPath}/plugins
    try {
      await loadRuntimePlugins(appDataPath);
    } catch (err) {
      logger.error('Failed to load runtime plugins', { error: err });
    }

    setShowSplash(false);
    setAppReady(true);
  }, []);

  // Auto-start when skipSplash flag is set (e.g., from API restart)
  useEffect(() => {
    if (shouldSkipSplash) {
      // Clear the flag first so it doesn't persist
      localStorage.removeItem('skipSplash');
      // Auto-start the app
      handleStart();
    }
  }, [shouldSkipSplash, handleStart]);

  if (showSplash) {
    return (
      <ErrorBoundary>
        <ThemeProvider>
          <SplashScreen onStart={handleStart} />
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  if (!appReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <ReactFlowProvider>
            <ZippApp />
          </ReactFlowProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
