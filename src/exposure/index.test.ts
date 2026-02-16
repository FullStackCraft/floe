import {
  calculateGammaVannaCharmExposures,
  calculateSharesNeededToCover,
} from '../exposure';
import { calculateGreeks } from '../blackscholes';
import { getIVSurfaces } from '../volatility';
import { OptionChain, NormalizedOption, ExposureCalculationOptions, ExposurePerExpiry } from '../types';

// Helper to create a mock option
function createOption(
  strike: number,
  optionType: 'call' | 'put',
  expirationTimestamp: number,
  mark: number,
  openInterest: number = 1000,
  liveOpenInterest?: number
): NormalizedOption {
  return {
    occSymbol: `TEST${new Date(expirationTimestamp).toISOString().slice(2, 10).replace(/-/g, '')}${optionType === 'call' ? 'C' : 'P'}${String(strike * 1000).padStart(8, '0')}`,
    underlying: 'TEST',
    strike,
    expiration: new Date(expirationTimestamp).toISOString(),
    expirationTimestamp,
    optionType,
    bid: mark - 0.05,
    bidSize: 10,
    ask: mark + 0.05,
    askSize: 10,
    mark,
    last: mark,
    volume: 100,
    openInterest,
    liveOpenInterest,
    impliedVolatility: 0.20,
    timestamp: Date.now(),
  };
}

// Create a future expiration (30 days from now)
const futureExpiration = Date.now() + 30 * 24 * 60 * 60 * 1000;

function getCanonicalExposures(
  chain: OptionChain,
  ivSurfaces: ReturnType<typeof getIVSurfaces>,
  options: ExposureCalculationOptions = {}
): ExposurePerExpiry[] {
  const variants = calculateGammaVannaCharmExposures(chain, ivSurfaces, options);
  return variants.map(v => ({
    spotPrice: v.spotPrice,
    expiration: v.expiration,
    ...v.canonical,
  }));
}

