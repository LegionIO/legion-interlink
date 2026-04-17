/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { fmtAgo, fmtTime, asArray } from '../lib/utils.js';
import { Badge, Section, ActionButton, Field, TextAreaField, JsonBox, EmptyState } from '../components/index.js';

export function WorkflowsView({ pluginState, onAction }: any): any {
  const [message, setMessage] = useState('');
  const [model, setModel] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskError, setTaskError] = useState('');
  const [busy, setBusy] = useState(false);
  const workflows = Array.isArray(pluginState?.workflows) ? pluginState.workflows : [];

  const loadTasks = async () => {
    setBusy(true);
    setTaskError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', { path: '/api/tasks', quiet: true }));
      if (result?.ok === false) {
        setTaskError(result.error || 'Failed to load daemon tasks.');
        setTasks([]);
      } else {
        setTasks(asArray(result?.data));
      }
    } catch (error: any) {
      setTaskError(error instanceof Error ? error.message : String(error));
      setTasks([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (tasks.length === 0) {
      void loadTasks();
    }
  }, []);

  const createSubAgent = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setTaskError('');
    try {
      const result = await Promise.resolve(onAction?.('create-subagent', {
        message: message.trim(),
        model: model.trim() || undefined,
        parentConversationId: pluginState?.proactiveConversationId || undefined,
      }));
      if (result?.ok === false) {
        setTaskError(result.error || 'Failed to create sub-agent.');
      } else {
        setMessage('');
        void loadTasks();
      }
    } finally {
      setBusy(false);
    }
  };

  return h(
    'div',
    { className: 'space-y-5' },
    h(Section, {
      title: 'Trigger Workflows',
      subtitle: 'Plugin-managed observe/act workflows routed from daemon trigger events.',
      actions: [
        h(ActionButton, { key: 'refresh-workflows', label: 'Refresh Workflow Status', onClick: () => { void onAction?.('refresh-workflows'); }, variant: 'secondary' }),
        h(ActionButton, { key: 'open-thread', label: 'Open Proactive Thread', onClick: () => { void onAction?.('open-proactive-thread'); }, variant: 'secondary' }),
      ],
    },
    workflows.length === 0
      ? h(EmptyState, { title: 'No workflows yet', body: 'Trigger events routed by the daemon will create workflows here when rules match.' })
      : h(
        'div',
        { className: 'space-y-2' },
        workflows.map((workflow: any) => h(
          'div',
          { key: workflow.id, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', { className: 'flex flex-wrap items-start justify-between gap-3' },
            h('div', { className: 'min-w-0 flex-1' },
              h('div', { className: 'text-sm font-medium' }, `${workflow.source} \u2022 ${workflow.eventType}`),
              h('div', { className: 'mt-1 text-xs text-muted-foreground' }, `${workflow.action} \u2022 started ${fmtTime(workflow.startedAt)}${workflow.taskId ? ` \u2022 task ${workflow.taskId}` : ''}`),
              workflow.summary ? h('p', { className: 'mt-2 text-sm text-muted-foreground' }, workflow.summary) : null,
              workflow.error ? h('p', { className: 'mt-2 text-sm text-red-600 dark:text-red-300' }, workflow.error) : null,
            ),
            h(Badge, { status: workflow.status }),
          ),
          workflow.payload ? h('details', { className: 'mt-3' },
            h('summary', { className: 'cursor-pointer text-xs text-muted-foreground' }, 'Payload'),
            h(JsonBox, { value: workflow.payload, emptyLabel: 'No payload.' }),
          ) : null,
        )),
      )),
    h(Section, {
      title: 'Daemon Sub-Agent Task',
      subtitle: 'Manually create a daemon sub-agent task and inspect the broader daemon task queue.',
    },
    h('div', { className: 'grid gap-4 lg:grid-cols-[1fr_220px]' },
      h(TextAreaField, { label: 'Task Message', value: message, onChange: setMessage, placeholder: 'Ask the Legion daemon to spawn a sub-agent for a bounded task.', rows: 5 }),
      h('div', { className: 'grid content-start gap-3' },
        h(Field, { label: 'Model', value: model, onChange: setModel, placeholder: 'Optional model override' }),
        h(ActionButton, { label: busy ? 'Creating...' : 'Create Sub-Agent', onClick: createSubAgent, disabled: busy || !message.trim() }),
        h(ActionButton, { label: 'Refresh Tasks', onClick: () => { void loadTasks(); }, disabled: busy, variant: 'secondary' }),
      ),
    )),
    taskError ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, taskError) : null,
    tasks.length === 0 && !busy ? h(EmptyState, { title: 'No daemon tasks loaded', body: 'Refresh tasks to inspect the daemon queue.' }) : null,
    tasks.length > 0 ? h(
      'div',
      { className: 'space-y-2' },
      tasks.slice(0, 25).map((task: any, index: number) => h(
        'div',
        { key: task?.id || task?.task_id || index, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
        h('div', { className: 'flex flex-wrap items-start justify-between gap-3' },
          h('div', { className: 'min-w-0 flex-1' },
            h('div', { className: 'text-sm font-medium break-all' }, task?.name || task?.title || task?.id || task?.task_id || `Task ${index + 1}`),
            h('div', { className: 'mt-1 text-xs text-muted-foreground' }, `${task?.created_at ? fmtAgo(task.created_at) : 'recent'}${task?.parent_id ? ` \u2022 parent ${task.parent_id}` : ''}`),
          ),
          h(Badge, { status: String(task?.status || 'unknown').toLowerCase() }),
        ),
      )),
    ) : null,
  );
}
