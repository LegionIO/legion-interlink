import { createCoreViews } from './core-views.mjs';
import { createIntegrationViews } from './integrations-views.mjs';
import { createLegionSettings } from './settings.mjs';
import { createRendererContext } from './shared.mjs';
import { createWorkflowsView } from './workflows.mjs';

/** @param {{ React: typeof import('react'), registerComponents: (name: string, components: Record<string, any>) => void }} api */
export function register(api) {
  const context = createRendererContext(api);
  const LegionSettings = createLegionSettings(context);
  const { DashboardView, NotificationsView, OperationsView } = createCoreViews(context);
  const { GitHubView, KnowledgeView, MarketplaceView } = createIntegrationViews(context);
  const WorkflowsView = createWorkflowsView(context);
  const { h, EmptyState } = context;

  function LegionWorkspace({ props, pluginState, pluginConfig, onAction }) {
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

    return h(EmptyState, { title: 'Unknown Legion view', body: `No renderer view is registered for "${view}".` });
  }

  api.registerComponents('legion', {
    LegionSettings,
    LegionWorkspace,
  });
}