describe('calculateGammaVannaCharmExposures', () => {
  it('should calculate exposures for a simple option chain', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(95, 'call', futureExpiration, 7.50, 5000),
        createOption(100, 'call', futureExpiration, 4.50, 10000),
        createOption(105, 'call', futureExpiration, 2.50, 8000),
        createOption(95, 'put', futureExpiration, 2.00, 4000),
        createOption(100, 'put', futureExpiration, 4.00, 12000),
        createOption(105, 'put', futureExpiration, 7.00, 6000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const exposures = getCanonicalExposures(chain, ivSurfaces);

    expect(exposures.length).toBe(1); // One expiration
    expect(exposures[0].spotPrice).toBe(100);
    expect(exposures[0].expiration).toBe(futureExpiration);
  });

  it('should include per-strike exposures', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(95, 'call', futureExpiration, 7.50, 5000),
        createOption(100, 'call', futureExpiration, 4.50, 10000),
        createOption(95, 'put', futureExpiration, 2.00, 4000),
        createOption(100, 'put', futureExpiration, 4.00, 12000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const exposures = getCanonicalExposures(chain, ivSurfaces);

    // Should have 2 strike exposures (95 and 100)
    expect(exposures[0].strikeExposures.length).toBe(2);

    // Each strike exposure should have all required fields
    const strikeExp = exposures[0].strikeExposures[0];
    expect(typeof strikeExp.strikePrice).toBe('number');
    expect(typeof strikeExp.gammaExposure).toBe('number');
    expect(typeof strikeExp.vannaExposure).toBe('number');
    expect(typeof strikeExp.charmExposure).toBe('number');
    expect(typeof strikeExp.netExposure).toBe('number');
  });

  it('should calculate total exposures', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(95, 'call', futureExpiration, 7.50, 5000),
        createOption(100, 'call', futureExpiration, 4.50, 10000),
        createOption(95, 'put', futureExpiration, 2.00, 4000),
        createOption(100, 'put', futureExpiration, 4.00, 12000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const exposures = getCanonicalExposures(chain, ivSurfaces);

    const exp = exposures[0];
    expect(typeof exp.totalGammaExposure).toBe('number');
    expect(typeof exp.totalVannaExposure).toBe('number');
    expect(typeof exp.totalCharmExposure).toBe('number');
    expect(typeof exp.totalNetExposure).toBe('number');

    // Net should be sum of the three
    expect(exp.totalNetExposure).toBeCloseTo(
      exp.totalGammaExposure + exp.totalVannaExposure + exp.totalCharmExposure,
      5
    );
  });

  it('should identify strikes of max and min exposures', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(95, 'call', futureExpiration, 7.50, 5000),
        createOption(100, 'call', futureExpiration, 4.50, 10000),
        createOption(105, 'call', futureExpiration, 2.50, 8000),
        createOption(95, 'put', futureExpiration, 2.00, 4000),
        createOption(100, 'put', futureExpiration, 4.00, 12000),
        createOption(105, 'put', futureExpiration, 7.00, 6000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const exposures = getCanonicalExposures(chain, ivSurfaces);

    const exp = exposures[0];
    expect([95, 100, 105]).toContain(exp.strikeOfMaxGamma);
    expect([95, 100, 105]).toContain(exp.strikeOfMinGamma);
    expect([95, 100, 105]).toContain(exp.strikeOfMaxVanna);
    expect([95, 100, 105]).toContain(exp.strikeOfMinVanna);
    expect([95, 100, 105]).toContain(exp.strikeOfMaxCharm);
    expect([95, 100, 105]).toContain(exp.strikeOfMinCharm);
  });

  it('should handle multiple expirations', () => {
    const exp1 = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const exp2 = Date.now() + 60 * 24 * 60 * 60 * 1000;

    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(100, 'call', exp1, 4.50, 10000),
        createOption(100, 'put', exp1, 4.00, 10000),
        createOption(100, 'call', exp2, 6.50, 8000),
        createOption(100, 'put', exp2, 5.50, 8000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const exposures = getCanonicalExposures(chain, ivSurfaces);

    expect(exposures.length).toBe(2);
    expect(exposures[0].expiration).toBe(exp1);
    expect(exposures[1].expiration).toBe(exp2);
  });

  it('should skip past expirations', () => {
    const pastExpiration = Date.now() - 1000; // In the past

    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(100, 'call', pastExpiration, 4.50, 10000),
        createOption(100, 'put', pastExpiration, 4.00, 10000),
        createOption(100, 'call', futureExpiration, 4.50, 10000),
        createOption(100, 'put', futureExpiration, 4.00, 10000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const exposures = getCanonicalExposures(chain, ivSurfaces);

    // Should only have the future expiration
    expect(exposures.length).toBe(1);
    expect(exposures[0].expiration).toBe(futureExpiration);
  });

  it('should skip strikes without matching put/call pair', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        // Only call at 100, no put
        createOption(100, 'call', futureExpiration, 4.50, 10000),
        // Only put at 105, no call
        createOption(105, 'put', futureExpiration, 7.00, 8000),
        // Complete pair at 95
        createOption(95, 'call', futureExpiration, 7.50, 5000),
        createOption(95, 'put', futureExpiration, 2.00, 4000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const exposures = getCanonicalExposures(chain, ivSurfaces);

    // Should only have strike 95 (the only complete pair)
    expect(exposures[0].strikeExposures.length).toBe(1);
    expect(exposures[0].strikeExposures[0].strikePrice).toBe(95);
  });

  it('should return empty array for empty options', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const exposures = getCanonicalExposures(chain, ivSurfaces);

    expect(exposures.length).toBe(0);
  });

  it('should keep default API aligned to canonical variant', () => {
    const now = Date.now();
    const expiration = now + 10 * 24 * 60 * 60 * 1000;

    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(100, 'call', expiration, 4.5, 10000),
        createOption(100, 'put', expiration, 4.0, 9000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const canonical = getCanonicalExposures(chain, ivSurfaces, { asOfTimestamp: now });
    const variants = calculateGammaVannaCharmExposures(chain, ivSurfaces, { asOfTimestamp: now });

    expect(canonical.length).toBe(1);
    expect(variants.length).toBe(1);
    expect(canonical[0].totalGammaExposure).toBeCloseTo(variants[0].canonical.totalGammaExposure, 8);
    expect(canonical[0].totalVannaExposure).toBeCloseTo(variants[0].canonical.totalVannaExposure, 8);
    expect(canonical[0].totalCharmExposure).toBeCloseTo(variants[0].canonical.totalCharmExposure, 8);
  });

  it('should compute canonical VEX/CEX without IV-level or time-to-expiry weighting', () => {
    const now = Date.now();
    const expiration = now + 7 * 24 * 60 * 60 * 1000;

    const callOI = 12000;
    const putOI = 8000;

    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(100, 'call', expiration, 4.5, callOI),
        createOption(100, 'put', expiration, 4.0, putOI),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const variants = calculateGammaVannaCharmExposures(chain, ivSurfaces, { asOfTimestamp: now });
    const row = variants[0];

    const callIV = ivSurfaces.find(s => s.expirationDate === expiration && s.putCall === 'call')?.smoothedIVs[0] ?? 0;
    const putIV = ivSurfaces.find(s => s.expirationDate === expiration && s.putCall === 'put')?.smoothedIVs[0] ?? 0;
    const timeToExpiry = (expiration - now) / (365 * 24 * 60 * 60 * 1000);

    const callGreeks = calculateGreeks({
      spot: chain.spot,
      strike: 100,
      timeToExpiry,
      volatility: callIV / 100,
      riskFreeRate: chain.riskFreeRate,
      dividendYield: chain.dividendYield,
      optionType: 'call',
    });

    const putGreeks = calculateGreeks({
      spot: chain.spot,
      strike: 100,
      timeToExpiry,
      volatility: putIV / 100,
      riskFreeRate: chain.riskFreeRate,
      dividendYield: chain.dividendYield,
      optionType: 'put',
    });

    const expectedCanonicalVanna =
      -callOI * callGreeks.vanna * (chain.spot * 100) * 0.01 +
      putOI * putGreeks.vanna * (chain.spot * 100) * 0.01;
    const expectedCanonicalCharm =
      -callOI * callGreeks.charm * (chain.spot * 100) +
      putOI * putGreeks.charm * (chain.spot * 100);

    expect(row.canonical.totalVannaExposure).toBeCloseTo(expectedCanonicalVanna, 6);
    expect(row.canonical.totalCharmExposure).toBeCloseTo(expectedCanonicalCharm, 6);
  });

  it('should expose state-weighted mode separately from canonical mode', () => {
    const now = Date.now();
    const expiration = now + 5 * 24 * 60 * 60 * 1000;

    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(95, 'call', expiration, 7.5, 5000),
        createOption(95, 'put', expiration, 2.0, 5000),
        createOption(100, 'call', expiration, 4.5, 10000),
        createOption(100, 'put', expiration, 4.0, 10000),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const variants = calculateGammaVannaCharmExposures(chain, ivSurfaces, { asOfTimestamp: now });
    const row = variants[0];

    // Gamma remains canonical in state-weighted mode.
    expect(row.stateWeighted.totalGammaExposure).toBeCloseTo(row.canonical.totalGammaExposure, 8);
    // Vanna and charm are expected to differ due to state weighting.
    expect(row.stateWeighted.totalVannaExposure).not.toBeCloseTo(row.canonical.totalVannaExposure, 4);
    expect(row.stateWeighted.totalCharmExposure).not.toBeCloseTo(row.canonical.totalCharmExposure, 4);
  });

  it('should compute flow delta mode from live open interest changes', () => {
    const now = Date.now();
    const expiration = now + 3 * 24 * 60 * 60 * 1000;

    const callOI = 10000;
    const putOI = 9000;
    const callLiveOI = 10200; // +200 flow
    const putLiveOI = 8800;   // -200 flow

    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(100, 'call', expiration, 4.5, callOI, callLiveOI),
        createOption(100, 'put', expiration, 4.0, putOI, putLiveOI),
      ],
    };

    const ivSurfaces = getIVSurfaces('blackscholes', 'none', chain);
    const variants = calculateGammaVannaCharmExposures(chain, ivSurfaces, { asOfTimestamp: now });
    const row = variants[0];

    expect(Math.abs(row.flowDelta.totalGammaExposure)).toBeGreaterThan(0);
    expect(Math.abs(row.flowDelta.totalVannaExposure)).toBeGreaterThan(0);
    expect(Math.abs(row.flowDelta.totalCharmExposure)).toBeGreaterThan(0);

    const callIV = ivSurfaces.find(s => s.expirationDate === expiration && s.putCall === 'call')?.smoothedIVs[0] ?? 0;
    const putIV = ivSurfaces.find(s => s.expirationDate === expiration && s.putCall === 'put')?.smoothedIVs[0] ?? 0;
    const timeToExpiry = (expiration - now) / (365 * 24 * 60 * 60 * 1000);

    const callGreeks = calculateGreeks({
      spot: chain.spot,
      strike: 100,
      timeToExpiry,
      volatility: callIV / 100,
      riskFreeRate: chain.riskFreeRate,
      dividendYield: chain.dividendYield,
      optionType: 'call',
    });

    const putGreeks = calculateGreeks({
      spot: chain.spot,
      strike: 100,
      timeToExpiry,
      volatility: putIV / 100,
      riskFreeRate: chain.riskFreeRate,
      dividendYield: chain.dividendYield,
      optionType: 'put',
    });

    const callDeltaOI = callLiveOI - callOI;
    const putDeltaOI = putLiveOI - putOI;

    const expectedFlowGamma =
      -callDeltaOI * callGreeks.gamma * (chain.spot * 100) * chain.spot * 0.01 +
      putDeltaOI * putGreeks.gamma * (chain.spot * 100) * chain.spot * 0.01;
    const expectedFlowVanna =
      -callDeltaOI * callGreeks.vanna * (chain.spot * 100) * 0.01 +
      putDeltaOI * putGreeks.vanna * (chain.spot * 100) * 0.01;
    const expectedFlowCharm =
      -callDeltaOI * callGreeks.charm * (chain.spot * 100) +
      putDeltaOI * putGreeks.charm * (chain.spot * 100);

    expect(row.flowDelta.totalGammaExposure).toBeCloseTo(expectedFlowGamma, 6);
    expect(row.flowDelta.totalVannaExposure).toBeCloseTo(expectedFlowVanna, 6);
    expect(row.flowDelta.totalCharmExposure).toBeCloseTo(expectedFlowCharm, 6);
  });
});

