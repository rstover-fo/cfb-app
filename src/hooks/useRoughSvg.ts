'use client'

import { useRef, useEffect, useState } from 'react'
import rough from 'roughjs'
import type { RoughSVG } from 'roughjs/bin/svg'

export function useRoughSvg() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [rc, setRc] = useState<RoughSVG | null>(null)

  useEffect(() => {
    if (svgRef.current && !rc) {
      setRc(rough.svg(svgRef.current))
    }
  }, [rc])

  return { svgRef, rc }
}
