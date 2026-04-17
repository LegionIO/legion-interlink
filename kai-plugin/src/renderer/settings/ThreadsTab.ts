/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { Section, ActionButton, Field, TextAreaField } from '../components/index.js';

export function ThreadsTab({ draft, setDraft, saving, onSave }: any): any {
  return h(Section, {
    title: 'Threads And Rules',
    subtitle: 'Adjust workflow policy, conversation defaults, and proactive thread copy.',
  },
  h('div', { className: 'grid gap-4 md:grid-cols-2' },
    h(Field, { label: 'Workspace Title', value: draft.workspaceThreadTitle, onChange: (value: string) => setDraft((current: any) => ({ ...current, workspaceThreadTitle: value })), placeholder: 'Legion Workspace' }),
    h(Field, { label: 'Proactive Title', value: draft.proactiveThreadTitle, onChange: (value: string) => setDraft((current: any) => ({ ...current, proactiveThreadTitle: value })), placeholder: 'GAIA Activity' }),
    h(Field, { label: 'Knowledge Scope', value: draft.knowledgeScope, onChange: (value: string) => setDraft((current: any) => ({ ...current, knowledgeScope: value })), placeholder: 'all' }),
    h(Field, { label: 'Triage Model', value: draft.triageModel, onChange: (value: string) => setDraft((current: any) => ({ ...current, triageModel: value })), placeholder: 'Optional model override' }),
    h(Field, { label: 'Max Concurrent Workflows', value: draft.maxConcurrentWorkflows, onChange: (value: string) => setDraft((current: any) => ({ ...current, maxConcurrentWorkflows: value })), placeholder: '3' }),
  ),
  h(TextAreaField, { label: 'Bootstrap Prompt', value: draft.bootstrapPrompt, onChange: (value: string) => setDraft((current: any) => ({ ...current, bootstrapPrompt: value })), placeholder: 'Assistant bootstrap message for new Legion threads', rows: 5 }),
  h(TextAreaField, { label: 'Proactive Prompt Prefix', value: draft.proactivePromptPrefix, onChange: (value: string) => setDraft((current: any) => ({ ...current, proactivePromptPrefix: value })), placeholder: 'Prefix text for proactive messages', rows: 3 }),
  h(TextAreaField, { label: 'Trigger Rules JSON', value: draft.triggerRules, onChange: (value: string) => setDraft((current: any) => ({ ...current, triggerRules: value })), placeholder: '[{"source":"github","eventType":"*","action":"observe"}]', rows: 8 }),
  h('div', { className: 'mt-4 flex flex-wrap gap-2' },
    h(ActionButton, { label: saving ? 'Saving...' : 'Save Config', onClick: onSave, disabled: saving }),
  ));
}
