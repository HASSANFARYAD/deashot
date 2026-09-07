import React from "react"

interface DamageIndicatorProps {
  visible: boolean
  amount: number
  headshot: boolean
  /** Radians, 0 = in front, positive = clockwise (right). */
  bearing?: number
}

const WEDGE_RADIUS = 40
const WEDGE_HALF_ANGLE = Math.PI / 6
const CX = 60
const CY = 60

function polar(cx: number, cy: number, r: number, theta: number) {
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) }
}

export const DamageIndicator: React.FC<DamageIndicatorProps> = ({
  visible,
  amount,
  headshot,
  bearing = 0,
}) => {
  if (!visible) return null

  const a = polar(CX, CY, WEDGE_RADIUS, -Math.PI / 2 - WEDGE_HALF_ANGLE)
  const b = polar(CX, CY, WEDGE_RADIUS, -Math.PI / 2 + WEDGE_HALF_ANGLE)
  const wedgePath =
    `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} ` +
    `A ${WEDGE_RADIUS} ${WEDGE_RADIUS} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)} ` +
    `L ${CX} ${CY} Z`
  const bearingDeg = (bearing * 180) / Math.PI

  return (
    <div style={styles.overlay}>
      <div style={styles.vignette} />
      <svg width="120" height="120" style={styles.arc} viewBox="0 0 120 120">
        <path
          d={wedgePath}
          fill="rgba(255, 40, 40, 0.85)"
          transform={`rotate(${bearingDeg.toFixed(1)} ${CX} ${CY})`}
        />
      </svg>
      <div style={styles.damageText}>
        -{amount}
        {headshot && <span style={styles.headshot}> HEADSHOT</span>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse at center, rgba(255,0,0,0) 55%, rgba(255,0,0,0.22) 100%)",
  },
  arc: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  },
  damageText: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    color: "#ff3333",
    fontSize: 28,
    fontWeight: "bold",
    textShadow: "0 0 6px rgba(255,0,0,0.8)",
    fontFamily: "monospace",
  },
  headshot: {
    color: "#ffaa00",
    fontSize: 18,
    marginLeft: 6,
  },
}