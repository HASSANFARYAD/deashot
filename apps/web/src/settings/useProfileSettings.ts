import { useEffect, useState, useCallback } from "react";
import {
  DEFAULT_SETTINGS,
  fetchSettings,
  updateSettings,
} from "./api";
import type { ProfileSettings } from "./api";

/**
 * Loads the guest's backend profile settings on mount and exposes a save fn.
 * Until loaded it reports defaults so the app is usable offline/loading.
 */
export function useProfileSettings(token?: string) {
  const [settings, setSettings] = useState<ProfileSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchSettings(token)
      .then((s) => {
        if (active) setSettings({ ...DEFAULT_SETTINGS, ...s });
      })
      .catch(() => {
        /* keep defaults if the API is unavailable */
      });
    return () => {
      active = false;
    };
  }, [token]);

  const save = useCallback(
    (patch: Partial<ProfileSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      if (token) updateSettings(token, patch).catch(() => {});
    },
    [token]
  );

  return { settings, save };
}