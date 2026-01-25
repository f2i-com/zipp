/**
 * BuiltinModules - Built-in FormLogic modules for ZippRuntime
 *
 * Provides the core system modules:
 * - Abort: Workflow cancellation checking
 * - Utility: HTTP requests and template substitution
 * - Agent: Agent memory with LRU eviction and persistence
 *
 * Extracted from runtime.ts for maintainability.
 */

import type { BaseObject, FormLogicModuleFn } from 'formlogic-lang';
import {
  StringObject,
  IntegerObject,
  BooleanObject,
  NullObject,
  PromiseObject,
  HashObject,
} from 'formlogic-lang';
import { baseObjectToJsValue, jsValueToBaseObject } from './ValueConverter.js';
import type { BoundedMap } from './BoundedMap.js';
import type { LogCallback } from '../types.js';

/**
 * Dependencies required by builtin modules
 */
export interface BuiltinModuleDependencies {
  /** Abort signal for workflow cancellation */
  abortSignal: AbortSignal | null;
  /** Agent memory storage with LRU eviction */
  agentMemory: BoundedMap<string, string | number | boolean | object>;
  /** Perform an HTTP request */
  performHttpRequest: (
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string
  ) => Promise<{ status: number; headers: Record<string, string>; body: string }>;
  /** Load persisted memory from database */
  loadPersistedMemory: () => Promise<void>;
  /** Persist a memory entry to database */
  persistMemoryEntry: (key: string, value: unknown) => Promise<void>;
  /** Delete a persisted memory entry */
  deletePersistedMemoryEntry: (key: string) => Promise<void>;
  /** Log callback for error messages */
  onLog: LogCallback | null;
}

/**
 * Create the Abort module for workflow cancellation checking
 */
export function createAbortModule(
  deps: Pick<BuiltinModuleDependencies, 'abortSignal'>
): Record<string, FormLogicModuleFn> {
  return {
    // Check if aborted (returns boolean)
    check: (): BaseObject => {
      const promiseObj = new PromiseObject();
      if (deps.abortSignal?.aborted) {
        promiseObj.resolve(new BooleanObject(true));
      } else {
        promiseObj.resolve(new BooleanObject(false));
      }
      return promiseObj;
    },
    // Check and throw if aborted (for use in loops and long operations)
    checkThrow: (): BaseObject => {
      const promiseObj = new PromiseObject();
      if (deps.abortSignal?.aborted) {
        // Reject with special abort error that will be caught by the runtime
        promiseObj.reject(new StringObject('__ABORT__'));
      } else {
        promiseObj.resolve(new NullObject());
      }
      return promiseObj;
    },
    // Get a unique identifier for this abort signal (for tracking in parallel operations)
    getSignalId: (): BaseObject => {
      return new StringObject(deps.abortSignal ? 'active' : 'none');
    },
  };
}

/**
 * Create the Utility module for HTTP requests and templates
 */
export function createUtilityModule(
  deps: Pick<BuiltinModuleDependencies, 'performHttpRequest'>
): Record<string, FormLogicModuleFn> {
  return {
    // HTTP request method for compiled code (used by Playwright integration)
    // Returns: { status: number, headers: object, body: string }
    httpRequest: (args: BaseObject[]): BaseObject => {
      const promiseObj = new PromiseObject();

      // Extract arguments: url, method, headers, body
      const url = args[0] instanceof StringObject ? args[0].value : String(args[0]);
      const method = args[1] instanceof StringObject ? args[1].value : String(args[1] || 'GET');
      const headersArg = args[2];
      const bodyArg = args[3];

      // Convert headers from FormLogic object to JS object
      let headers: Record<string, string> = {};
      if (headersArg && 'pairs' in headersArg && (headersArg as { pairs?: Map<string, BaseObject> }).pairs instanceof Map) {
        const pairs = (headersArg as { pairs: Map<string, BaseObject> }).pairs;
        pairs.forEach((value, key) => {
          const cleanKey = key.startsWith('string:') ? key.slice(7) : key;
          headers[cleanKey] = value instanceof StringObject ? value.value : String(value);
        });
      } else if (typeof headersArg === 'object' && headersArg !== null) {
        // Plain object
        headers = baseObjectToJsValue(headersArg) as Record<string, string>;
      }

      // Convert body to string
      let body: string | undefined;
      if (bodyArg) {
        body = bodyArg instanceof StringObject ? bodyArg.value : String(bodyArg);
      }

      // Make the HTTP request
      deps.performHttpRequest(url, method, headers, body)
        .then((result) => {
          // Convert result to FormLogic hash object
          const pairs = new Map<string, BaseObject>();
          pairs.set('string:status', new IntegerObject(result.status));
          pairs.set('string:body', new StringObject(result.body));

          // Convert headers to hash
          const headerPairs = new Map<string, BaseObject>();
          for (const [key, value] of Object.entries(result.headers)) {
            headerPairs.set(`string:${key}`, new StringObject(value));
          }
          pairs.set('string:headers', new HashObject(headerPairs));

          promiseObj.resolve(new HashObject(pairs));
        })
        .catch((error) => {
          const errMsg = error instanceof Error ? error.message : String(error);
          promiseObj.resolve(new StringObject(`ERROR: ${errMsg}`));
        });

      return promiseObj;
    },

    // Template substitution (used by browser module)
    template: (args: BaseObject[]): BaseObject => {
      const template = args[0] instanceof StringObject ? args[0].value : String(args[0]);
      const context = baseObjectToJsValue(args[1]) as Record<string, unknown>;

      // Replace {{key}} with context values
      const result = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = context[key];
        return value !== undefined ? String(value) : match;
      });

      return new StringObject(result);
    },
  };
}

