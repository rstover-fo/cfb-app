'use client'

import { useState, useEffect, useRef } from 'react'

interface UseCountUpOptions {
  duration?: number
  decimals?: number
  startOnMount?: boolean
}

export function useCountUp(
  endValue: number,
  options: UseCountUpOptions = {}
) {
  const { duration = 800, decimals = 0, startOnMount = true } = options
  const [displayValue, setDisplayValue] = useState(startOnMount ? 0 : endValue)
  const [hasAnimated, setHasAnimated] = useState(false)
  const frameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!startOnMount || hasAnimated) return

    const startTime = performance.now()
    const startValue = 0

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const currentValue = startValue + (endValue - startValue) * easeOut

      setDisplayValue(currentValue)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        setHasAnimated(true)
      }
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [endValue, duration, startOnMount, hasAnimated])

  const formatted = decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toString()

  return formatted
}
