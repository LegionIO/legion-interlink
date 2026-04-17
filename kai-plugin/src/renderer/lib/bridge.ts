/* eslint-disable @typescript-eslint/no-explicit-any */

export function getBridge(): any {
  return (window as any).app ?? null;
}
