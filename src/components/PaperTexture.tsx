'use client'

export function PaperTexture() {
  return (
    <>
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="paper-grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="4"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>
      <div
        className="paper-texture"
        style={{ filter: 'url(#paper-grain)' }}
        aria-hidden="true"
      />
    </>
  )
}
