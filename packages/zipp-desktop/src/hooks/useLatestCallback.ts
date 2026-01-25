import { useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook that returns a stable callback reference that always invokes the latest version of the callback.
 * This is useful when you need to use a callback in a useCallback dependency array without causing
 * unnecessary re-renders, or when you need to access the latest callback in event listeners without
 * recreating them.
 *
 * @example
 * ```tsx
 * function MyComponent({ onSave }: { onSave: (data: string) => void }) {
 *   const stableOnSave = useLatestCallback(onSave);
 *
 *   // This effect only runs once, but always calls the latest onSave
 *   useEffect(() => {
 *     window.addEventListener('beforeunload', () => stableOnSave('auto-save'));
 *     return () => window.removeEventListener('beforeunload', () => stableOnSave('auto-save'));
 *   }, [stableOnSave]); // stableOnSave never changes
 * }
 * ```
 */
export function useLatestCallback<T extends (...args: never[]) => unknown>(
  callback: T | undefined
): T {
  const callbackRef = useRef<T | undefined>(callback);

  // Keep the ref in sync with the latest callback
  useEffect(() => {
    callbackRef.current = callback;
  });

  // Return a stable function that delegates to the latest callback
  return useCallback(
    ((...args: Parameters<T>) => {
      return callbackRef.current?.(...args);
    }) as T,
    []
  );
}

/**
 * Custom hook that returns a ref containing the latest value.
 * Useful when you need to access the latest value in callbacks without adding it to dependencies.
 *
 * @example
 * ```tsx
 * function MyComponent({ value }: { value: number }) {
 *   const valueRef = useLatestRef(value);
 *
 *   const handleClick = useCallback(() => {
 *     // Always gets the latest value, even if handleClick doesn't change
 *     console.log(valueRef.current);
 *   }, []); // No need to include value in deps
 * }
 * ```
 */
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);

  // Update ref in effect to comply with React Compiler rules
  // This may cause a one-render delay but is the recommended pattern
  useEffect(() => {
    ref.current = value;
  });

  return ref;
}
