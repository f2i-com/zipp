/**
 * ValueConverter - No-op for WASM engine
 * 
 * Since the Rust FormLogic WASM engine automatically converts to/from 
 * native JavaScript types, we no longer need complex BaseObject mappings.
 */

export function baseObjectToJsValue(obj: any): any {
  return obj;
}

export function jsValueToBaseObject(value: any): any {
  return value;
}
