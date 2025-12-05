/**
 * Volatility surface smoothing algorithms
 */

/**
 * Smooth total variance smile using cubic spline interpolation and convexity enforcement
 * 
 * @param strikes - Sorted array of strike prices
 * @param ivs - Array of IVs as percentages (e.g., 20 = 20%)
 * @param T - Time to expiration in years
 * @returns Smoothed IVs as percentages
 * 
 * @example
 * ```typescript
 * const smoothed = smoothTotalVarianceSmile([90, 95, 100, 105, 110], [22, 20, 18, 20, 22], 0.25);
 * ```
 */
export function smoothTotalVarianceSmile(strikes: number[], ivs: number[], T: number): number[] {
  const n = strikes.length;
  
  if (n <= 2) {
    return ivs; // Not enough points to smooth meaningfully
  }

  // Convert IV% → decimal and total variance
  const w: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const vol = ivs[i] / 100.0; // percent → decimal
    w[i] = vol * vol * T;
  }

  // Step 1: cubic spline interpolation on w(K)
  const spline = new CubicSpline(strikes, w);

  // Step 2: evaluate spline at existing strikes (already sorted)
  const smoothedW: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    smoothedW[i] = spline.eval(strikes[i]);
  }

  // Step 3: enforce convexity of total variance (simple projection)
  enforceConvexity(strikes, smoothedW);

  // Step 4: convert total variance back to IV (percent)
  const smoothedIV: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (smoothedW[i] <= 0) {
      smoothedIV[i] = ivs[i]; // fallback
    } else {
      smoothedIV[i] = Math.sqrt(smoothedW[i] / T) * 100.0;
    }
  }

  return smoothedIV;
}

/**
 * Cubic spline interpolation
 */
class CubicSpline {
  private x: number[];
  private a: number[];
  private b: number[];
  private c: number[];
  private d: number[];

  constructor(x: number[], y: number[]) {
    const n = x.length;
    this.x = x;
    this.a = [...y];
    this.b = new Array(n).fill(0);
    this.c = new Array(n).fill(0);
    this.d = new Array(n).fill(0);

    const h: number[] = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      h[i] = x[i + 1] - x[i];
    }

    const alpha: number[] = new Array(n - 1).fill(0);
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = (3 * (this.a[i + 1] - this.a[i])) / h[i] - (3 * (this.a[i] - this.a[i - 1])) / h[i - 1];
    }

    const l: number[] = new Array(n).fill(0);
    const mu: number[] = new Array(n).fill(0);
    const z: number[] = new Array(n).fill(0);

    l[0] = 1;
    mu[0] = 0;
    z[0] = 0;

    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }

    l[n - 1] = 1;
    z[n - 1] = 0;
    this.c[n - 1] = 0;

    for (let j = n - 2; j >= 0; j--) {
      this.c[j] = z[j] - mu[j] * this.c[j + 1];
      this.b[j] = (this.a[j + 1] - this.a[j]) / h[j] - (h[j] * (this.c[j + 1] + 2 * this.c[j])) / 3;
      this.d[j] = (this.c[j + 1] - this.c[j]) / (3 * h[j]);
    }
  }

  eval(x: number): number {
    // Find interval
    const n = this.x.length;
    let i = this.findInterval(x, n);
    
    if (i > 0 && i >= n - 1) {
      i = n - 2;
    }

    const dx = x - this.x[i];
    return this.a[i] + this.b[i] * dx + this.c[i] * dx * dx + this.d[i] * dx * dx * dx;
  }

  private findInterval(x: number, n: number): number {
    // Binary search
    let left = 0;
    let right = n - 1;
    
    while (left < right - 1) {
      const mid = Math.floor((left + right) / 2);
      if (this.x[mid] <= x) {
        left = mid;
      } else {
        right = mid;
      }
    }
    
    return left;
  }
}

/**
 * Enforce convexity of total variance using convex hull approach
 * 
 * @param x - Strike prices
 * @param w - Total variance values (modified in place)
 */
function enforceConvexity(x: number[], w: number[]): void {
  const n = w.length;
  if (n < 3) {
    return;
  }

  interface Point {
    x: number;
    w: number;
  }

  // Build the lower convex hull of (x, w) points
  // This guarantees convexity and runs in O(n)
  const hull: Point[] = [];

  for (let i = 0; i < n; i++) {
    const p: Point = { x: x[i], w: w[i] };
    
    // Remove points that would break convexity
    while (hull.length >= 2) {
      const h1 = hull[hull.length - 1];
      const h2 = hull[hull.length - 2];
      
      // Cross product to check if we make a left turn (convex)
      // (h1 - h2) x (p - h2) should be >= 0 for convexity
      const cross = (h1.x - h2.x) * (p.w - h2.w) - (h1.w - h2.w) * (p.x - h2.x);
      
      if (cross >= 0) {
        break; // convex, keep h1
      }
      
      hull.pop(); // remove h1, it breaks convexity
    }
    
    hull.push(p);
  }

  // Now interpolate the hull values back to original x positions
  let hullIdx = 0;
  for (let i = 0; i < n; i++) {
    // Find the hull segment containing x[i]
    while (hullIdx < hull.length - 1 && hull[hullIdx + 1].x < x[i]) {
      hullIdx++;
    }
    
    if (hullIdx >= hull.length - 1) {
      hullIdx = hull.length - 2;
    }
    
    if (hullIdx < 0) {
      hullIdx = 0;
    }

    // Linear interpolation on the hull
    const h1 = hull[hullIdx];
    const h2 = hull[hullIdx + 1];
    
    if (h2.x === h1.x) {
      w[i] = h1.w;
    } else {
      const t = (x[i] - h1.x) / (h2.x - h1.x);
      w[i] = h1.w + t * (h2.w - h1.w);
    }
  }
}
