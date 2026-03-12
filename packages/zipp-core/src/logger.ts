/**
 * Structured Logger - Provides consistent, level-based logging across the application.
 *
 * Features:
 * - Log levels: debug, info, warn, error
 * - Environment-aware (debug logs only in development)
 * - Consistent formatting with timestamps and prefixes
 * - Structured data support
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  source: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type LogHandler = (entry: LogEntry) => void;

// Check if we're in development mode
const isDevelopment = (() => {
  try {
    // Check for Vite environment (use indirect eval to avoid syntax errors in non-ESM contexts like Jest)
    // eslint-disable-next-line no-eval
    const meta = new Function('try { return import.meta } catch(e) { return undefined }')() as { env?: { DEV?: boolean; MODE?: string } } | undefined;
    if (meta?.env?.DEV === true) return true;
    if (meta?.env?.MODE === 'development') return true;
    // Check for Node environment (with proper typing)
    if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
      const nodeProcess = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
      if (nodeProcess?.env?.NODE_ENV === 'development') {
        return true;
      }
    }
  } catch {
    // Ignore errors in environments where these aren't available
  }
  return false;
})();

// Log level priorities (higher = more important)
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger class for structured, level-based logging
 */
export class Logger {
  private source: string;
  private minLevel: LogLevel;
  private handlers: LogHandler[] = [];

  constructor(source: string, options?: { minLevel?: LogLevel }) {
    this.source = source;
    // In development, show all logs including debug
    // In production, only show info and above
    this.minLevel = options?.minLevel ?? (isDevelopment ? 'debug' : 'info');
  }

  /**
   * Add a custom log handler
   */
  addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Remove a log handler
   */
  removeHandler(handler: LogHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * Set the minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * Check if a log level is enabled.
   * Use this to avoid expensive operations (like JSON.stringify) when the log level is disabled.
   *
   * @example
   * ```typescript
   * if (logger.isEnabled('debug')) {
   *   logger.debug(`Large object: ${JSON.stringify(bigObject)}`);
   * }
   * ```
   */
  isEnabled(level: LogLevel): boolean {
    return this.shouldLog(level);
  }

  /**
   * Check if debug logging is enabled.
   * Convenience method for the common case of expensive debug logging.
   */
  get isDebugEnabled(): boolean {
    return this.shouldLog('debug');
  }

  /**
   * Format and output a log entry
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      source: this.source,
      message,
      timestamp: new Date().toISOString(),
      data,
    };

    // Output to console with appropriate method
    const prefix = `[${this.source}]`;
    const formattedMessage = data
      ? `${prefix} ${message} ${JSON.stringify(data)}`
      : `${prefix} ${message}`;

    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }

    // Call custom handlers
    for (const handler of this.handlers) {
      try {
        handler(entry);
      } catch {
        // Ignore handler errors to prevent log loops
      }
    }
  }

  /**
   * Log a debug message (only shown in development)
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Create a child logger with a different source prefix
   */
  child(childSource: string): Logger {
    return new Logger(`${this.source}:${childSource}`, { minLevel: this.minLevel });
  }
}

// Pre-configured loggers for different parts of the application
export const compilerLogger = new Logger('Compiler');
export const runtimeLogger = new Logger('Runtime');
export const databaseLogger = new Logger('Database');
export const moduleLogger = new Logger('Module');

/**
 * Create a new logger with a custom source
 */
export function createLogger(source: string, options?: { minLevel?: LogLevel }): Logger {
  return new Logger(source, options);
}
