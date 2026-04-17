import type { PluginAPI } from './types.js';
import type { PluginConfig, PluginState } from './types.js';
import {
  SETTINGS_COMPONENT,
  PANEL_COMPONENT,
  PANEL_DEFINITIONS,
  BANNER_ID,
  BANNER_COMPONENT,
  THREAD_STATUS_ID,
} from './constants.js';

// ---------------------------------------------------------------------------
// Register all static UI elements (settings, panels, commands, nav items)
// ---------------------------------------------------------------------------

export function registerUi(api: PluginAPI): void {
  api.ui.registerSettingsSection({
    id: 'legion',
    label: 'Legion',
    component: SETTINGS_COMPONENT,
    priority: -4,
  });

  for (const panel of PANEL_DEFINITIONS) {
    api.ui.registerPanel({
      id: panel.id,
      component: PANEL_COMPONENT,
      title: panel.title,
      visible: true,
      width: panel.width as 'default' | 'wide' | 'full',
      props: {
        view: panel.view,
      },
    });
  }

  api.ui.registerCommand({
    id: 'legion-command-center',
    label: 'Legion Command Center',
    shortcut: 'mod+k',
    visible: true,
    priority: 20,
    target: { type: 'panel', panelId: 'operations' },
  });

  updateNavigationItems(api, (api.state.get() || {}) as PluginState);
}

// ---------------------------------------------------------------------------
// Navigation items (badges update on every state change)
// ---------------------------------------------------------------------------

export function updateNavigationItems(api: PluginAPI, state: PluginState): void {
  const stateRecord = state as Record<string, unknown>;
  const status = stateRecord.status as string | undefined;
  const unreadNotifications = Number(stateRecord.unreadNotificationCount || 0);
  const workflowCounts = (stateRecord.workflowCounts || {
    active: 0,
    needsInput: 0,
  }) as { active: number; needsInput: number };
  const dashboard = stateRecord.dashboard as Record<string, unknown> | null;
  const tasksSummary = dashboard?.tasksSummary as { running?: number } | undefined;

  for (const panel of PANEL_DEFINITIONS) {
    let badge: string | number | undefined = undefined;

    if (panel.id === 'dashboard' && (status === 'offline' || status === 'unconfigured')) {
      badge = '!';
    }
    if (panel.id === 'notifications' && unreadNotifications > 0) {
      badge = unreadNotifications;
    }
    if (panel.id === 'workflows') {
      const activeCount =
        Number(workflowCounts.active || 0) + Number(workflowCounts.needsInput || 0);
      if (activeCount > 0) badge = activeCount;
    }
    if (panel.id === 'subagents') {
      const runningTasks = Number(tasksSummary?.running || 0);
      if (runningTasks > 0) badge = runningTasks;
    }

    api.ui.registerNavigationItem({
      id: panel.navId,
      label: panel.title,
      icon: panel.icon,
      visible: true,
      priority: panel.priority,
      badge,
      target: { type: 'panel', panelId: panel.id },
    });
  }
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

export function updateBanner(
  api: PluginAPI,
  config: PluginConfig,
  state: PluginState,
): void {
  const stateRecord = state as Record<string, unknown>;

  if (!config.enabled) {
    api.ui.hideBanner(BANNER_ID);
    return;
  }

  if (stateRecord.status === 'unconfigured') {
    api.ui.showBanner({
      id: BANNER_ID,
      text: 'Legion is installed but not configured yet. Add the daemon URL and auth settings in Settings to enable health checks, events, and the optional backend.',
      variant: 'info',
      dismissible: true,
      visible: true,
    });
    return;
  }

  if (stateRecord.status === 'disabled') {
    api.ui.showBanner({
      id: BANNER_ID,
      text: 'Legion plugin is disabled.',
      variant: 'info',
      dismissible: true,
      visible: true,
    });
    return;
  }

  // Rich component banner for online, offline, and checking states
  const dashboard = stateRecord.dashboard as Record<string, unknown> | null;
  const workersSummary = dashboard?.workersSummary as { total?: number } | undefined;
  const gaia = dashboard?.gaia as Record<string, unknown> | null | undefined;
  const health = dashboard?.health as Record<string, unknown> | null | undefined;

  api.ui.showBanner({
    id: BANNER_ID,
    component: BANNER_COMPONENT,
    visible: true,
    props: {
      status: stateRecord.status as string || 'offline',
      gaiaMode: gaia?.mode as string || gaia?.tick_mode as string || '',
      uptime: health?.uptime_seconds as number ?? health?.uptime as number ?? undefined,
      workerCount: workersSummary?.total ?? 0,
      unreadNotifications: stateRecord.unreadNotificationCount as number ?? 0,
      serviceUrl: config.daemonUrl || '',
    },
  });
}

// ---------------------------------------------------------------------------
// Thread decoration (runtime status chip in the thread header)
// ---------------------------------------------------------------------------

export function updateThreadDecoration(
  api: PluginAPI,
  state: PluginState,
  config: PluginConfig,
): void {
  if (!config.enabled) {
    api.ui.hideThreadDecoration(THREAD_STATUS_ID);
    return;
  }

  const stateRecord = state as Record<string, unknown>;
  const status = stateRecord.status;
  const dashboard = stateRecord.dashboard as Record<string, unknown> | null;
  const gaia = dashboard?.gaia as Record<string, unknown> | null | undefined;
  const gaiaMode = gaia?.mode as string || gaia?.tick_mode as string || '';

  let label = 'Legion status unknown';
  let variant: 'info' | 'warning' | 'success' = 'info';

  if (!config.backendEnabled) {
    label = 'Legion backend disabled';
    variant = 'warning';
  } else if (status === 'online') {
    label = gaiaMode
      ? `Legion \u00b7 GAIA ${gaiaMode}`
      : 'Legion backend online';
    variant = gaiaMode === 'alert' ? 'warning' : 'success';
  } else if (status === 'offline') {
    label = 'Legion backend offline';
    variant = 'warning';
  } else if (status === 'checking') {
    label = 'Checking Legion backend';
  } else if (status === 'unconfigured') {
    label = 'Configure Legion to enable backend';
  }

  api.ui.showThreadDecoration({
    id: THREAD_STATUS_ID,
    label,
    variant,
    visible: true,
  });
}

// ---------------------------------------------------------------------------
// Conversation decoration
// ---------------------------------------------------------------------------

export function registerConversationDecoration(
  api: PluginAPI,
  conversationId: string,
  label = 'Legion',
): void {
  const variant = label.startsWith('GAIA') ? 'success' : 'info';
  api.ui.showConversationDecoration({
    id: `conversation:${conversationId}`,
    conversationId,
    label,
    variant,
    visible: true,
  });
}
