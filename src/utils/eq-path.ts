/** A smooth line through the points that never overshoots between them (monotone cubic, Fritsch–Carlson), as an SVG
 * path of cubic Béziers. A plain spline dips below a flat 0 next to a raised band, showing a cut that isn't there. */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 2) return n ? `M ${pts[0][0]} ${pts[0][1]}` : "";
  const dx = pts.slice(1).map(([x], i) => x - pts[i][0]);
  const slope = pts.slice(1).map(([, y], i) => (y - pts[i][1]) / dx[i]);
  // tangents: zero at a peak, valley or flat stretch; otherwise the harmonic mean of the neighbouring slopes
  const m = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const a = slope[i - 1];
    const b = slope[i];
    if (a * b <= 0) return 0;
    const w1 = 2 * dx[i] + dx[i - 1];
    const w2 = dx[i] + 2 * dx[i - 1];
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${pts[i][0] + h} ${pts[i][1] + m[i] * h} ${pts[i + 1][0] - h} ${pts[i + 1][1] - m[i + 1] * h} ${pts[i + 1][0]} ${pts[i + 1][1]}`;
  }
  return d;
}
