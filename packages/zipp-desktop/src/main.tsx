// Dynamic module discovery - MUST be imported first before any module access
import './dynamicModules';

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global error handlers for errors that React's ErrorBoundary doesn't catch
// (async errors, errors in event handlers, etc.)
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  // Prevent the default browser handling (logging to console twice)
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  // Only handle errors that weren't caught by React's ErrorBoundary
  // (those errors will have already been logged)
  if (event.error && !event.error._reactHandled) {
    console.error('[Uncaught Error]', event.error);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
