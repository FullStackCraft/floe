import { computePressureCloud, PressureCloud, PressureCloudConfig } from './pressurecloud';
import { HedgeImpulseCurve, HedgeImpulsePoint, ImpulseExtremum, ZeroCrossing, RegimeParams } from './types';

/** Gaussian: amplitude * exp(-(((x - center) / width)^2)) */
function gaussian(x: number, center: number, width: number, amplitude: number): number {
  const z = (x - center) / width;
  return amplitude * Math.exp(-(z * z));
}

// ============================================================================
// Test Helpers
// ============================================================================

/** Build a minimal HedgeImpulseCurve from a list of (price, impulse) pairs. */
function buildCurve(
  spot: number,
  points: Array<{ price: number; impulse: number }>,
  overrides: Partial<HedgeImpulseCurve> = {},
): HedgeImpulseCurve {
  const curve: HedgeImpulsePoint[] = points.map((p) => ({
    price: p.price,
    gamma: p.impulse > 0 ? p.impulse : 0,
    vanna: 0,
    impulse: p.impulse,
  }));

  // Auto-detect extrema (local maxima with impulse>0 = basin, local minima with impulse<0 = peak)
  const extrema: ImpulseExtremum[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].impulse;
    const curr = points[i].impulse;
    const next = points[i + 1].impulse;
    if (curr > prev && curr > next && curr > 0) {
      extrema.push({ price: points[i].price, impulse: curr, type: 'basin' });
    }
    if (curr < prev && curr < next && curr < 0) {
      extrema.push({ price: points[i].price, impulse: curr, type: 'peak' });
    }
  }

  // Auto-detect zero crossings
  const zeroCrossings: ZeroCrossing[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i].impulse;
    const next = points[i + 1].impulse;
    if (curr >= 0 && next < 0) {
      const frac = curr / (curr - next);
      zeroCrossings.push({
        price: points[i].price + frac * (points[i + 1].price - points[i].price),
        direction: 'falling',
      });
    } else if (curr <= 0 && next > 0) {
      const frac = Math.abs(curr) / (Math.abs(curr) + next);
      zeroCrossings.push({
        price: points[i].price + frac * (points[i + 1].price - points[i].price),
        direction: 'rising',
      });
    }
  }

  return {
    spot,
    expiration: Date.now() + 8 * 60 * 60 * 1000,
    computedAt: Date.now(),
    spotVolCoupling: 8,
    kernelWidth: 5,
    strikeSpacing: 5,
    curve,
    impulseAtSpot: 0,
    slopeAtSpot: 0,
    zeroCrossings,
    extrema,
    asymmetry: { upside: 0, downside: 0, integrationRangePercent: 0.5, bias: 'neutral', asymmetryRatio: 1 },
    regime: 'neutral',
    nearestAttractorAbove: null,
    nearestAttractorBelow: null,
    ...overrides,
  };
}

/** Build standard RegimeParams for testing. */
function buildRegimeParams(overrides: Partial<RegimeParams> = {}): RegimeParams {
  return {
    atmIV: 0.18,
    impliedSpotVolCorr: -0.7,
    impliedVolOfVol: 1.2,
    regime: 'normal',
    expectedDailySpotMove: 0.012,  // 1.2%
    expectedDailyVolMove: 0.05,
    ...overrides,
  };
}

/**
 * Build a synthetic impulse curve with a clear positive peak (basin) and a clear
 * negative trough (peak) at specified prices around spot.
 */
