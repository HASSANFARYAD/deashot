import React, { useState } from "react";
import type { ProfileSettings } from "../../settings/api";

interface PauseMenuProps {
  settings: ProfileSettings;
  onSaveSettings: (patch: Partial<ProfileSettings>) => void;
  onResume: () => void;
  onLeave: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  settings,
  onSaveSettings,
  onResume,
  onLeave,
}) => {
  const [view, setView] = useState<"menu" | "settings">("menu");

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        {view === "menu" ? (
          <>
            <h2 style={styles.title}>PAUSED</h2>
            <div style={styles.btnRow}>
              <button style={styles.btn} onClick={onResume}>RESUME</button>
              <button style={styles.btn} onClick={() => setView("settings")}>SETTINGS</button>
              <button style={{ ...styles.btn, ...styles.danger }} onClick={onLeave}>LEAVE MATCH</button>
            </div>
          </>
        ) : (
          <SettingsPanel
            settings={settings}
            onSave={onSaveSettings}
            onBack={() => setView("menu")}
          />
        )}
      </div>
    </div>
  );
};

interface SettingsPanelProps {
  settings: ProfileSettings;
  onSave: (patch: Partial<ProfileSettings>) => void;
  onBack: () => void;
}

const COLOR_OPTIONS = ["#00ff00", "#ff5555", "#ffff00", "#00ffff", "#ffffff"];

function SettingsPanel({ settings, onSave, onBack }: SettingsPanelProps) {
  const set = (patch: Partial<ProfileSettings>) => {
    onSave(patch);
  };

  return (
    <>
      <h2 style={styles.title}>SETTINGS</h2>
      <div style={styles.field}>
        <label style={styles.label}>Mouse sensitivity · {settings.sensitivity.toFixed(2)}x</label>
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={settings.sensitivity}
          style={styles.range}
          onChange={(e) => set({ sensitivity: Number(e.target.value) })}
        />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Master volume · {Math.round(settings.volume * 100)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          style={styles.range}
          onChange={(e) => set({ volume: Number(e.target.value) })}
        />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Crosshair color</label>
        <div style={styles.swatches}>
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              style={{
                ...styles.swatch,
                background: c,
                outline: settings.crosshairColor === c ? "2px solid #fff" : "none",
              }}
              onClick={() => set({ crosshairColor: c })}
            />
          ))}
        </div>
      </div>
      <button style={styles.btn} onClick={onBack}>BACK</button>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(5,5,15,0.72)",
    zIndex: 400,
  },
  card: {
    background: "rgba(20,20,40,0.96)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: "28px 40px",
    minWidth: 340,
    textAlign: "center",
  },
  title: { margin: 0, letterSpacing: 4 },
  btnRow: { display: "flex", flexDirection: "column", gap: 12, marginTop: 20 },
  btn: {
    padding: "12px 24px",
    fontSize: 15,
    cursor: "pointer",
    border: "none",
    borderRadius: 8,
    background: "#3a4a7a",
    color: "#fff",
  },
  danger: { background: "#a33", color: "#fff" },
  field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, alignItems: "flex-start" },
  label: { fontSize: 14 },
  range: { width: "100%" },
  swatches: { display: "flex", gap: 8 },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    cursor: "pointer",
    border: "none",
  },
};