describe('calculateSharesNeededToCover', () => {
  it('should calculate shares needed for negative exposure', () => {
    const result = calculateSharesNeededToCover(1000000000, -5000000, 100);

    expect(result.actionToCover).toBe('BUY');
    expect(result.sharesToCover).toBeGreaterThan(0);
    expect(typeof result.impliedMoveToCover).toBe('number');
    expect(typeof result.resultingSpotToCover).toBe('number');
  });

  it('should calculate shares needed for positive exposure', () => {
    const result = calculateSharesNeededToCover(1000000000, 5000000, 100);

    expect(result.actionToCover).toBe('SELL');
    expect(result.sharesToCover).toBeGreaterThan(0);
  });

  it('should handle zero shares outstanding', () => {
    const result = calculateSharesNeededToCover(0, 5000000, 100);

    expect(result.actionToCover).toBe('');
    expect(result.sharesToCover).toBe(0);
    expect(result.impliedMoveToCover).toBe(0);
  });

  it('should handle zero underlying price', () => {
    const result = calculateSharesNeededToCover(1000000000, 5000000, 0);

    expect(result.actionToCover).toBe('');
    expect(result.sharesToCover).toBe(0);
  });

  it('should handle zero exposure', () => {
    const result = calculateSharesNeededToCover(1000000000, 0, 100);

    expect(result.sharesToCover).toBe(0);
    expect(result.resultingSpotToCover).toBe(100);
  });
});
