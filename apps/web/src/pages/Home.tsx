import React, { useState } from "react";
import {
  ApiError,
  USERNAME_PATTERN,
  USERNAME_RULE,
  guestLogin,
} from "../settings/api";

interface HomeProps {
  /** Called with the guest token after login. */
  onPlay: (token: string) => void;
}

export function Home({ onPlay }: HomeProps) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<null | string>(null);

  const play = async () => {
    const name = username.trim();
    // Check before the round trip so the rule is stated, not just enforced.
    if (name && !USERNAME_PATTERN.test(name)) {
      setError(`That name won't work — use ${USERNAME_RULE}`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await guestLogin(name || undefined);
      onPlay(res.token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(`That name won't work — use ${USERNAME_RULE}`);
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many sign-ins from your network. Wait a minute and retry.");
      } else {
        setError("Could not reach the server. Is it running?");
      }
      setBusy(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <h1 style={styles.title}>DEASHOT</h1>
      <p style={styles.subtitle}>8v8 browser Team Deathmatch · Phase 5</p>

      <div style={styles.form}>
        <input
          style={styles.input}
          placeholder={`player${Math.floor(Math.random() * 100000)}`}
          maxLength={16}
          value={username}
          aria-label="Username"
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") play();
          }}
        />
        <button onClick={play} disabled={busy} style={styles.play}>
          {busy ? "CONNECTING…" : "PLAY"}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 16,
  },
  title: {
    fontSize: 64,
    margin: 0,
    letterSpacing: 8,
  },
  subtitle: { opacity: 0.7, margin: 0 },
  form: { display: "flex", gap: 10, alignItems: "center" },
  input: {
    padding: "12px 14px",
    fontSize: 16,
    background: "rgba(30,30,60,0.9)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 8,
    outline: "none",
  },
  play: {
    padding: "12px 32px",
    fontSize: 18,
    cursor: "pointer",
    border: "none",
    borderRadius: 8,
    background: "#e94560",
    color: "#fff",
  },
  error: { color: "#ff8888", margin: 0 },
};