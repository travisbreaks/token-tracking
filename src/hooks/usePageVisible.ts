import { useEffect, useRef, useState } from 'react'

const IDLE_TIMEOUT = 5 * 60_000 // 5 minutes

/**
 * Returns `true` when the tab is visible AND the user is active.
 * Goes false when:
 *  - the tab is hidden (switched away, minimized)
 *  - no mouse/keyboard/touch activity for 5 minutes (monitor off, walked away)
 *
 * All consumers pause automatically in both cases.
 */
export function usePageVisible() {
  const [active, setActive] = useState(!document.hidden)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const resetIdle = () => {
      clearTimeout(timerRef.current)
      if (!document.hidden) {
        setActive(true)
        timerRef.current = setTimeout(() => setActive(false), IDLE_TIMEOUT)
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timerRef.current)
        setActive(false)
      } else {
        resetIdle()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('mousemove', resetIdle)
    window.addEventListener('mousedown', resetIdle)
    window.addEventListener('keydown', resetIdle)
    window.addEventListener('touchstart', resetIdle)
    window.addEventListener('scroll', resetIdle, true)

    // Start the idle timer
    timerRef.current = setTimeout(() => setActive(false), IDLE_TIMEOUT)

    return () => {
      clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('mousedown', resetIdle)
      window.removeEventListener('keydown', resetIdle)
      window.removeEventListener('touchstart', resetIdle)
      window.removeEventListener('scroll', resetIdle, true)
    }
  }, [])

  return active
}