/**
 * Create the Agent module for memory management with persistence
 */
export function createAgentModule(
  deps: Pick<BuiltinModuleDependencies, 'agentMemory' | 'loadPersistedMemory' | 'persistMemoryEntry' | 'deletePersistedMemoryEntry' | 'onLog'>
): Record<string, FormLogicModuleFn> {
  return {
    get: (args: BaseObject[]): BaseObject => {
      const promiseObj = new PromiseObject();
      const key = args[0] instanceof StringObject ? args[0].value : String(args[0]);
      const value = deps.agentMemory.get(key);
      if (value === undefined) {
        promiseObj.resolve(new NullObject());
      } else {
        // Convert JS value back to FormLogic object (handles objects, arrays, primitives)
        promiseObj.resolve(jsValueToBaseObject(value));
      }
      return promiseObj;
    },
    set: (args: BaseObject[]): BaseObject => {
      const promiseObj = new PromiseObject();
      const key = args[0] instanceof StringObject ? args[0].value : String(args[0]);
      const value = baseObjectToJsValue(args[1]);
      deps.agentMemory.set(key, value as string | number | boolean | object);
      promiseObj.resolve(new NullObject());
      return promiseObj;
    },
    // Memory method that handles get/set/append/clear operations
    // Called by memory node: Agent.memory(key, operation, value)
    // Memory is persisted to SQLite for durability across sessions
    memory: (args: BaseObject[]): BaseObject => {
      const promiseObj = new PromiseObject();
      const key = args[0] instanceof StringObject ? args[0].value : String(args[0]);
      const operation = args[1] instanceof StringObject ? args[1].value : 'get';
      const inputValue = args[2];

      // Load persisted memory first (async), then perform operation
      deps.loadPersistedMemory().then(() => {
        switch (operation) {
          case 'set': {
            const setValue = baseObjectToJsValue(inputValue);
            deps.agentMemory.set(key, setValue as string | number | boolean | object);
            // Persist to database
            deps.persistMemoryEntry(key, setValue).then(() => {
              // Return the value that was set
              if (inputValue) {
                promiseObj.resolve(inputValue);
              } else {
                promiseObj.resolve(new NullObject());
              }
            }).catch((err) => {
              // Log but still resolve with in-memory value
              if (deps.onLog) {
                deps.onLog({ source: 'Agent', message: `Memory persist error (using in-memory): ${err}`, type: 'info' });
              }
              promiseObj.resolve(inputValue || new NullObject());
            });
            break;
          }

          case 'append': {
            const existingVal = deps.agentMemory.get(key);
            const newVal = baseObjectToJsValue(inputValue);
            let resultArray: unknown[];
            if (Array.isArray(existingVal)) {
              resultArray = [...existingVal, newVal];
            } else if (existingVal !== undefined && existingVal !== null) {
              resultArray = [existingVal, newVal];
            } else {
              resultArray = [newVal];
            }
            deps.agentMemory.set(key, resultArray);
            // Persist to database
            deps.persistMemoryEntry(key, resultArray).then(() => {
              promiseObj.resolve(jsValueToBaseObject(resultArray));
            }).catch((err) => {
              // Log but still resolve with in-memory value
              if (deps.onLog) {
                deps.onLog({ source: 'Agent', message: `Memory persist error (using in-memory): ${err}`, type: 'info' });
              }
              promiseObj.resolve(jsValueToBaseObject(resultArray));
            });
            break;
          }

          case 'clear': {
            deps.agentMemory.delete(key);
            // Delete from database
            deps.deletePersistedMemoryEntry(key).then(() => {
              promiseObj.resolve(new NullObject());
            }).catch((err) => {
              // Log but still resolve (memory was cleared in-memory)
              if (deps.onLog) {
                deps.onLog({ source: 'Agent', message: `Memory delete error (cleared in-memory): ${err}`, type: 'info' });
              }
              promiseObj.resolve(new NullObject());
            });
            break;
          }

          case 'get':
          default: {
            const value = deps.agentMemory.get(key);
            if (value === undefined) {
              promiseObj.resolve(new NullObject());
            } else {
              promiseObj.resolve(jsValueToBaseObject(value));
            }
            break;
          }
        }
      }).catch((err) => {
        // Log error but still try to perform operation from in-memory state
        if (deps.onLog) {
          deps.onLog({ source: 'Agent', message: `Memory persistence error: ${err}`, type: 'error' });
        }
        // Fallback to in-memory only operation
        const value = deps.agentMemory.get(key);
        if (value === undefined) {
          promiseObj.resolve(new NullObject());
        } else {
          promiseObj.resolve(jsValueToBaseObject(value));
        }
      });
      return promiseObj;
    },
  };
}
