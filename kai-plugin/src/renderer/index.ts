/* eslint-disable @typescript-eslint/no-explicit-any */
import { initReact } from './lib/react.js';
import { LegionWorkspace } from './panels/index.js';
import { LegionSettings } from './settings/index.js';
import { LegionStatusBanner } from './components/LegionStatusBanner.js';

export function register(api: any): void {
  const { React, registerComponents } = api;
  initReact(React);
  registerComponents('legion', { LegionSettings, LegionWorkspace, LegionStatusBanner });
}
