/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * React shim — stores the host-provided React object at runtime.
 * All renderer modules import from here instead of 'react'.
 */

let _React: any = null;

export function initReact(React: any): void {
  _React = React;
}

export function getReact(): any {
  return _React;
}

export function h(type: any, props?: any, ...children: any[]): any {
  return _React.createElement(type, props, ...children);
}

export function useState<T>(initialState: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  return _React.useState(initialState);
}

export function useEffect(effect: () => void | (() => void), deps?: any[]): void {
  return _React.useEffect(effect, deps);
}

export function useMemo<T>(factory: () => T, deps: any[]): T {
  return _React.useMemo(factory, deps);
}

export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T {
  return _React.useCallback(callback, deps);
}

export function useRef<T>(initialValue: T): { current: T } {
  return _React.useRef(initialValue);
}
