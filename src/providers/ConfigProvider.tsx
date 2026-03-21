import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { legion } from '@/lib/ipc-client';

type LegionConfig = Record<string, unknown>;

type ConfigContextValue = {
  config: LegionConfig | null;
  updateConfig: (path: string, value: unknown) => Promise<void>;
};

const ConfigContext = createContext<ConfigContextValue>({
  config: null,
  updateConfig: async () => {},
});

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LegionConfig | null>(null);

  useEffect(() => {
    try {
      // Load initial config
      legion.config.get()
        .then((cfg) => setConfig(cfg as LegionConfig))
        .catch((err) => console.error('[Config] Failed to load:', err));

      // Listen for config changes
      const unsubscribe = legion.config.onChanged((cfg) => {
        setConfig(cfg as LegionConfig);
      });

      return unsubscribe;
    } catch (err) {
      console.error('[Config] IPC bridge not available:', err);
    }
  }, []);

  const updateConfig = async (path: string, value: unknown) => {
    try {
      const updated = await legion.config.set(path, value);
      setConfig(updated as LegionConfig);
    } catch (err) {
      console.error('[Config] Failed to update:', err);
    }
  };

  return (
    <ConfigContext.Provider value={{ config, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}
