/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { EmptyState } from '../components/index.js';
import { DashboardView } from './DashboardView.js';
import { NotificationsView } from './NotificationsView.js';
import { OperationsView } from './OperationsView.js';
import { GitHubView } from './GitHubView.js';
import { KnowledgeView } from './KnowledgeView.js';
import { MarketplaceView } from './MarketplaceView.js';
import { WorkflowsView } from './WorkflowsView.js';
import { SubAgentsView } from './SubAgentsView.js';

export function LegionWorkspace({ props, pluginState, pluginConfig, onAction }: any): any {
  const view = props?.view || 'dashboard';

  if (view === 'dashboard') {
    return h(DashboardView, { pluginState, pluginConfig, onAction });
  }
  if (view === 'notifications') {
    return h(NotificationsView, { pluginState, pluginConfig, onAction });
  }
  if (view === 'operations') {
    return h(OperationsView, { pluginState, pluginConfig, onAction });
  }
  if (view === 'knowledge') {
    return h(KnowledgeView, { pluginState, pluginConfig, onAction });
  }
  if (view === 'github') {
    return h(GitHubView, { pluginState, pluginConfig, onAction });
  }
  if (view === 'marketplace') {
    return h(MarketplaceView, { pluginState, pluginConfig, onAction });
  }
  if (view === 'workflows') {
    return h(WorkflowsView, { pluginState, pluginConfig, onAction });
  }
  if (view === 'subagents') {
    return h(SubAgentsView, { pluginState, pluginConfig, onAction });
  }

  return h(EmptyState, { title: 'Unknown Legion view', body: `No renderer view is registered for "${view}".` });
}
