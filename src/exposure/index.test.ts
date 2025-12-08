import { calculateGammaVannaCharmExposures, calculateSharesNeededToCover } from '../exposure';
import { getIVSurfaces } from '../volatility';
import { OptionChain, NormalizedOption } from '../types';

// Helper to create a mock option
function createOption(
  strike: number,
  optionType: 'call' | 'put',
  expirationTimestamp: number,
  mark: number,
  openInterest: number = 1000
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
    impliedVolatility: 0.20,
    timestamp: Date.now(),
  };
}

// Create a future expiration (30 days from now)
const futureExpiration = Date.now() + 30 * 24 * 60 * 60 * 1000;

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
    const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

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
    const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

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
    const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

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
    const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

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
    const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

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
    const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

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
    const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

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
    const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

    expect(exposures.length).toBe(0);
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
