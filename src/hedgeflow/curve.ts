import { ExposurePerExpiry, IVSurface } from '../types';
import { RegimeParams } from './types';
import { deriveRegimeParams } from './regime';
import {
  HedgeImpulseConfig,
  HedgeImpulsePoint,
  HedgeImpulseCurve,
  ZeroCrossing,
  ImpulseExtremum,
  DirectionalAsymmetry,
  ImpulseRegime,
} from './types';

/**
 * Detect the modal (most common) strike spacing from an array of strikes.
 * Handles irregular spacing by finding the most frequent gap.
 */
function detectStrikeSpacing(strikes: number[]): number {
  if (strikes.length < 2) return 1;

  const gaps: number[] = [];
  for (let i = 1; i < strikes.length; i++) {
    const gap = Math.abs(strikes[i] - strikes[i - 1]);
    if (gap > 0) gaps.push(gap);
  }

  if (gaps.length === 0) return 1;

  // Find modal gap (most common spacing)
  const gapCounts = new Map<number, number>();
  for (const gap of gaps) {
    // Round to avoid floating point issues
    const rounded = Math.round(gap * 100) / 100;
    gapCounts.set(rounded, (gapCounts.get(rounded) || 0) + 1);
  }

  let modalGap = gaps[0];
  let maxCount = 0;
  for (const [gap, count] of gapCounts) {
    if (count > maxCount) {
      maxCount = count;
      modalGap = gap;
    }
  }

  return modalGap;
}

/**
 * Derive the spot-vol coupling coefficient k from the IV surface.
 * 
 * From stochastic vol models, the skew encodes the spot-vol correlation:
 *   skew ≈ rho_SV * volOfVol / atmIV
 * 
 * The spot-vol coupling for the dealer hedge equation is:
 *   dSigma ≈ -k * (dS/S)
 * 
 * So k = -rho_SV * volOfVol * sqrt(252) = -impliedSpotVolCorr * atmIV * sqrt(252)
 * 
 * For equity indices this typically lands in the range 4-12.
 */
function deriveSpotVolCoupling(regimeParams: RegimeParams): number {
  const { impliedSpotVolCorr, atmIV } = regimeParams;

  // k = -correlation * atmIV * annualization
  // The negative sign is because negative correlation (spot down = vol up)
  // should produce a positive k (so that -k/S * Vanna has the right sign)
  const k = -impliedSpotVolCorr * atmIV * Math.sqrt(252);

  // Clamp to reasonable range (2 to 20)
  return Math.max(2, Math.min(20, k));
}

/**
 * Apply Gaussian kernel smoothing to map strike-space exposures
 * into price-space at a given evaluation point.
 * 
 * weight(K, S) = exp(-((K - S) / lambda)^2)
 * 
 * @param strikes - Strike prices where exposures are defined
 * @param values - Exposure values at each strike
 * @param evalPrice - Price level to evaluate at
 * @param lambda - Kernel width in price units
 * @returns Smoothed exposure value at evalPrice
 */
