'use client'

interface FootballFieldProps {
  width?: number
  height?: number
  children?: React.ReactNode
}

export function FootballField({ width = 1000, height = 400, children }: FootballFieldProps) {
  // Field dimensions: 100 yards + 2 end zones (10 yards each) = 120 total
  const endZoneWidth = (width / 120) * 10
  const fieldWidth = width - (2 * endZoneWidth)
  const yardWidth = fieldWidth / 100

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      aria-label="Football field visualization showing drive patterns"
      role="img"
    >
      {/* Background */}
      <rect x={0} y={0} width={width} height={height} fill="#2d5a27" />

      {/* Left End Zone */}
      <rect
        x={0}
        y={0}
        width={endZoneWidth}
        height={height}
        fill="#1e3d1a"
        stroke="#fff"
        strokeWidth={2}
      />
      <text
        x={endZoneWidth / 2}
        y={height / 2}
        fill="#fff"
        fontSize={24}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(-90, ${endZoneWidth / 2}, ${height / 2})`}
        opacity={0.5}
      >
        END ZONE
      </text>

      {/* Right End Zone */}
      <rect
        x={width - endZoneWidth}
        y={0}
        width={endZoneWidth}
        height={height}
        fill="#1e3d1a"
        stroke="#fff"
        strokeWidth={2}
      />
      <text
        x={width - endZoneWidth / 2}
        y={height / 2}
        fill="#fff"
        fontSize={24}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(90, ${width - endZoneWidth / 2}, ${height / 2})`}
        opacity={0.5}
      >
        END ZONE
      </text>

      {/* Yard Lines */}
      {Array.from({ length: 21 }).map((_, i) => {
        const yard = i * 5
        const x = endZoneWidth + (yard * yardWidth)
        const isMajor = yard % 10 === 0

        return (
          <g key={yard}>
            <line
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              stroke="#fff"
              strokeWidth={isMajor ? 2 : 1}
              opacity={isMajor ? 0.8 : 0.4}
            />
            {isMajor && yard > 0 && yard < 100 && (
              <text
                x={x}
                y={height - 10}
                fill="#fff"
                fontSize={14}
                textAnchor="middle"
                opacity={0.6}
              >
                {yard <= 50 ? yard : 100 - yard}
              </text>
            )}
          </g>
        )
      })}

      {/* Hash Marks */}
      {Array.from({ length: 100 }).map((_, yard) => {
        const x = endZoneWidth + (yard * yardWidth)
        return (
          <g key={`hash-${yard}`}>
            <line x1={x} y1={height * 0.35} x2={x + yardWidth * 0.5} y2={height * 0.35} stroke="#fff" strokeWidth={1} opacity={0.3} />
            <line x1={x} y1={height * 0.65} x2={x + yardWidth * 0.5} y2={height * 0.65} stroke="#fff" strokeWidth={1} opacity={0.3} />
          </g>
        )
      })}

      {/* 50 Yard Line Emphasis */}
      <line
        x1={endZoneWidth + 50 * yardWidth}
        y1={0}
        x2={endZoneWidth + 50 * yardWidth}
        y2={height}
        stroke="#fff"
        strokeWidth={3}
        opacity={0.9}
      />

      {/* Children (arcs, overlays, etc.) */}
      <g transform={`translate(${endZoneWidth}, 0)`}>
        {children}
      </g>
    </svg>
  )
}

// Helper to convert yard line to x position within the field area
export function yardToX(yard: number, fieldWidth: number): number {
  return (yard / 100) * fieldWidth
}
