import { getIVSurfaces, getIVForStrike } from '../volatility';
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

describe('getIVSurfaces', () => {
  it('should build IV surfaces for call and put options', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(95, 'call', futureExpiration, 7.50),
        createOption(100, 'call', futureExpiration, 4.50),
        createOption(105, 'call', futureExpiration, 2.50),
        createOption(95, 'put', futureExpiration, 2.00),
        createOption(100, 'put', futureExpiration, 4.00),
        createOption(105, 'put', futureExpiration, 7.00),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);

    // Should have 2 surfaces: one for calls, one for puts
    expect(surfaces.length).toBe(2);

    const callSurface = surfaces.find((s) => s.putCall === 'call');
    const putSurface = surfaces.find((s) => s.putCall === 'put');

    expect(callSurface).toBeDefined();
    expect(putSurface).toBeDefined();
    expect(callSurface!.strikes.length).toBe(3);
    expect(putSurface!.strikes.length).toBe(3);
  });

  it('should sort strikes in ascending order', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(110, 'call', futureExpiration, 1.50),
        createOption(90, 'call', futureExpiration, 11.50),
        createOption(100, 'call', futureExpiration, 5.50),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);
    const callSurface = surfaces.find((s) => s.putCall === 'call')!;

    expect(callSurface.strikes).toEqual([90, 100, 110]);
  });

  it('should calculate positive IVs', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(95, 'call', futureExpiration, 7.50),
        createOption(100, 'call', futureExpiration, 4.50),
        createOption(105, 'call', futureExpiration, 2.50),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);
    const callSurface = surfaces.find((s) => s.putCall === 'call')!;

    // All IVs should be positive percentages
    callSurface.rawIVs.forEach((iv) => {
      expect(iv).toBeGreaterThan(0);
    });
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
        createOption(100, 'call', exp1, 4.50),
        createOption(100, 'call', exp2, 6.50),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);

    // Should have 2 surfaces (one per expiration)
    expect(surfaces.length).toBe(2);
    expect(surfaces[0].expirationDate).not.toBe(surfaces[1].expirationDate);
  });

  it('should apply smoothing with totalvariance model', () => {
    // Create enough options for smoothing to work (needs >= 5 valid points)
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(90, 'call', futureExpiration, 11.00),
        createOption(95, 'call', futureExpiration, 7.50),
        createOption(100, 'call', futureExpiration, 4.50),
        createOption(105, 'call', futureExpiration, 2.50),
        createOption(110, 'call', futureExpiration, 1.20),
        createOption(115, 'call', futureExpiration, 0.50),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
    const callSurface = surfaces.find((s) => s.putCall === 'call')!;

    // Smoothed IVs should exist
    expect(callSurface.smoothedIVs.length).toBe(callSurface.rawIVs.length);
  });

  it('should handle empty options array', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);
    expect(surfaces.length).toBe(0);
  });
});

describe('getIVForStrike', () => {
  it('should lookup IV for specific strike', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(95, 'call', futureExpiration, 7.50),
        createOption(100, 'call', futureExpiration, 4.50),
        createOption(105, 'call', futureExpiration, 2.50),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);
    const iv = getIVForStrike(surfaces, futureExpiration, 'call', 100);

    expect(iv).toBeGreaterThan(0);
  });

  it('should return 0 for non-existent strike', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(100, 'call', futureExpiration, 4.50),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);
    const iv = getIVForStrike(surfaces, futureExpiration, 'call', 999);

    expect(iv).toBe(0);
  });

  it('should return 0 for wrong option type', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(100, 'call', futureExpiration, 4.50),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);
    const iv = getIVForStrike(surfaces, futureExpiration, 'put', 100);

    expect(iv).toBe(0);
  });

  it('should return 0 for wrong expiration', () => {
    const chain: OptionChain = {
      symbol: 'TEST',
      spot: 100,
      riskFreeRate: 0.05,
      dividendYield: 0.02,
      options: [
        createOption(100, 'call', futureExpiration, 4.50),
      ],
    };

    const surfaces = getIVSurfaces('blackscholes', 'none', chain);
    const wrongExpiration = futureExpiration + 1000000;
    const iv = getIVForStrike(surfaces, wrongExpiration, 'call', 100);

    expect(iv).toBe(0);
  });
});