function kernelSmooth(
  strikes: number[],
  values: number[],
  evalPrice: number,
  lambda: number,
): number {
  let weightedSum = 0;
  let weightSum = 0;

  for (let i = 0; i < strikes.length; i++) {
    const dist = (strikes[i] - evalPrice) / lambda;
    const weight = Math.exp(-(dist * dist));
    weightedSum += values[i] * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? weightedSum / weightSum : 0;
}

/**
 * Compute the hedge impulse curve across a price grid.
 * 
 * The hedge impulse H(S) at each price level S combines gamma and vanna
 * exposures via the empirical spot-vol coupling relationship:
 * 
 *   H(S) = GEX_smoothed(S) - (k / S) * VEX_smoothed(S)
 * 
 * where:
 * - GEX_smoothed(S) is the kernel-smoothed gamma exposure at S
 * - VEX_smoothed(S) is the kernel-smoothed vanna exposure at S
 * - k is the spot-vol coupling coefficient derived from the IV surface
 * 
 * Positive H(S) means a spot move toward S triggers dealer buying that
 * dampens the move (mean-reversion / "wall" behavior).
 * 
 * Negative H(S) means a spot move toward S triggers dealer selling that
 * amplifies the move (trend acceleration / "vacuum" behavior).
 * 
 * @param exposures - Per-strike gamma, vanna, charm exposures
 * @param ivSurface - The IV surface for regime derivation
 * @param config - Optional configuration for grid and kernel parameters
 * @returns Complete hedge impulse curve analysis
 */
export function computeHedgeImpulseCurve(
  exposures: ExposurePerExpiry,
  ivSurface: IVSurface,
  config: HedgeImpulseConfig = {},
): HedgeImpulseCurve {
  const {
    rangePercent = 3,
    stepPercent = 0.05,
    kernelWidthStrikes = 2,
  } = config;

  const spot = exposures.spotPrice;

  // Derive regime params and spot-vol coupling from IV surface
  const regimeParams = deriveRegimeParams(ivSurface, spot);
  const k = deriveSpotVolCoupling(regimeParams);

  // Extract strike-space data
  const strikes = exposures.strikeExposures.map(s => s.strikePrice);
  const gexValues = exposures.strikeExposures.map(s => s.gammaExposure);
  const vexValues = exposures.strikeExposures.map(s => s.vannaExposure);

  // Detect strike spacing and compute kernel width in price units
  const strikeSpacing = detectStrikeSpacing(strikes);
  const lambda = kernelWidthStrikes * strikeSpacing;

  // Build price grid
  const gridMin = spot * (1 - rangePercent / 100);
  const gridMax = spot * (1 + rangePercent / 100);
  const gridStep = spot * (stepPercent / 100);

  const curve: HedgeImpulsePoint[] = [];

  for (let price = gridMin; price <= gridMax; price += gridStep) {
    const gamma = kernelSmooth(strikes, gexValues, price, lambda);
    const vanna = kernelSmooth(strikes, vexValues, price, lambda);

    // H(S) = Gamma(S) - (k / S) * Vanna(S)
    const impulse = gamma - (k / price) * vanna;

    curve.push({ price, gamma, vanna, impulse });
  }

  // Compute impulse at current spot
  const impulseAtSpot = interpolateImpulseAtPrice(curve, spot);

  // Compute slope at current spot (dH/dS via central difference)
  const slopeAtSpot = computeSlopeAtPrice(curve, spot);

  // Find zero crossings
  const zeroCrossings = findZeroCrossings(curve);

  // Find local extrema
  const extrema = findExtrema(curve);

  // Compute directional asymmetry
  const asymmetry = computeAsymmetry(curve, spot);

  // Classify regime
  const regime = classifyRegime(impulseAtSpot, slopeAtSpot, asymmetry, curve, spot);

  // Find nearest attractors (positive impulse basins)
  const basinsAbove = extrema.filter(e => e.type === 'basin' && e.price > spot);
  const basinsBelow = extrema.filter(e => e.type === 'basin' && e.price < spot);

  const nearestAttractorAbove = basinsAbove.length > 0
    ? basinsAbove.reduce((a, b) => a.price < b.price ? a : b).price
    : null;
  const nearestAttractorBelow = basinsBelow.length > 0
    ? basinsBelow.reduce((a, b) => a.price > b.price ? a : b).price
    : null;

  return {
    spot,
    expiration: exposures.expiration,
    computedAt: Date.now(),
    spotVolCoupling: k,
    kernelWidth: lambda,
    strikeSpacing,
    curve,
    impulseAtSpot,
    slopeAtSpot,
    zeroCrossings,
    extrema,
    asymmetry,
    regime,
    nearestAttractorAbove,
    nearestAttractorBelow,
  };
}

/**
 * Interpolate impulse value at an arbitrary price within the curve
 */
function interpolateImpulseAtPrice(curve: HedgeImpulsePoint[], price: number): number {
  if (curve.length === 0) return 0;
  if (price <= curve[0].price) return curve[0].impulse;
  if (price >= curve[curve.length - 1].price) return curve[curve.length - 1].impulse;

  for (let i = 0; i < curve.length - 1; i++) {
    if (curve[i].price <= price && curve[i + 1].price >= price) {
      const t = (price - curve[i].price) / (curve[i + 1].price - curve[i].price);
      return curve[i].impulse + t * (curve[i + 1].impulse - curve[i].impulse);
    }
  }

  return 0;
}

/**
 * Compute slope of the impulse curve at a given price via central difference
 */
function computeSlopeAtPrice(curve: HedgeImpulsePoint[], price: number): number {
  if (curve.length < 3) return 0;

  // Find bracketing points
  const step = curve[1].price - curve[0].price;
  const above = interpolateImpulseAtPrice(curve, price + step);
  const below = interpolateImpulseAtPrice(curve, price - step);

  return (above - below) / (2 * step);
}

/**
 * Find all zero crossings of the impulse curve
 */
function findZeroCrossings(curve: HedgeImpulsePoint[]): ZeroCrossing[] {
  const crossings: ZeroCrossing[] = [];

  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i].impulse;
    const b = curve[i + 1].impulse;

    if (a * b < 0) {
      // Linear interpolation for crossing price
      const t = Math.abs(a) / (Math.abs(a) + Math.abs(b));
      const crossPrice = curve[i].price + t * (curve[i + 1].price - curve[i].price);

      crossings.push({
        price: crossPrice,
        direction: b > a ? 'rising' : 'falling',
      });
    }
  }

  return crossings;
}

