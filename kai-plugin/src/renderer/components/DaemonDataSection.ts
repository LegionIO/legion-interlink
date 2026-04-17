/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { Section } from './Section.js';
import { ActionButton } from './ActionButton.js';
import { JsonBox } from './JsonBox.js';
import { EmptyState } from './EmptyState.js';
import { asArray } from '../lib/utils.js';

type Props = {
  title: string;
  subtitle?: string;
  onAction: (action: string, data?: any) => any;
  action: string;
  actionData?: any;
  renderData?: (data: any) => any;
};

export function DaemonDataSection({ title, subtitle, onAction, action, actionData, renderData }: Props): any {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction(action, actionData));
      if (result?.ok === false) {
        setError(result.error || 'Request failed.');
        setData(null);
      } else {
        setData(result?.data ?? result);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [action, JSON.stringify(actionData)]);

  const content = loading
    ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...')
    : error
      ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error)
      : data == null
        ? h(EmptyState, { title: 'No data', body: 'Nothing was returned for this request.' })
        : renderData
          ? renderData(Array.isArray(data) ? data : asArray(data).length > 0 ? asArray(data) : data)
          : h(JsonBox, { value: data });

  return h(
    Section,
    {
      title,
      subtitle,
      actions: h(ActionButton, {
        label: loading ? 'Refreshing...' : 'Refresh',
        onClick: () => { void load(); },
        disabled: loading,
        variant: 'secondary' as const,
      }),
    },
    content,
  );
}