function buildTypicalCurve(spot: number): HedgeImpulseCurve {
  // Create a grid from -3% to +3% of spot with 0.1% steps
  const step = spot * 0.001;
  const points: Array<{ price: number; impulse: number }> = [];
  for (let i = -30; i <= 30; i++) {
    const price = spot + i * step;
    // Stability peak at -1% of spot (impulse = +500k at center, Gaussian)
    const stabilityCenter = spot * 0.99;
    const stabilityWidth = spot * 0.005;
    const stability = gaussian(price, stabilityCenter, stabilityWidth, 500000);
    // Acceleration trough at +1.5% of spot (impulse = -300k at center, Gaussian)
    const accelCenter = spot * 1.015;
    const accelWidth = spot * 0.004;
    const acceleration = gaussian(price, accelCenter, accelWidth, -300000);
    points.push({ price, impulse: stability + acceleration });
  }
  return buildCurve(spot, points);
}

// ============================================================================
// Tests
// ============================================================================

describe('computePressureCloud', () => {
  describe('basic zone extraction', () => {
    it('should extract stability zones at positive impulse peaks', () => {
      const spot = 500;
      const curve = buildTypicalCurve(spot);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      expect(cloud.stabilityZones.length).toBeGreaterThanOrEqual(1);
      const zone = cloud.stabilityZones[0];
      expect(zone.hedgeType).toBe('passive');
      expect(zone.center).toBeLessThan(spot); // below spot
      expect(zone.side).toBe('below-spot');
      expect(zone.tradeType).toBe('long');
      expect(zone.strength).toBeGreaterThan(0);
      expect(zone.strength).toBeLessThanOrEqual(1);
      expect(zone.lower).toBeLessThanOrEqual(zone.center);
      expect(zone.upper).toBeGreaterThanOrEqual(zone.center);
    });

    it('should extract acceleration zones at negative impulse troughs', () => {
      const spot = 500;
      const curve = buildTypicalCurve(spot);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      expect(cloud.accelerationZones.length).toBeGreaterThanOrEqual(1);
      const zone = cloud.accelerationZones[0];
      expect(zone.hedgeType).toBe('aggressive');
      expect(zone.center).toBeGreaterThan(spot); // above spot
      expect(zone.side).toBe('above-spot');
      expect(zone.tradeType).toBe('long'); // acceleration above = squeeze = long
      expect(zone.strength).toBeGreaterThan(0);
      expect(zone.strength).toBeLessThanOrEqual(1);
    });

    it('should produce price levels for every curve point', () => {
      const spot = 500;
      const curve = buildTypicalCurve(spot);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      expect(cloud.priceLevels.length).toBe(curve.curve.length);
      cloud.priceLevels.forEach((level) => {
        expect(typeof level.price).toBe('number');
        expect(typeof level.stabilityScore).toBe('number');
        expect(typeof level.accelerationScore).toBe('number');
        expect(typeof level.expectedHedgeContracts).toBe('number');
        expect(typeof level.hedgeContracts).toBe('object');
        expect(['passive', 'aggressive']).toContain(level.hedgeType);
      });
    });

    it('should set correct spot and expiration on the result', () => {
      const spot = 500;
      const curve = buildTypicalCurve(spot);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      expect(cloud.spot).toBe(spot);
      expect(cloud.expiration).toBe(curve.expiration);
      expect(cloud.computedAt).toBeGreaterThan(0);
    });
  });

  describe('reachability weighting', () => {
    it('should give nearby zones higher strength than distant zones', () => {
      const spot = 500;
      // Build a curve with two identical-magnitude basins: one near, one far
      const nearCenter = spot * 0.995;  // 0.5% below
      const farCenter = spot * 0.95;    // 5% below
      const points: Array<{ price: number; impulse: number }> = [];
      const step = spot * 0.001;
      for (let i = -60; i <= 10; i++) {
        const price = spot + i * step;
        const nearPeak = gaussian(price, nearCenter, spot * 0.003, 500000);
        const farPeak = gaussian(price, farCenter, spot * 0.003, 500000);
        points.push({ price, impulse: nearPeak + farPeak });
      }
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();

      const cloud = computePressureCloud(curve, params);
      expect(cloud.stabilityZones.length).toBeGreaterThanOrEqual(2);

      // The near zone should be first (higher strength) since zones are sorted by strength
      const nearZone = cloud.stabilityZones.find((z) => Math.abs(z.center - nearCenter) < spot * 0.01);
      const farZone = cloud.stabilityZones.find((z) => Math.abs(z.center - farCenter) < spot * 0.01);
      expect(nearZone).toBeDefined();
      expect(farZone).toBeDefined();
      expect(nearZone!.strength).toBeGreaterThan(farZone!.strength);
    });

    it('should heavily penalize zones beyond reachabilityMultiple * expectedDailySpotMove', () => {
      const spot = 500;
      // One basin way out at 10% away from spot
      const farCenter = spot * 0.90;
      const points: Array<{ price: number; impulse: number }> = [];
      const step = spot * 0.002;
      for (let i = -60; i <= 5; i++) {
        const price = spot + i * step;
        const peak = gaussian(price, farCenter, spot * 0.005, 1000000);
        points.push({ price, impulse: peak });
      }
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams({ expectedDailySpotMove: 0.01 }); // 1% daily move

      const cloud = computePressureCloud(curve, params, { reachabilityMultiple: 2.0 });

      // The zone at 10% distance should have very low strength (reachRange = 2 * 0.01 * 500 = 10 points)
      // Distance is 50 points, so proximity = exp(-(50/10)^2) = exp(-25) ≈ 0
      if (cloud.stabilityZones.length > 0) {
        expect(cloud.stabilityZones[0].strength).toBeLessThan(0.01);
      }
    });
  });

  describe('regime edges', () => {
    it('should identify zero crossings as regime edges', () => {
      const spot = 500;
      const curve = buildTypicalCurve(spot);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      // The typical curve has positive then negative impulse, so there must be zero crossings
      expect(cloud.regimeEdges.length).toBeGreaterThan(0);
      cloud.regimeEdges.forEach((edge) => {
        expect(typeof edge.price).toBe('number');
        expect(['stable-to-unstable', 'unstable-to-stable']).toContain(edge.transitionType);
      });
    });

    it('should mark falling crossing below spot as stable-to-unstable', () => {
      const spot = 500;
      // Build curve: positive impulse below spot transitioning to negative above spot
      // This creates a falling crossing (impulse + → -) somewhere around spot
      const points: Array<{ price: number; impulse: number }> = [];
      const step = spot * 0.001;
      for (let i = -20; i <= 20; i++) {
        const price = spot + i * step;
        // Linear: positive at low prices, negative at high prices, zero around spot-1%
        const impulse = -100000 * ((price - spot * 0.99) / (spot * 0.02));
        points.push({ price, impulse });
      }
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      // Find the falling crossing below spot
      const fallingBelowSpot = cloud.regimeEdges.find(
        (e) => e.price < spot,
      );
      if (fallingBelowSpot) {
        expect(fallingBelowSpot.transitionType).toBe('stable-to-unstable');
      }
    });

    it('should mark rising crossing below spot as unstable-to-stable', () => {
      const spot = 500;
      // Build curve: negative impulse at low prices, positive at higher prices (but still below spot)
      const points: Array<{ price: number; impulse: number }> = [];
      const step = spot * 0.001;
      for (let i = -20; i <= 20; i++) {
        const price = spot + i * step;
        // impulse goes from negative to positive around spot-1%
        const impulse = 100000 * ((price - spot * 0.99) / (spot * 0.02));
        points.push({ price, impulse });
      }
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      const risingBelowSpot = cloud.regimeEdges.find(
        (e) => e.price < spot,
      );
      if (risingBelowSpot) {
        expect(risingBelowSpot.transitionType).toBe('unstable-to-stable');
      }
    });
  });

  describe('hedge contract conversion', () => {
    it('should compute correct NQ contract counts', () => {
      const spot = 500;
      const impulse = 100000; // $100k
      // contracts = impulse / (multiplier * spot * 0.01)
      // NQ: 100000 / (20 * 500 * 0.01) = 100000 / 100 = 1000
      const points = [
        { price: 499, impulse: 0 },
        { price: 500, impulse },
        { price: 501, impulse: 0 },
      ];
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      // Find the level at spot
      const atSpot = cloud.priceLevels.find((l) => l.price === 500);
      expect(atSpot).toBeDefined();
      expect(atSpot!.hedgeContracts.nq).toBeCloseTo(1000, 0);
      expect(atSpot!.hedgeContracts.mnq).toBeCloseTo(10000, 0);
      expect(atSpot!.hedgeContracts.es).toBeCloseTo(400, 0);
      expect(atSpot!.hedgeContracts.mes).toBeCloseTo(4000, 0);

      // Legacy field should match NQ default (contractMultiplier=20)
      expect(atSpot!.expectedHedgeContracts).toBeCloseTo(1000, 0);
    });

    it('should verify multi-product math: MNQ = 10x NQ, ES = 0.4x NQ, MES = 4x NQ', () => {
      const spot = 20000; // NQ-like price
      const impulse = 5000000; // $5M
      const points = [
        { price: 19990, impulse: 0 },
        { price: 20000, impulse },
        { price: 20010, impulse: 0 },
      ];
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      const atSpot = cloud.priceLevels.find((l) => l.price === 20000);
      expect(atSpot).toBeDefined();

      // NQ: 5000000 / (20 * 20000 * 0.01) = 5000000 / 4000 = 1250
      expect(atSpot!.hedgeContracts.nq).toBeCloseTo(1250, 0);
      // MNQ: 5000000 / (2 * 20000 * 0.01) = 5000000 / 400 = 12500
      expect(atSpot!.hedgeContracts.mnq).toBeCloseTo(12500, 0);
      // ES: 5000000 / (50 * 20000 * 0.01) = 5000000 / 10000 = 500
      expect(atSpot!.hedgeContracts.es).toBeCloseTo(500, 0);
      // MES: 5000000 / (5 * 20000 * 0.01) = 5000000 / 1000 = 5000
      expect(atSpot!.hedgeContracts.mes).toBeCloseTo(5000, 0);
    });

    it('should preserve sign: positive impulse → positive contracts (dealers buying)', () => {
      const spot = 500;
      const points = [
        { price: 499, impulse: 0 },
        { price: 500, impulse: 100000 },
        { price: 501, impulse: 0 },
      ];
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      const atSpot = cloud.priceLevels.find((l) => l.price === 500);
      expect(atSpot!.hedgeContracts.nq).toBeGreaterThan(0);
      expect(atSpot!.hedgeContracts.mnq).toBeGreaterThan(0);
      expect(atSpot!.hedgeContracts.es).toBeGreaterThan(0);
      expect(atSpot!.hedgeContracts.mes).toBeGreaterThan(0);
    });

    it('should preserve sign: negative impulse → negative contracts (dealers selling)', () => {
      const spot = 500;
      const points = [
        { price: 499, impulse: 0 },
        { price: 500, impulse: -200000 },
        { price: 501, impulse: 0 },
      ];
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      const atSpot = cloud.priceLevels.find((l) => l.price === 500);
      expect(atSpot!.hedgeContracts.nq).toBeLessThan(0);
      expect(atSpot!.hedgeContracts.mnq).toBeLessThan(0);
      expect(atSpot!.hedgeContracts.es).toBeLessThan(0);
      expect(atSpot!.hedgeContracts.mes).toBeLessThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty impulse curve', () => {
      const curve = buildCurve(500, []);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      expect(cloud.stabilityZones).toEqual([]);
      expect(cloud.accelerationZones).toEqual([]);
      expect(cloud.regimeEdges).toEqual([]);
      expect(cloud.priceLevels).toEqual([]);
    });

    it('should handle flat impulse curve (all zeros)', () => {
      const spot = 500;
      const step = spot * 0.001;
      const points = Array.from({ length: 20 }, (_, i) => ({
        price: spot - 10 * step + i * step,
        impulse: 0,
      }));
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      expect(cloud.stabilityZones).toEqual([]);
      expect(cloud.accelerationZones).toEqual([]);
      expect(cloud.regimeEdges).toEqual([]);
      expect(cloud.priceLevels.length).toBe(20);
      cloud.priceLevels.forEach((level) => {
        expect(level.stabilityScore).toBe(0);
        expect(level.accelerationScore).toBe(0);
        expect(level.expectedHedgeContracts).toBe(0);
        expect(level.hedgeContracts.nq).toBe(0);
      });
    });

    it('should produce only stability zones for all-positive impulse', () => {
      const spot = 500;
      const step = spot * 0.001;
      const points: Array<{ price: number; impulse: number }> = [];
      for (let i = -10; i <= 10; i++) {
        const price = spot + i * step;
        // Bell-shaped positive impulse centered at spot
        const impulse = gaussian(price, spot, spot * 0.005, 500000);
        points.push({ price, impulse: Math.max(impulse, 1) }); // ensure always positive
      }
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      expect(cloud.accelerationZones).toEqual([]);
      // Should have at least one stability zone (at the peak)
      if (cloud.stabilityZones.length > 0) {
        cloud.stabilityZones.forEach((z) => expect(z.hedgeType).toBe('passive'));
      }
      // All price levels should have hedgeType = 'passive'
      cloud.priceLevels.forEach((l) => expect(l.hedgeType).toBe('passive'));
    });

    it('should produce only acceleration zones for all-negative impulse', () => {
      const spot = 500;
      const step = spot * 0.001;
      const points: Array<{ price: number; impulse: number }> = [];
      for (let i = -10; i <= 10; i++) {
        const price = spot + i * step;
        // Bell-shaped negative impulse centered at spot
        const impulse = gaussian(price, spot, spot * 0.005, -500000);
        points.push({ price, impulse: Math.min(impulse, -1) }); // ensure always negative
      }
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();
      const cloud = computePressureCloud(curve, params);

      expect(cloud.stabilityZones).toEqual([]);
      if (cloud.accelerationZones.length > 0) {
        cloud.accelerationZones.forEach((z) => expect(z.hedgeType).toBe('aggressive'));
      }
      // All price levels should have hedgeType = 'aggressive'
      cloud.priceLevels.forEach((l) => expect(l.hedgeType).toBe('aggressive'));
    });
  });

  describe('configuration', () => {
    it('should respect custom contractMultiplier for legacy field', () => {
      const spot = 500;
      const impulse = 100000;
      const points = [
        { price: 499, impulse: 0 },
        { price: 500, impulse },
        { price: 501, impulse: 0 },
      ];
      const curve = buildCurve(spot, points);
      const params = buildRegimeParams();

      // MNQ multiplier = 2
      const cloud = computePressureCloud(curve, params, { contractMultiplier: 2 });
      const atSpot = cloud.priceLevels.find((l) => l.price === 500);
      expect(atSpot).toBeDefined();
      // Legacy: 100000 / (2 * 500 * 0.01) = 100000 / 10 = 10000
      expect(atSpot!.expectedHedgeContracts).toBeCloseTo(10000, 0);
      // Multi-product hedgeContracts should still use standard multipliers
      expect(atSpot!.hedgeContracts.nq).toBeCloseTo(1000, 0);
    });

    it('should respect custom zoneThreshold', () => {
      const spot = 500;
      const curve = buildTypicalCurve(spot);
      const params = buildRegimeParams();

      // Very high threshold should filter out most zones
      const strict = computePressureCloud(curve, params, { zoneThreshold: 0.99 });
      const loose = computePressureCloud(curve, params, { zoneThreshold: 0.01 });

      expect(loose.stabilityZones.length).toBeGreaterThanOrEqual(strict.stabilityZones.length);
    });
  });
});
