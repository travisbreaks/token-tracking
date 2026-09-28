import { useEffect, useRef } from 'react'
import { usePageVisible } from '@/hooks/usePageVisible'

interface MatrixRainProps {
  /** Overall opacity of the canvas (widget: 0.25, dashboard: 0.14) */
  opacity?: number
  /** CSS blur filter (widget: 0.8px, dashboard: 1.0px) */
  blur?: number
  /** Drop speed multiplier (1 = default, 0.6 = slower/calmer) */
  speed?: number
  /** Trail length in characters: how many chars linger behind the head (widget: 25, dashboard: 12) */
  trail?: number
}

const MATRIX_GREEN = '#33cc55'
const MATRIX_DIM = '#1a6630'
const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF'

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)]
}

export function MatrixRain({ opacity = 0.25, blur = 0.8, speed = 1, trail = 25 }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const visible = usePageVisible()

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    const fontSize = 11
    const spacing = 18

    // Per-column state
    let columns = 0
    let heads: number[] = [] // float position of leading character (in row units)
    let lastRow: number[] = [] // last integer row we emitted a trail entry for
    let trails: { row: number; char: string }[][] = []

    function initColumns(count: number) {
      columns = count
      heads = Array.from({ length: count }, () => Math.random() * -40)
      lastRow = Array.from({ length: count }, () => -999)
      trails = Array.from({ length: count }, () => [])
    }

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initColumns(Math.floor(canvas.width / spacing))
    }
    resize()
    window.addEventListener('resize', resize)

    let raf: number

    const animate = () => {
      // Full clear every frame: no residual pixel buildup
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`

      const maxY = canvas.height

      for (let i = 0; i < columns; i++) {
        const headRow = Math.floor(heads[i])

        // If head advanced to a new row, stamp a character there
        if (headRow > lastRow[i] && headRow >= 0) {
          trails[i].push({ row: headRow, char: randomChar() })
          // Trim trail to max length
          if (trails[i].length > trail) trails[i].shift()
          lastRow[i] = headRow
        }

        // Draw the trail: oldest to newest
        const len = trails[i].length
        const isBright = i % 6 === 0

        for (let t = 0; t < len; t++) {
          const entry = trails[i][t]
          const y = entry.row * fontSize
          if (y < -fontSize || y > maxY + fontSize) continue

          // age: 0 = newest (head), len-1 = oldest (tail)
          const age = len - 1 - t
          const life = 1 - age / trail // 1.0 at head → 0.0 at tail edge

          const isHead = t === len - 1
          ctx.fillStyle = isHead ? MATRIX_GREEN : MATRIX_DIM
          ctx.globalAlpha = life * (isBright ? 0.55 : 0.3)
          ctx.fillText(entry.char, i * spacing, y)
        }

        // Advance head
        heads[i] += (0.1 + Math.random() * 0.15) * speed

        // Reset column when head is well past the bottom
        if (heads[i] * fontSize > maxY + trail * fontSize * 1.5 && Math.random() > 0.975) {
          heads[i] = Math.random() * -30
          trails[i] = []
          lastRow[i] = -999
        }
      }

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [speed, trail, visible])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        opacity,
        filter: `blur(${blur}px)`,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
