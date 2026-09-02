interface HomeProps {
  onPlay: () => void;
}

export function Home({ onPlay }: HomeProps) {
  return (
    <div style={styles.wrap}>
      <h1 style={styles.title}>DEASHOT</h1>
      <p style={styles.subtitle}>Browser FPS · Phase 0 Foundation</p>
      <button onClick={onPlay} style={styles.play}>
        PLAY (Connect)
      </button>
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
  subtitle: {
    opacity: 0.7,
    margin: 0,
  },
  play: {
    padding: "16px 48px",
    fontSize: 20,
    cursor: "pointer",
    border: "none",
    borderRadius: 8,
    background: "#e94560",
    color: "#fff",
  },
};
