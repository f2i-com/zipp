import { Component, type ReactNode, type ErrorInfo, useState, useCallback } from 'react';
import { uiLogger as logger } from '../utils/logger';

// Inline CopyButton for use within class component
function InlineCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy to clipboard', { error: err });
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`text-xs underline ml-2 ${
        copied ? 'text-green-500 no-underline' : 'text-slate-400 hover:text-slate-300'
      }`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors in child components.
 * Prevents the entire app from crashing when a component throws during render.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('ErrorBoundary caught an error', { error, errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full bg-slate-100 dark:bg-slate-900 p-8">
          <div className="bg-white dark:bg-slate-800 border border-red-600/50 rounded-lg p-6 max-w-md text-center">
            <svg
              className="w-12 h-12 text-red-500 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
              An error occurred while rendering the workflow builder.
            </p>
            {this.state.error && (
              <details className="text-left mb-4">
                <summary className="text-slate-500 dark:text-slate-400 text-xs cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                  Error details
                  <InlineCopyButton text={this.state.error.message + (this.state.error.stack ? '\n\n' + this.state.error.stack : '')} />
                </summary>
                <pre className="mt-2 p-2 bg-slate-100 dark:bg-slate-900 rounded text-red-400 text-xs overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
