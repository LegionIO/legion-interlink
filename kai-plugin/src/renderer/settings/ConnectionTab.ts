/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { Section, ActionButton, Field } from '../components/index.js';

export function ConnectionTab({ draft, setDraft }: any): any {
  return h(Section, {
    title: 'Connection',
    subtitle: 'Configure the Legion daemon, auth source, and event transport.',
  },
  h('div', { className: 'grid gap-4 md:grid-cols-2' },
    h(Field, { label: 'Daemon URL', value: draft.daemonUrl, onChange: (value: string) => setDraft((current: any) => ({ ...current, daemonUrl: value })), placeholder: 'http://127.0.0.1:4567' }),
    h(Field, { label: 'Config Dir', value: draft.configDir, onChange: (value: string) => setDraft((current: any) => ({ ...current, configDir: value })), placeholder: '~/.kai/settings' }),
    h(Field, { label: 'API Key', value: draft.apiKey, onChange: (value: string) => setDraft((current: any) => ({ ...current, apiKey: value })), type: 'password', placeholder: 'Optional manual bearer token' }),
    h(Field, { label: 'Ready Path', value: draft.readyPath, onChange: (value: string) => setDraft((current: any) => ({ ...current, readyPath: value })), placeholder: '/api/ready' }),
    h(Field, { label: 'Health Path', value: draft.healthPath, onChange: (value: string) => setDraft((current: any) => ({ ...current, healthPath: value })), placeholder: '/api/health' }),
    h(Field, { label: 'Stream Path', value: draft.streamPath, onChange: (value: string) => setDraft((current: any) => ({ ...current, streamPath: value })), placeholder: '/api/llm/inference' }),
    h(Field, { label: 'Events Path', value: draft.eventsPath, onChange: (value: string) => setDraft((current: any) => ({ ...current, eventsPath: value })), placeholder: '/api/events' }),
    h(Field, { label: 'Health Poll (ms)', value: draft.healthPollMs, onChange: (value: string) => setDraft((current: any) => ({ ...current, healthPollMs: value })), placeholder: '60000' }),
    h(Field, { label: 'Recent Events Count', value: draft.eventsRecentCount, onChange: (value: string) => setDraft((current: any) => ({ ...current, eventsRecentCount: value })), placeholder: '50' }),
    h(Field, { label: 'Reconnect Delay (ms)', value: draft.sseReconnectMs, onChange: (value: string) => setDraft((current: any) => ({ ...current, sseReconnectMs: value })), placeholder: '5000' }),
  ));
}
