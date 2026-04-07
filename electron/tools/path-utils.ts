import { isAbsolute, resolve } from 'path';

export function resolveToolPath(pathValue: string, cwd?: string): string {
  if (!cwd || isAbsolute(pathValue)) {
    return pathValue;
  }

  return resolve(cwd, pathValue);
}