/**
 * Find local extrema (basins and peaks) of the impulse curve
 */
function findExtrema(curve: HedgeImpulsePoint[]): ImpulseExtremum[] {
  const extrema: ImpulseExtremum[] = [];

  for (let i = 1; i < curve.length - 1; i++) {
    const prev = curve[i - 1].impulse;
    const curr = curve[i].impulse;
    const next = curve[i + 1].impulse;

    // Local maximum
    if (curr > prev && curr > next && curr > 0) {
      extrema.push({
        price: curve[i].price,
        impulse: curr,
        type: 'basin', // positive max = attractor
      });
    }

    // Local minimum
    if (curr < prev && curr < next && curr < 0) {
      extrema.push({
        price: curve[i].price,
        impulse: curr,
        type: 'peak', // negative min = accelerator
      });
    }
  }

  return extrema;
}

/**
 * Compute directional asymmetry by integrating impulse above and below spot.
 * 
 * The integration uses the trapezoidal rule over the default range of ±0.5% of spot.
 * The side with more negative impulse is the path of least resistance.
 */
function computeAsymmetry(
  curve: HedgeImpulsePoint[],
  spot: number,
  integrationRangePercent: number = 0.5,
): DirectionalAsymmetry {
  const rangePrice = spot * (integrationRangePercent / 100);

  // Integrate from spot to spot + range (upside)
  let upsideIntegral = 0;
  let downsideIntegral = 0;

  const step = curve.length > 1 ? curve[1].price - curve[0].price : 1;

  for (const point of curve) {
    if (point.price > spot && point.price <= spot + rangePrice) {
      upsideIntegral += point.impulse * step;
    }
    if (point.price < spot && point.price >= spot - rangePrice) {
      downsideIntegral += point.impulse * step;
    }
  }

  // More negative integral = more acceleration = path of least resistance
  let bias: 'up' | 'down' | 'neutral' = 'neutral';
  const threshold = Math.max(Math.abs(upsideIntegral), Math.abs(downsideIntegral)) * 0.1;

  if (upsideIntegral < downsideIntegral - threshold) {
    bias = 'up'; // Upside has more negative impulse = price gets pulled up
  } else if (downsideIntegral < upsideIntegral - threshold) {
    bias = 'down'; // Downside has more negative impulse = price gets pulled down
  }

  const denominator = Math.abs(downsideIntegral) || 1e-10;
  const asymmetryRatio = Math.abs(upsideIntegral) / denominator;

  return {
    upside: upsideIntegral,
    downside: downsideIntegral,
    integrationRangePercent,
    bias,
    asymmetryRatio,
  };
}

/**
 * Classify the current regime based on the impulse curve characteristics
 */
function classifyRegime(
  impulseAtSpot: number,
  slopeAtSpot: number,
  asymmetry: DirectionalAsymmetry,
  curve: HedgeImpulsePoint[],
  spot: number,
): ImpulseRegime {
  // Compute a threshold based on the curve's overall scale
  const impulseValues = curve.map(p => Math.abs(p.impulse));
  const meanAbsImpulse = impulseValues.reduce((a, b) => a + b, 0) / impulseValues.length;

  if (meanAbsImpulse === 0) return 'neutral';

  const normalizedAtSpot = impulseAtSpot / meanAbsImpulse;

  // Strong positive impulse at spot = pinned
  if (normalizedAtSpot > 0.5) {
    return 'pinned';
  }

  // Negative impulse at spot = expansion potential
  if (normalizedAtSpot < -0.3) {
    if (asymmetry.bias === 'up') return 'squeeze-up';
    if (asymmetry.bias === 'down') return 'squeeze-down';
    return 'expansion';
  }

  // Weak impulse at spot but strong asymmetry
  if (asymmetry.bias === 'up' && asymmetry.asymmetryRatio > 1.5) return 'squeeze-up';
  if (asymmetry.bias === 'down' && asymmetry.asymmetryRatio > 1.5) return 'squeeze-down';

  return 'neutral';
}
