import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MatrixRain } from '@/components/ui/MatrixRain'
import { usePageVisible } from '@/hooks/usePageVisible'

// --- Matrix-themed design tokens (space lobster palette) ---
const COLORS = {
  matrixGreen: '#33cc55',
  matrixDim: '#1a6630',
  lobsterRed: '#cc2200',
  lobsterOrange: '#ff6b35',
  void: '#060606',
  panel: '#0a0e0a',
  textMuted: '#4d8a4d',
  textSecondary: '#5a9a5a',
  helmet: '#c0c8d0',
  white: '#ffffff',
}

const RGB = {
  green: [51, 204, 85],
  orange: [255, 107, 53],
  red: [204, 34, 0],
}

// --- Color interpolation (matrix green → lobster orange → lobster red) ---
function lerpColor(pct: number): string {
  const p = Math.max(0, Math.min(100, pct))
  let r: number, g: number, b: number

  if (p <= 50) {
    const t = p / 50
    r = RGB.green[0] + (RGB.orange[0] - RGB.green[0]) * t
    g = RGB.green[1] + (RGB.orange[1] - RGB.green[1]) * t
    b = RGB.green[2] + (RGB.orange[2] - RGB.green[2]) * t
  } else {
    const t = (p - 50) / 50
    r = RGB.orange[0] + (RGB.red[0] - RGB.orange[0]) * t
    g = RGB.orange[1] + (RGB.red[1] - RGB.orange[1]) * t
    b = RGB.orange[2] + (RGB.red[2] - RGB.orange[2]) * t
  }

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

/** Format a reset timestamp in the viewer's time zone */
function formatResetCT(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Compute countdown string from a reset timestamp */
function getCountdown(resetAt: string): string {
  const ms = new Date(resetAt).getTime() - Date.now()
  if (ms <= 0) return 'Resetting...'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `Resets in ${h}h ${m}m`
}

/** Format total seconds as Xd HH:MM:SS or HH:MM:SS */
function formatCountdownSec(totalSec: number): string {
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const hms = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return d > 0 ? `${d}d ${hms}` : hms
}

interface UsageWindow {
  utilization: number
  resets_at: string | null
}

interface LiveUsage {
  ok: boolean
  five_hour: UsageWindow
  seven_day: UsageWindow
  seven_day_sonnet?: UsageWindow | null
  error?: string
}

// --- Particle system ---
interface Particle {
  id: number
  x: number
  dx: number
  dy: number
  peak: number
  size: number
  color: string
  duration: number
  delay: number
  rotation: number
  isSharp: boolean
}

function generateParticles(count = 50, intense = false): Particle[] {
  const normalColors = [
    COLORS.matrixGreen,
    COLORS.lobsterOrange,
    COLORS.lobsterRed,
    COLORS.white,
    COLORS.matrixGreen,
    COLORS.lobsterRed,
    COLORS.matrixDim,
    COLORS.lobsterOrange,
  ]
  const intenseColors = [
    COLORS.lobsterRed,
    COLORS.lobsterRed,
    COLORS.lobsterOrange,
    COLORS.lobsterRed,
    COLORS.white,
    COLORS.lobsterOrange,
    COLORS.lobsterRed,
    COLORS.lobsterRed,
  ]
  const colors = intense ? intenseColors : normalColors
  const particles: Particle[] = []

  for (let i = 0; i < count; i++) {
    const angle = -60 + Math.random() * 300
    const angleRad = (angle * Math.PI) / 180
    const speed = intense ? 120 + Math.random() * 340 : 80 + Math.random() * 220
    const upwardBias = intense ? -130 - Math.random() * 210 : -100 - Math.random() * 160

    const dx = Math.cos(angleRad) * speed
    const dy = upwardBias + speed * 0.35
    const peak = upwardBias - 30 - Math.random() * (intense ? 80 : 50)

    particles.push({
      id: i,
      x: (Math.random() - 0.5) * (intense ? 36 : 24),
      dx,
      dy,
      peak,
      size:
        Math.random() < 0.15
          ? intense
            ? 3 + Math.random() * 5
            : 2 + Math.random() * 2
          : intense
            ? 6 + Math.random() * 13
            : 4 + Math.random() * 7,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: intense ? 1.3 + Math.random() * 1.4 : 1.0 + Math.random() * 1.2,
      delay: Math.random() * (intense ? 0.3 : 0.2),
      rotation: Math.random() * 720 - 360,
      isSharp: Math.random() < (intense ? 0.4 : 0.3),
    })
  }

  return particles
}

// --- CSS keyframes ---
const ANIMATION_CSS = `
@keyframes particle-burst {
  0% {
    transform: translate(var(--x), 0px) scale(1) rotate(0deg);
    opacity: 1;
  }
  35% {
    transform: translate(calc(var(--x) + var(--dx) * 0.5), var(--peak)) scale(0.8) rotate(calc(var(--rot) * 0.35));
    opacity: 0.85;
  }
  100% {
    transform: translate(calc(var(--x) + var(--dx)), var(--dy)) scale(0.05) rotate(var(--rot));
    opacity: 0;
  }
}

@keyframes explosion-flash {
  0% { opacity: 0.9; transform: scale(0.6); }
  25% { opacity: 1; transform: scale(1.4); }
  100% { opacity: 0; transform: scale(2.5); }
}

@keyframes container-shake {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-5px, -3px); }
  20% { transform: translate(6px, 2px); }
  30% { transform: translate(-3px, 5px); }
  40% { transform: translate(5px, -2px); }
  50% { transform: translate(-2px, 3px); }
  60% { transform: translate(4px, -4px); }
  70% { transform: translate(-5px, 2px); }
  80% { transform: translate(3px, -2px); }
}

@keyframes pre-explosion-tremble {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-1.5px, 0.5px); }
  50% { transform: translate(1.5px, -1px); }
  75% { transform: translate(-0.5px, 1.5px); }
}

@keyframes refuel-pulse {
  0%, 100% { box-shadow: 0 0 8px var(--glow), 0 0 20px rgba(51, 204, 85, 0.05); border-color: var(--glow); }
  50% { box-shadow: 0 0 24px var(--glow), 0 0 50px rgba(51, 204, 85, 0.12); border-color: var(--glow); }
}

@keyframes fade-in-up {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes fade-in-only {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes refuel-fade-in {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes lobster-reveal {
  0% { opacity: 0.15; filter: brightness(0.6); }
  100% { opacity: 0.7; filter: brightness(1); }
}

@keyframes weekly-tremble {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20%  { transform: translate(-1.2px, 0.4px) rotate(-0.3deg); }
  40%  { transform: translate(1px, -0.5px) rotate(0.25deg); }
  60%  { transform: translate(-0.7px, 0.8px) rotate(-0.2deg); }
  80%  { transform: translate(0.5px, -0.3px) rotate(0.1deg); }
}

@keyframes thermo-drip {
  0%   { transform: translateY(-4px); opacity: 0; }
  12%  { opacity: 0.85; }
  75%  { transform: translateY(58px); opacity: 0.7; }
  100% { transform: translateY(78px); opacity: 0; }
}

`

// --- Explosion Effect ---
function ExplosionEffect({ onSettled, intense = false }: { onSettled: () => void; intense?: boolean }) {
  'use no memo'
  const [particles] = useState(() => generateParticles(intense ? 80 : 50, intense))

  useEffect(() => {
    const timer = setTimeout(onSettled, intense ? 3000 : 2500)
    return () => clearTimeout(timer)
  }, [onSettled, intense])

  return (
    <>
      {/* Flash: main radial burst */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '25%',
          width: intense ? '520px' : '350px',
          height: intense ? '520px' : '350px',
          marginLeft: intense ? '-260px' : '-175px',
          marginTop: intense ? '-260px' : '-175px',
          borderRadius: '50%',
          background: intense
            ? 'radial-gradient(circle, rgba(204,34,0,0.95) 0%, rgba(255,107,53,0.5) 30%, rgba(51,204,85,0.1) 65%, transparent 80%)'
            : 'radial-gradient(circle, rgba(51,204,85,0.6) 0%, rgba(204,34,0,0.3) 40%, transparent 70%)',
          animation: `explosion-flash ${intense ? '0.85s' : '0.6s'} ease-out forwards`,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
      {/* Second expanding ring: weekly only */}
      {intense && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '25%',
            width: '280px',
            height: '280px',
            marginLeft: '-140px',
            marginTop: '-140px',
            borderRadius: '50%',
            border: '3px solid rgba(204, 34, 0, 0.7)',
            background: 'transparent',
            animation: 'explosion-flash 1.1s ease-out forwards 0.15s',
            pointerEvents: 'none',
            zIndex: 9,
          }}
        />
      )}

      {/* Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          style={
            {
              position: 'absolute',
              left: '50%',
              top: '25%',
              width: p.isSharp ? p.size * 0.5 : p.size,
              height: p.isSharp ? p.size * 2.5 : p.size,
              borderRadius: p.isSharp ? '2px' : '50%',
              backgroundColor: p.color,
              boxShadow: `0 0 ${p.size}px ${p.color}`,
              willChange: 'transform, opacity',
              animation: `particle-burst ${p.duration}s ease-out ${p.delay}s forwards`,
              opacity: 0,
              '--x': `${p.x}px`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--peak': `${p.peak}px`,
              '--rot': `${p.rotation}deg`,
              pointerEvents: 'none',
              zIndex: 5,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  )
}

// --- Thermometer SVG ---
function Thermometer({ percent, color, busted = false }: { percent: number; color: string; busted?: boolean }) {
  // Two gauges share a page, so SVG ids must be unique per instance.
  const uid = useId().replace(/:/g, '')
  const glowId = `liquidGlow-${uid}`
  const gradId = `liquidGrad-${uid}`
  const highlightId = `glassHighlight-${uid}`
  const w = 56
  const h = 220
  const tubeW = 28
  const tubeR = tubeW / 2
  const bulbR = 26
  const bulbCY = h - bulbR - 4
  const tubeTop = 12
  const tubeBot = bulbCY - bulbR + 4
  const tubeH = tubeBot - tubeTop
  const fillH = (Math.min(100, Math.max(0, percent)) / 100) * tubeH
  const fillTop = tubeBot - fillH

  const ticks = [25, 50, 75].map((p) => ({
    y: tubeBot - (p / 100) * tubeH,
    label: `${p}`,
  }))

  return (
    <svg width={w + 32} height={h} viewBox={`-16 0 ${w + 32} ${h}`} className="mx-auto">
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id={highlightId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.08" />
          <stop offset="50%" stopColor="white" stopOpacity="0.03" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Tube background */}
      <rect
        x={(w - tubeW) / 2}
        y={tubeTop}
        width={tubeW}
        height={tubeH}
        rx={tubeR}
        fill={COLORS.panel}
        stroke="rgba(51, 204, 85, 0.06)"
        strokeWidth="1"
      />

      {/* Liquid fill */}
      <rect
        x={(w - tubeW) / 2 + 1}
        y={fillTop}
        width={tubeW - 2}
        height={fillH + tubeR}
        rx={tubeR - 1}
        fill={`url(#${gradId})`}
      />

      {/* Liquid surface glow */}
      {percent > 2 && (
        <line
          x1={(w - tubeW) / 2 + 4}
          y1={fillTop + 2}
          x2={(w + tubeW) / 2 - 4}
          y2={fillTop + 2}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          opacity="0.9"
        />
      )}

      {/* Glass highlight */}
      <rect x={(w - tubeW) / 2} y={tubeTop} width={tubeW / 2} height={tubeH} rx={tubeR} fill={`url(#${highlightId})`} />

      {/* Busted top: jagged break, crack lines, animated drips */}
      {busted && (
        <>
          {/* Jagged break across tube top */}
          <path
            d="M14,12 L17,8 L21,13 L25,7 L28,11 L32,7 L36,12 L39,8 L42,12"
            stroke={color}
            strokeWidth="1.8"
            fill="none"
            opacity="0.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Crack spider: left */}
          <line x1="20" y1="10" x2="17" y2="3" stroke={color} strokeWidth="0.9" opacity="0.55" />
          <line x1="17" y1="3" x2="14" y2="6" stroke={color} strokeWidth="0.7" opacity="0.35" />
          {/* Crack spider: right */}
          <line x1="34" y1="9" x2="38" y2="2" stroke={color} strokeWidth="0.9" opacity="0.5" />
          <line x1="38" y1="2" x2="41" y2="5" stroke={color} strokeWidth="0.7" opacity="0.3" />
          {/* Drip #1: center-right, falls into liquid */}
          <ellipse
            cx={w / 2 + 4}
            cy={tubeTop}
            rx={2}
            ry={4}
            fill={COLORS.lobsterOrange}
            opacity="0"
            style={{ animation: 'thermo-drip 2.8s ease-in infinite 0.4s' }}
          />
          {/* Drip #2: center-left, offset timing */}
          <ellipse
            cx={w / 2 - 4}
            cy={tubeTop}
            rx={1.5}
            ry={3}
            fill={COLORS.lobsterOrange}
            opacity="0"
            style={{ animation: 'thermo-drip 3.4s ease-in infinite 1.7s' }}
          />
        </>
      )}

      {/* Bulb */}
      <circle cx={w / 2} cy={bulbCY} r={bulbR} fill={COLORS.panel} stroke="rgba(51, 204, 85, 0.06)" strokeWidth="1" />
      <circle cx={w / 2} cy={bulbCY} r={bulbR - 2} fill={color} opacity="0.85" />
      <circle cx={w / 2} cy={bulbCY} r={bulbR + 5} fill="none" stroke={color} strokeWidth="1" opacity="0.12" />

      {/* Tick marks */}
      {ticks.map((t) => (
        <g key={t.label}>
          <line
            x1={(w + tubeW) / 2 + 3}
            y1={t.y}
            x2={(w + tubeW) / 2 + 8}
            y2={t.y}
            stroke={COLORS.textMuted}
            strokeWidth="1"
          />
          <text
            x={(w + tubeW) / 2 + 11}
            y={t.y + 3}
            fill={COLORS.textMuted}
            fontSize="9"
            fontFamily="'JetBrains Mono', monospace"
          >
            {t.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

// --- Lobster Portrait (framed, not background) ---
function LobsterPortrait({ glowing = false }: { glowing?: boolean }) {
  return (
    <div
      style={{
        width: '260px',
        height: '200px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${glowing ? 'rgba(51, 204, 85, 0.4)' : 'rgba(51, 204, 85, 0.15)'}`,
        boxShadow: glowing
          ? `0 0 20px rgba(51, 204, 85, 0.12), 0 0 40px rgba(51, 204, 85, 0.04), inset 0 0 20px rgba(51, 204, 85, 0.03)`
          : `0 0 12px rgba(51, 204, 85, 0.05), inset 0 0 12px rgba(51, 204, 85, 0.02)`,
        transition: 'box-shadow 0.8s ease, border-color 0.8s ease',
      }}
    >
      <img
        src="./lobster.png"
        alt="Space Lobster"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  )
}

// --- Glass Info Panel ---
function InfoPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'rgba(8, 12, 8, 0.8)',
        border: '1px solid rgba(51, 204, 85, 0.08)',
        borderRadius: '12px',
        padding: '20px 24px',
        backdropFilter: 'blur(8px)',
        width: '260px',
      }}
    >
      {children}
    </div>
  )
}

// ============================================================
// OpenAI (Codex) fuel: local only. Codex has no usage API for a plan, but every Codex
// session log records the plan's rate-limit window, so this reads the newest snapshot
// through /api/codex-limits. It is as fresh as the last Codex response, not live.
// ============================================================
interface CodexWindow {
  usedPercent: number | null
  windowMinutes: number | null
  resetsAt: string | null
}

interface CodexLimits {
  ok: boolean
  capturedAt: string
  planType: string | null
  primary: CodexWindow | null
  secondary: CodexWindow | null
  limitReached: string | null
}

function windowLabel(minutes: number | null): string {
  if (minutes === 300) return '5-Hour'
  if (minutes === 10080) return 'Weekly'
  if (minutes === null) return 'Window'
  return minutes % 1440 === 0 ? `${minutes / 1440}-Day` : `${Math.round(minutes / 60)}-Hour`
}

function formatAsOf(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

function buildCodexPreview(mode: string | null): CodexLimits | null {
  if (mode !== 'openai-limit' && mode !== 'openai') return null
  const now = Date.now()
  const limited = mode === 'openai-limit'
  return {
    ok: true,
    capturedAt: new Date(now - 4 * 60000).toISOString(),
    planType: 'preview',
    primary: {
      usedPercent: limited ? 100 : 62,
      windowMinutes: 10080,
      resetsAt: new Date(now + (limited ? 2.2 : 3.5) * 86400000).toISOString(),
    },
    secondary: {
      usedPercent: limited ? 100 : 38,
      windowMinutes: 300,
      resetsAt: new Date(now + 3 * 3600000).toISOString(),
    },
    limitReached: limited ? 'primary' : null,
  }
}

function CodexFuelPanel({ preview }: { preview: CodexLimits | null }) {
  'use no memo'
  const visible = usePageVisible()
  const [limits, setLimits] = useState<CodexLimits | null>(preview)
  const [unavailable, setUnavailable] = useState(false)
  const [exploding, setExploding] = useState(false)
  const [, setTick] = useState(0)
  const wasLimited = useRef<boolean | null>(null)

  const fetchLimits = useCallback(async () => {
    if (preview) return
    try {
      const res = await fetch('/api/codex-limits')
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setLimits(data)
      setUnavailable(false)
    } catch {
      setUnavailable(true)
    }
  }, [preview])

  useEffect(() => {
    if (!visible) return
    fetchLimits()
    const id = setInterval(fetchLimits, 60_000)
    return () => clearInterval(id)
  }, [fetchLimits, visible])

  const primary = limits?.primary ?? null
  const pct = Math.min(100, primary?.usedPercent ?? 0)
  const limited = !!limits && (limits.limitReached !== null || pct >= 100)

  // Explode on the transition into a limit, not on page load while already limited.
  useEffect(() => {
    if (!limits) return
    if (wasLimited.current === false && limited) setExploding(true)
    wasLimited.current = limited
  }, [limits, limited])

  // 1s countdown tick only while limited.
  useEffect(() => {
    if (!limited || !visible) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [limited, visible])

  const settle = useCallback(() => setExploding(false), [])

  if (unavailable && !limits) return null
  if (!limits) return null

  const color = limited ? COLORS.lobsterRed : lerpColor(pct)
  const resetSec = primary?.resetsAt
    ? Math.max(0, Math.ceil((new Date(primary.resetsAt).getTime() - Date.now()) / 1000))
    : 0
  const secondary = limits.secondary
  const secondaryPct = Math.min(100, secondary?.usedPercent ?? 0)

  return (
    <div style={{ position: 'relative' }}>
      <InfoPanel>
        <h1
          className="text-sm uppercase tracking-[0.2em] text-center mb-4"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            color: COLORS.matrixGreen,
            opacity: 0.7,
            textShadow: `0 0 10px rgba(51, 204, 85, 0.15)`,
          }}
        >
          OpenAI Fuel
        </h1>
        <div
          className="flex flex-col items-center"
          style={{ animation: !limited && pct > 85 ? 'pre-explosion-tremble 0.08s linear infinite' : undefined }}
        >
          <Thermometer percent={limited ? 100 : pct} color={color} busted={limited} />
          <div className="text-center -mt-1">
            <span
              className="text-4xl font-semibold"
              style={{ color, fontFamily: "'Unbounded', sans-serif", textShadow: `0 0 14px ${color}` }}
            >
              {limited ? '100%' : `${Math.round(pct)}%`}
            </span>
            <p className="text-xs mt-1.5 uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
              {limited ? 'Limit Reached' : `${windowLabel(primary?.windowMinutes ?? null)} Window`}
            </p>
          </div>
          <p className="text-xs mt-2" style={{ color: limited ? COLORS.lobsterOrange : COLORS.textMuted }}>
            {limited
              ? resetSec > 0
                ? formatCountdownSec(resetSec)
                : 'Resetting...'
              : primary?.resetsAt
                ? `Resets ${formatResetCT(primary.resetsAt)}`
                : 'No reset time'}
          </p>
        </div>

        {secondary && (
          <>
            <div className="w-full h-px my-4" style={{ background: 'rgba(51, 204, 85, 0.06)' }} />
            <div className="flex justify-between text-xs mb-1.5">
              <span style={{ color: COLORS.textMuted }}>{windowLabel(secondary.windowMinutes).toUpperCase()}</span>
              <span style={{ color: lerpColor(secondaryPct) }}>{secondaryPct.toFixed(0)}%</span>
            </div>
            <div
              className="h-2.5 rounded-full overflow-hidden"
              style={{ background: COLORS.panel, border: '1px solid rgba(51, 204, 85, 0.05)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${secondaryPct}%`,
                  backgroundColor: lerpColor(secondaryPct),
                  opacity: 0.85,
                  transition: 'width 0.8s ease',
                }}
              />
            </div>
          </>
        )}

        <p className="text-[11px] text-center mt-3" style={{ color: COLORS.textMuted }}>
          as of {formatAsOf(limits.capturedAt)}
          {unavailable ? ' (stale)' : ''}
        </p>
      </InfoPanel>
      {exploding && <ExplosionEffect onSettled={settle} />}
    </div>
  )
}

// ============================================================
// Demo Widget: deployed site animated demo
// ============================================================
function DemoWidget() {
  'use no memo'
  const visible = usePageVisible()
  const [phase, setPhase] = useState<'filling' | 'exploding' | 'settled'>('filling')
  const [fillPct, setFillPct] = useState(0)
  const [shaking, setShaking] = useState(false)
  const [countdownSec, setCountdownSec] = useState(10)
  const [countdownDone, setCountdownDone] = useState(false)
  const rafRef = useRef<number>(0)

  // 10-second countdown when settled
  useEffect(() => {
    if (phase !== 'settled' || !visible) return
    setCountdownSec(10)
    setCountdownDone(false)
    const id = setInterval(() => {
      setCountdownSec((s) => {
        if (s <= 1) {
          clearInterval(id)
          setCountdownDone(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'filling' || !visible) return

    setFillPct(0)
    const duration = 5000
    let startTime: number | null = null

    const delay = setTimeout(() => {
      const animate = (now: number) => {
        if (startTime === null) startTime = now
        const elapsed = now - startTime
        const progress = Math.min(1, elapsed / duration)
        const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - (-2 * progress + 2) ** 3 / 2
        setFillPct(eased * 100)

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate)
        } else {
          // Hold at 100% for 5 seconds before exploding
          setTimeout(() => {
            setPhase('exploding')
            setShaking(true)
            setTimeout(() => setShaking(false), 500)
          }, 5000)
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }, 800)

    return () => {
      clearTimeout(delay)
      cancelAnimationFrame(rafRef.current)
    }
  }, [phase])

  const handleReset = () => {
    setPhase('filling')
  }

  const handleExplosionSettled = useCallback(() => {
    setPhase('settled')
  }, [])

  const color = lerpColor(fillPct)
  const trembling = phase === 'filling' && fillPct > 85
  const demoOpenAIPct = phase === 'filling' ? fillPct * 0.62 : 62

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 select-none overflow-hidden"
      style={{
        background: COLORS.void,
        fontFamily: "'JetBrains Mono', monospace",
        position: 'relative',
        animation: shaking ? 'container-shake 0.5s ease-out' : undefined,
      }}
    >
      <style>{ANIMATION_CSS}</style>
      <MatrixRain opacity={0.3} />

      {/* Always visible: these are simulated limits, not anyone's real usage */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.2em] px-3 py-1 rounded"
        style={{
          zIndex: 3,
          color: COLORS.lobsterOrange,
          border: '1px solid rgba(255, 107, 53, 0.4)',
          background: 'rgba(6, 6, 6, 0.8)',
        }}
      >
        Demo: simulated limits
      </div>
      <a
        href="./"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.15em] px-4 py-1.5 rounded"
        style={{
          zIndex: 3,
          color: COLORS.matrixGreen,
          border: '1px solid rgba(51, 204, 85, 0.3)',
          textDecoration: 'none',
        }}
      >
        Dashboard
      </a>

      {/* Content layer: relative container, lobster + panel are the fixed anchor */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {/* FIXED anchor: lobster + panel: these never move */}
        <div className="flex flex-col items-center" style={{ gap: '28px' }}>
          <LobsterPortrait glowing={phase === 'settled'} />

          <InfoPanel>
            <h1
              className="text-sm uppercase tracking-[0.2em] text-center mb-4"
              style={{
                fontFamily: "'Unbounded', sans-serif",
                color: COLORS.matrixGreen,
                opacity: 0.7,
                textShadow: `0 0 10px rgba(51, 204, 85, 0.15)`,
              }}
            >
              Fuel
            </h1>
            <div
              className="flex flex-col items-center"
              style={{
                animation: trembling ? 'pre-explosion-tremble 0.08s linear infinite' : undefined,
              }}
            >
              <Thermometer
                percent={phase === 'settled' ? 100 : fillPct}
                color={phase === 'settled' ? COLORS.lobsterRed : color}
                busted={phase === 'settled'}
              />

              <div className="text-center -mt-1">
                <span
                  className="text-4xl font-semibold"
                  style={{
                    color: phase === 'settled' ? COLORS.lobsterRed : color,
                    fontFamily: "'Unbounded', sans-serif",
                    textShadow: phase === 'settled' ? `0 0 14px ${COLORS.lobsterRed}` : `0 0 14px ${color}`,
                  }}
                >
                  {phase === 'settled' ? '100%' : `${Math.round(fillPct)}%`}
                </span>
                <p className="text-xs mt-1.5 uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
                  {phase === 'filling' ? 'Fueling up...' : phase === 'exploding' ? 'OVERLOAD!' : 'Depleted'}
                </p>
              </div>
            </div>

            {/* OpenAI gauge (demo): fills slower than Claude and never tips over */}
            <div className="w-full h-px my-4" style={{ background: 'rgba(51, 204, 85, 0.06)' }} />
            <div className="flex justify-between text-xs mb-1.5">
              <span style={{ color: COLORS.textMuted }}>OPENAI</span>
              <span style={{ color: lerpColor(demoOpenAIPct) }}>{Math.round(demoOpenAIPct)}%</span>
            </div>
            <div
              className="h-2.5 rounded-full overflow-hidden"
              style={{ background: COLORS.panel, border: '1px solid rgba(51, 204, 85, 0.05)' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${demoOpenAIPct}%`, backgroundColor: lerpColor(demoOpenAIPct), opacity: 0.85 }}
              />
            </div>
          </InfoPanel>
        </div>

        {/* FLOATING: countdown timer: absolute, above lobster */}
        {phase === 'settled' && (
          <div
            style={{
              position: 'absolute',
              top: '-80px',
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              animation: 'fade-in-only 0.6s ease-out',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: '2.6rem',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.04em',
                lineHeight: 1,
                color: countdownDone ? COLORS.matrixGreen : COLORS.lobsterOrange,
                textShadow: countdownDone ? '0 0 24px rgba(51, 204, 85, 0.5)' : '0 0 24px rgba(255, 107, 53, 0.5)',
                transition: 'color 0.4s ease, text-shadow 0.4s ease',
              }}
            >
              {countdownDone ? 'READY' : `00:00:${countdownSec.toString().padStart(2, '0')}`}
            </div>
            <p
              style={{
                textTransform: 'uppercase',
                marginTop: '8px',
                fontSize: '10px',
                letterSpacing: '0.2em',
                color: countdownDone ? 'rgba(51, 204, 85, 0.65)' : 'rgba(255, 107, 53, 0.65)',
                transition: 'color 0.4s ease',
              }}
            >
              {countdownDone ? 'Session Reset' : 'Session Limit'}
            </p>
          </div>
        )}

        {/* FLOATING: refuel button: absolute, below the panel */}
        {phase === 'settled' && countdownDone && (
          <div
            style={{
              position: 'absolute',
              bottom: '-60px',
              left: '50%',
              transform: 'translateX(-50%)',
              animation: 'fade-in-only 0.8s ease-out',
            }}
          >
            <button
              type="button"
              onClick={handleReset}
              style={
                {
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: '11px',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: COLORS.matrixGreen,
                  border: `1px solid ${COLORS.matrixGreen}`,
                  borderRadius: '4px',
                  padding: '9px 28px',
                  background: 'rgba(51, 204, 85, 0.07)',
                  cursor: 'pointer',
                  animation: 'refuel-pulse 2s ease-in-out infinite',
                  '--glow': 'rgba(51, 204, 85, 0.4)',
                } as React.CSSProperties
              }
            >
              ⚡ REFUEL
            </button>
          </div>
        )}

        {/* Explosion particles */}
        {phase === 'exploding' && <ExplosionEffect onSettled={handleExplosionSettled} />}
      </div>
    </div>
  )
}

// ============================================================
// Live Widget: local dev with real-time OAuth data
// ============================================================
function LiveWidget({
  initialData,
  codexPreview = null,
}: {
  initialData: LiveUsage
  codexPreview?: CodexLimits | null
}) {
  'use no memo'
  const visible = usePageVisible()
  const [usage, setUsage] = useState<LiveUsage>(initialData)
  // If we load already rate-limited, skip the explosion and go straight to rate-limited state
  const [phase, setPhase] = useState<'normal' | 'exploding' | 'rate-limited'>(() =>
    initialData.five_hour.utilization >= 100 || initialData.seven_day.utilization >= 100 ? 'rate-limited' : 'normal',
  )
  const [rateLimitType, setRateLimitType] = useState<'session' | 'weekly'>(() =>
    initialData.seven_day.utilization >= 100 ? 'weekly' : 'session',
  )
  const [countdownSec, setCountdownSec] = useState(0)
  const [rateLimitExpired, setRateLimitExpired] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(() =>
    new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }),
  )
  const [, setTick] = useState(0)
  const [fillPct, setFillPct] = useState(0)
  const hasAnimated = useRef(false)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(phase)

  // Keep phaseRef in sync for use in effects that shouldn't re-run on phase change
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const fetchUsage = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/usage')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'API error')
      setUsage(data)
      setLastRefresh(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        }),
      )
    } catch (e) {
      console.error('Refresh failed:', e)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    fetchUsage()
    const id = setInterval(fetchUsage, 60_000)
    return () => clearInterval(id)
  }, [fetchUsage, visible])

  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [visible])

  // Trigger explosion when utilization hits 100%; auto-recover when window resets
  useEffect(() => {
    const isRateLimited = usage.five_hour.utilization >= 100 || usage.seven_day.utilization >= 100
    if (isRateLimited && phaseRef.current === 'normal') {
      setRateLimitType(usage.seven_day.utilization >= 100 ? 'weekly' : 'session')
      setPhase('exploding')
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
    }
    if (!isRateLimited && phaseRef.current === 'rate-limited') {
      setPhase('normal')
      setRateLimitExpired(false)
      hasAnimated.current = false // re-trigger fill animation on recovery
    }
  }, [usage.five_hour.utilization, usage.seven_day.utilization])

  const handleExplosionSettled = useCallback(() => {
    setPhase('rate-limited')
    setFillPct(0)
  }, [])

  // Seconds-precision countdown: 1s tick only when rate-limited
  useEffect(() => {
    if (phase !== 'rate-limited' || !visible) {
      if (phase !== 'rate-limited') setRateLimitExpired(false)
      return
    }
    const fiveHourResetsAt = usage.five_hour.resets_at
    const sevenDayResetsAt = usage.seven_day.resets_at
    // null: the API gave no reset time. Say so rather than guess an account's reset slot.
    const getResetMs = (): number | null => {
      if (rateLimitType === 'weekly') {
        return sevenDayResetsAt ? new Date(sevenDayResetsAt).getTime() - Date.now() : null
      }
      return fiveHourResetsAt ? new Date(fiveHourResetsAt).getTime() - Date.now() : 0
    }
    const update = () => {
      const ms = getResetMs()
      if (ms === null) {
        setCountdownSec(-1)
        return
      }
      const sec = Math.max(0, Math.ceil(ms / 1000))
      setCountdownSec(sec)
      if (sec <= 0) setRateLimitExpired(true)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [phase, rateLimitType, usage.five_hour.resets_at, usage.seven_day.resets_at, visible])

  // Animated fill: only runs in normal phase (uses phaseRef to avoid stale closures)
  useEffect(() => {
    if (phaseRef.current !== 'normal' || !visible) return
    const target = Math.min(100, usage.five_hour.utilization)

    if (hasAnimated.current) {
      setFillPct(target)
      return
    }

    hasAnimated.current = true
    const duration = 2000
    let startTime: number | null = null

    const animate = (now: number) => {
      if (startTime === null) startTime = now
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)
      const eased = 1 - (1 - progress) ** 3
      setFillPct(target * eased)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [usage])

  const session = usage.five_hour
  const weekly = usage.seven_day
  const sonnet = usage.seven_day_sonnet
  const weeklyPct = Math.min(100, weekly.utilization)
  const displayPct = phase === 'rate-limited' ? (rateLimitType === 'weekly' ? 100 : 0) : fillPct
  const color = lerpColor(displayPct)
  const weeklyColor = lerpColor(weeklyPct)
  const trembling = phase === 'normal' && fillPct > 85

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 select-none overflow-hidden"
      style={{
        background: COLORS.void,
        fontFamily: "'JetBrains Mono', monospace",
        position: 'relative',
        animation: shaking ? 'container-shake 0.5s ease-out' : undefined,
      }}
    >
      <style>{ANIMATION_CSS}</style>
      <MatrixRain opacity={0.3} />

      {/* Content layer */}
      <div style={{ position: 'relative', zIndex: 2 }} className="flex flex-col items-center gap-7">
        {/* Big countdown: appears above lobster when rate-limited */}
        {phase === 'rate-limited' && (
          <div className="flex flex-col items-center" style={{ animation: 'fade-in-up 0.6s ease-out' }}>
            <div
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: countdownSec > 86400 ? '1.8rem' : '2.6rem',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.04em',
                lineHeight: 1,
                color: rateLimitType === 'weekly' ? COLORS.lobsterRed : COLORS.lobsterOrange,
                textShadow:
                  rateLimitType === 'weekly' ? '0 0 24px rgba(204, 34, 0, 0.5)' : '0 0 24px rgba(255, 107, 53, 0.5)',
              }}
            >
              {rateLimitExpired ? 'READY' : countdownSec < 0 ? 'RESET TIME UNKNOWN' : formatCountdownSec(countdownSec)}
            </div>
            <p
              className="uppercase mt-2"
              style={{
                fontSize: rateLimitType === 'weekly' ? '15px' : '10px',
                letterSpacing: '0.2em',
                fontWeight: rateLimitType === 'weekly' ? 600 : 400,
                fontFamily: rateLimitType === 'weekly' ? "'Unbounded', sans-serif" : undefined,
                color: rateLimitType === 'weekly' ? 'rgba(204, 34, 0, 0.9)' : 'rgba(255, 107, 53, 0.65)',
                animation:
                  rateLimitType === 'weekly' && !rateLimitExpired ? 'weekly-tremble 0.18s linear infinite' : undefined,
              }}
            >
              {rateLimitType === 'weekly' ? 'Weekly Limit' : 'Session Limit'}
            </p>
          </div>
        )}

        {/* Lobster portrait: glows red when rate-limited */}
        <LobsterPortrait glowing={phase === 'rate-limited'} />

        {/* Info panels: Claude, and OpenAI (Codex) beside it when its logs exist */}
        <div className="flex flex-wrap items-start justify-center gap-6">
          <InfoPanel>
            <h1
              className="text-sm uppercase tracking-[0.2em] text-center mb-4"
              style={{
                fontFamily: "'Unbounded', sans-serif",
                color: COLORS.matrixGreen,
                opacity: 0.7,
                textShadow: `0 0 10px rgba(51, 204, 85, 0.15)`,
              }}
            >
              Claude Fuel
            </h1>

            {/* Session thermometer */}
            <div
              className="flex flex-col items-center"
              style={{
                animation: trembling ? 'pre-explosion-tremble 0.08s linear infinite' : undefined,
              }}
            >
              <Thermometer
                percent={displayPct}
                color={
                  phase === 'rate-limited' ? (rateLimitType === 'weekly' ? COLORS.lobsterRed : COLORS.textMuted) : color
                }
                busted={phase === 'rate-limited' && rateLimitType === 'weekly' && !rateLimitExpired}
              />

              <div className="text-center -mt-1">
                <span
                  className="text-4xl font-semibold"
                  style={{
                    color: phase === 'rate-limited' ? COLORS.textMuted : color,
                    fontFamily: "'Unbounded', sans-serif",
                    textShadow: phase === 'normal' ? `0 0 14px ${color}` : undefined,
                  }}
                >
                  {phase === 'rate-limited' ? '-' : `${Math.round(fillPct)}%`}
                </span>
                <p className="text-xs mt-1.5 uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
                  {phase === 'rate-limited'
                    ? rateLimitType === 'weekly'
                      ? 'Weekly Limit'
                      : 'Session Limit'
                    : phase === 'exploding'
                      ? 'OVERLOAD!'
                      : 'Current Session'}
                </p>
              </div>

              <p
                className="text-xs mt-2"
                style={{ color: phase === 'rate-limited' ? COLORS.textSecondary : COLORS.textMuted }}
              >
                {session.resets_at ? getCountdown(session.resets_at) : 'No active window'}
              </p>
            </div>

            {/* Divider */}
            <div className="w-full h-px my-4" style={{ background: 'rgba(51, 204, 85, 0.06)' }} />

            {/* Weekly bar */}
            <div
              style={{
                animation:
                  phase === 'rate-limited' && rateLimitType === 'weekly' && !rateLimitExpired
                    ? 'weekly-tremble 0.16s linear infinite'
                    : undefined,
              }}
            >
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: COLORS.textMuted }}>WEEKLY</span>
                <span style={{ color: weeklyColor, textShadow: `0 0 6px ${weeklyColor}` }}>
                  {weeklyPct.toFixed(0)}%
                </span>
              </div>
              <div
                className="h-3 rounded-full overflow-hidden"
                style={{ background: COLORS.panel, border: '1px solid rgba(51, 204, 85, 0.05)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${weeklyPct}%`,
                    backgroundColor: weeklyColor,
                    opacity: 0.85,
                    transition: 'width 0.8s ease',
                  }}
                />
              </div>
              <p className="text-[11px] text-center mt-1.5" style={{ color: COLORS.textMuted }}>
                {weekly.resets_at ? `Resets ${formatResetCT(weekly.resets_at)}` : ''}
              </p>
            </div>

            {/* Sonnet bar */}
            {sonnet && sonnet.utilization > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1.5">
                  <span style={{ color: COLORS.textMuted }}>SONNET</span>
                  <span style={{ color: lerpColor(sonnet.utilization) }}>{sonnet.utilization.toFixed(0)}%</span>
                </div>
                <div
                  className="h-2.5 rounded-full overflow-hidden"
                  style={{ background: COLORS.panel, border: '1px solid rgba(51, 204, 85, 0.05)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, sonnet.utilization)}%`,
                      backgroundColor: lerpColor(sonnet.utilization),
                      opacity: 0.85,
                      transition: 'width 0.8s ease',
                    }}
                  />
                </div>
                <p className="text-[11px] text-center mt-1.5" style={{ color: COLORS.textMuted }}>
                  {sonnet.resets_at ? `Resets ${formatResetCT(sonnet.resets_at)}` : ''}
                </p>
              </div>
            )}
          </InfoPanel>
          <CodexFuelPanel preview={codexPreview} />
        </div>

        {/* Explosion particles: fires when utilization hits 100% */}
        {phase === 'exploding' && (
          <ExplosionEffect onSettled={handleExplosionSettled} intense={rateLimitType === 'weekly'} />
        )}

        {/* Footer */}
        <div className="flex flex-col items-center gap-3 text-[11px]" style={{ color: COLORS.textMuted }}>
          {/* Refuel button: pops up when rate-limit countdown expires */}
          {phase === 'rate-limited' && rateLimitExpired && (
            <button
              type="button"
              onClick={fetchUsage}
              disabled={refreshing}
              className="disabled:opacity-40"
              style={
                {
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: '11px',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: COLORS.matrixGreen,
                  border: `1px solid ${COLORS.matrixGreen}`,
                  borderRadius: '4px',
                  padding: '9px 28px',
                  background: 'rgba(51, 204, 85, 0.07)',
                  cursor: 'pointer',
                  animation: refreshing ? undefined : 'refuel-pulse 2s ease-in-out infinite',
                  '--glow': 'rgba(51, 204, 85, 0.4)',
                } as React.CSSProperties
              }
            >
              {refreshing ? '...' : '⚡ REFUEL'}
            </button>
          )}
          <div className="flex items-center gap-2">
            <span>{lastRefresh}</span>
            <button
              type="button"
              onClick={fetchUsage}
              disabled={refreshing}
              className="hover:opacity-80 transition-opacity disabled:opacity-30"
              style={{ color: COLORS.matrixGreen, textShadow: `0 0 6px rgba(51, 204, 85, 0.15)` }}
            >
              {refreshing ? '...' : 'refresh'}
            </button>
          </div>
          <a
            href="./"
            className="hover:opacity-100 transition-opacity"
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: COLORS.matrixGreen,
              border: '1px solid rgba(51, 204, 85, 0.3)',
              borderRadius: '4px',
              padding: '7px 22px',
              background: 'rgba(51, 204, 85, 0.04)',
              textDecoration: 'none',
              opacity: 0.65,
              display: 'inline-block',
            }}
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Preview mock data: dev-only state testing via ?widget&preview=X
// ============================================================
function buildPreviewData(mode: string): LiveUsage | null {
  const now = Date.now()
  const fakeWeekly = { utilization: 45, resets_at: new Date(now + 5 * 86400000).toISOString() }
  const fakeSonnet = { utilization: 74, resets_at: new Date(now + 1.5 * 86400000).toISOString() }
  const previewMap: Record<string, LiveUsage> = {
    // Normal window, used with the OpenAI previews
    normal: {
      ok: true,
      five_hour: { utilization: 41, resets_at: new Date(now + 3 * 3600000).toISOString() },
      seven_day: fakeWeekly,
      seven_day_sonnet: fakeSonnet,
    },
    // Session rate-limited: 2h 30m countdown
    session: {
      ok: true,
      five_hour: { utilization: 100, resets_at: new Date(now + 2.5 * 3600000).toISOString() },
      seven_day: fakeWeekly,
      seven_day_sonnet: fakeSonnet,
    },
    // Weekly rate-limited: 4d 18h countdown
    weekly: {
      ok: true,
      five_hour: { utilization: 100, resets_at: new Date(now + 2.5 * 3600000).toISOString() },
      seven_day: { utilization: 100, resets_at: new Date(now + 4 * 86400000 + 18 * 3600000).toISOString() },
      seven_day_sonnet: fakeSonnet,
    },
    // Session expired: countdown at 0, ⚡ REFUEL button
    'session-done': {
      ok: true,
      five_hour: { utilization: 100, resets_at: new Date(now - 5000).toISOString() },
      seven_day: fakeWeekly,
      seven_day_sonnet: fakeSonnet,
    },
    // Weekly expired: countdown at 0, ⚡ REFUEL button (weekly messaging)
    'weekly-done': {
      ok: true,
      five_hour: { utilization: 100, resets_at: new Date(now - 5000).toISOString() },
      seven_day: { utilization: 100, resets_at: new Date(now - 5000).toISOString() },
      seven_day_sonnet: fakeSonnet,
    },
  }
  return previewMap[mode] ?? null
}

// ============================================================
// Main Widget: detects mode and renders appropriate version
// ============================================================
const IS_PUBLIC = import.meta.env.VITE_PUBLIC_MODE === 'true'

export function Widget() {
  // The public site has no live data at all: straight to the demo, no API probe.
  const [mode, setMode] = useState<'checking' | 'live' | 'demo'>(IS_PUBLIC ? 'demo' : 'checking')
  const [initialData, setInitialData] = useState<LiveUsage | null>(null)

  useEffect(() => {
    if (IS_PUBLIC) return
    fetch('/api/usage')
      .then(async (res) => {
        const ct = res.headers.get('content-type')
        if (!ct?.includes('json')) throw new Error()
        const data = await res.json()
        if (!data.ok) throw new Error()
        // Persist last-known good data so restarts don't lose it
        try {
          localStorage.setItem('widget-usage-cache', JSON.stringify(data))
        } catch {}
        setInitialData(data)
        setMode('live')
      })
      .catch(() => {
        // Try localStorage fallback before giving up and showing demo
        try {
          const cached = localStorage.getItem('widget-usage-cache')
          if (cached) {
            const data = JSON.parse(cached)
            setInitialData({ ...data, stale: true })
            setMode('live')
            return
          }
        } catch {}
        setMode('demo')
      })
  }, [])

  // The public build has no live data and no preview routes (they would poll local endpoints).
  if (IS_PUBLIC) return <DemoWidget />

  // Dev preview: ?widget&preview=session|weekly|session-done|weekly-done|demo|openai|openai-limit
  const preview = new URLSearchParams(window.location.search).get('preview')
  if (preview === 'demo') return <DemoWidget />
  if (preview) {
    // ?preview=openai | openai-limit pairs a mock Codex panel with a normal Claude window.
    const codexPreview = buildCodexPreview(preview)
    const data = buildPreviewData(codexPreview ? 'normal' : preview)
    if (data) return <LiveWidget initialData={data} codexPreview={codexPreview} />
  }

  if (mode === 'checking') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: COLORS.void, fontFamily: "'Unbounded', sans-serif" }}
      >
        <div
          className="animate-pulse text-xs"
          style={{ color: COLORS.matrixGreen, textShadow: '0 0 10px rgba(51,204,85,0.3)' }}
        >
          INITIALIZING...
        </div>
      </div>
    )
  }

  if (mode === 'live' && initialData) {
    return <LiveWidget initialData={initialData} />
  }

  return <DemoWidget />
}
