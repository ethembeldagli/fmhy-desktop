/**
 * The FMHY play mark.
 *
 * A white play triangle whose three edges each carry their own coloured glow —
 * magenta along the top, indigo along the bottom, teal down the left. Those are
 * not a single gradient across the shape: sampling FMHY's own hero artwork
 * shows the colour is constant along each edge and only blends where two edges
 * meet, so each edge is drawn as its own blurred stroke behind the white face.
 *
 * Drawn here rather than bundling FMHY's icon files, so the app carries no
 * artwork it does not own; if this ever became an official client, dropping in
 * their real assets replaces this component.
 *
 * Gradient and filter ids are suffixed per instance because several marks can
 * be on screen at once and SVG ids are document-global.
 */

/*
 * Proportions taken from FMHY's hero image: the white triangle is 716x828
 * there, a width-to-height ratio of 0.865, positioned so its centroid sits
 * just left of centre — a triangle centred on its bounding box reads as
 * leaning right.
 */
const A = [62, 40] // top-left
const B = [166, 100] // tip
const C = [62, 160] // bottom-left
const TRIANGLE = `M${A[0]} ${A[1]} L${B[0]} ${B[1]} L${C[0]} ${C[1]} Z`

/** Edge glows, in draw order: top, bottom, left. */
const EDGES: Array<{ from: number[]; to: number[]; color: string }> = [
  { from: A, to: B, color: '#c834c9' },
  { from: B, to: C, color: '#5b5ba1' },
  { from: C, to: A, color: '#137689' },
]

function Glyph({
  id,
  blur,
  width,
}: {
  id: string
  /** Gaussian spread of each edge glow, in user units. */
  blur: number
  /** Stroke width of each edge glow; half of it lies outside the triangle. */
  width: number
}) {
  return (
    <>
      <defs>
        <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
      </defs>

      <g filter={`url(#${id}-soft)`}>
        {EDGES.map((edge) => (
          <line
            key={edge.color}
            x1={edge.from[0]}
            y1={edge.from[1]}
            x2={edge.to[0]}
            y2={edge.to[1]}
            stroke={edge.color}
            strokeWidth={width}
            strokeLinecap="round"
          />
        ))}
      </g>
      <path d={TRIANGLE} fill="#ffffff" />
    </>
  )
}

/** Compact mark for the navigation bar, set in a dark disc. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="mark-disc">
          <circle cx="100" cy="100" r="100" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="100" fill="#0d0d0d" />
      <g clipPath="url(#mark-disc)">
        <Glyph id="mark" blur={7} width={16} />
      </g>
    </svg>
  )
}

/**
 * Hero treatment: the same glyph over the blurred split-gradient disc FMHY
 * puts behind it. That disc is a plain element rather than part of the SVG —
 * see `.heromark__bg`, which reproduces their CSS exactly.
 */
export function HeroMark() {
  return (
    <div className="heromark" aria-hidden="true">
      <div className="heromark__bg" />
      {/*
        * The 200-unit box already leaves room for the glow on every side, so
        * at a 320px render the white triangle lands at 166px across — the size
        * FMHY's own artwork resolves to at the same width.
        */}
      <svg viewBox="0 0 200 200" className="heromark__glyph">
        <Glyph id="heromark" blur={6} width={14} />
      </svg>
    </div>
  )
}
