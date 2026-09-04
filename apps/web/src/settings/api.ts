export interface ProfileSettings {
  sensitivity: number;
  volume: number;
  crosshairColor: string;
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  sensitivity: 1.0,
  volume: 1.0,
  crosshairColor: "#00ff00",
};

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

export interface GuestLogin {
  token: string;
  username: string;
  sub: string;
}

export async function guestLogin(username?: string): Promise<GuestLogin> {
  const res = await fetch(`${API_URL}/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username || undefined }),
  });
  if (!res.ok) throw new Error(`Guest login failed (${res.status})`);
  return res.json();
}

export async function fetchSettings(token: string): Promise<ProfileSettings> {
  const res = await fetch(`${API_URL}/profile/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
  return res.json();
}

export async function updateSettings(
  token: string,
  patch: Partial<ProfileSettings>
): Promise<ProfileSettings> {
  const res = await fetch(`${API_URL}/profile/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to save settings (${res.status})`);
  return res.json();
}