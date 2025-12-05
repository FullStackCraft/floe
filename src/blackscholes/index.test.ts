import { blackScholes, calculateGreeks, calculateImpliedVolatility } from '../blackscholes';

describe('blackScholes', () => {
  it('should calculate call option price correctly', () => {
    const price = blackScholes({
      spot: 100,
      strike: 100,
      timeToExpiry: 1,
      volatility: 0.20,
      riskFreeRate: 0.05,
      optionType: 'call',
    });

    // Expected value approximately 10.45 (from Black-Scholes calculator)
    expect(price).toBeGreaterThan(10);
    expect(price).toBeLessThan(11);
  });

  it('should calculate put option price correctly', () => {
    const price = blackScholes({
      spot: 100,
      strike: 100,
      timeToExpiry: 1,
      volatility: 0.20,
      riskFreeRate: 0.05,
      optionType: 'put',
    });

    // Expected value approximately 5.57 (from Black-Scholes calculator)
    expect(price).toBeGreaterThan(5);
    expect(price).toBeLessThan(6);
  });

  it('should handle zero time to expiry', () => {
    const callPrice = blackScholes({
      spot: 110,
      strike: 100,
      timeToExpiry: 0,
      volatility: 0.20,
      riskFreeRate: 0.05,
      optionType: 'call',
    });

    // At expiry with zero time, returns 0 due to safety check
    expect(callPrice).toBe(0);
  });

  it('should satisfy put-call parity', () => {
    const S = 100;
    const K = 105;
    const r = 0.05;
    const q = 0.02;
    const T = 0.25;
    const vol = 0.20;

    const callPrice = blackScholes({
      spot: S,
      strike: K,
      timeToExpiry: T,
      volatility: vol,
      riskFreeRate: r,
      dividendYield: q,
      optionType: 'call',
    });

    const putPrice = blackScholes({
      spot: S,
      strike: K,
      timeToExpiry: T,
      volatility: vol,
      riskFreeRate: r,
      dividendYield: q,
      optionType: 'put',
    });

    // Put-call parity: C - P = S*e^(-qT) - K*e^(-rT)
    const parityLHS = callPrice - putPrice;
    const parityRHS = S * Math.exp(-q * T) - K * Math.exp(-r * T);

    expect(Math.abs(parityLHS - parityRHS)).toBeLessThan(0.01);
  });

  it('should handle deep in-the-money call', () => {
    const price = blackScholes({
      spot: 150,
      strike: 100,
      timeToExpiry: 0.25,
      volatility: 0.20,
      riskFreeRate: 0.05,
      optionType: 'call',
    });

    // Deep ITM call should be close to intrinsic value
    expect(price).toBeGreaterThan(49);
    expect(price).toBeLessThan(52);
  });

  it('should handle deep out-of-the-money put', () => {
    const price = blackScholes({
      spot: 150,
      strike: 100,
      timeToExpiry: 0.25,
      volatility: 0.20,
      riskFreeRate: 0.05,
      optionType: 'put',
    });

    // Deep OTM put should be very cheap
    expect(price).toBeLessThan(0.01);
  });
});

describe('calculateGreeks', () => {
  const baseParams = {
    spot: 100,
    strike: 100,
    timeToExpiry: 0.25,
    volatility: 0.20,
    riskFreeRate: 0.05,
    optionType: 'call' as const,
  };

  it('should calculate delta for ATM call close to 0.5', () => {
    const greeks = calculateGreeks(baseParams);
    // ATM call delta should be around 0.5-0.6
    expect(greeks.delta).toBeGreaterThan(0.5);
    expect(greeks.delta).toBeLessThan(0.65);
  });

  it('should calculate negative delta for put', () => {
    const greeks = calculateGreeks({ ...baseParams, optionType: 'put' });
    expect(greeks.delta).toBeLessThan(0);
    expect(greeks.delta).toBeGreaterThan(-0.5);
  });

  it('should calculate positive gamma', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.gamma).toBeGreaterThan(0);
  });

  it('should have same gamma for call and put', () => {
    const callGreeks = calculateGreeks(baseParams);
    const putGreeks = calculateGreeks({ ...baseParams, optionType: 'put' });
    expect(callGreeks.gamma).toBeCloseTo(putGreeks.gamma, 4);
  });

  it('should calculate negative theta (time decay)', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.theta).toBeLessThan(0);
  });

  it('should calculate positive vega', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.vega).toBeGreaterThan(0);
  });

  it('should have same vega for call and put', () => {
    const callGreeks = calculateGreeks(baseParams);
    const putGreeks = calculateGreeks({ ...baseParams, optionType: 'put' });
    expect(callGreeks.vega).toBeCloseTo(putGreeks.vega, 4);
  });

  it('should calculate positive rho for call', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.rho).toBeGreaterThan(0);
  });

  it('should calculate negative rho for put', () => {
    const greeks = calculateGreeks({ ...baseParams, optionType: 'put' });
    expect(greeks.rho).toBeLessThan(0);
  });

  it('should return zero greeks for invalid params', () => {
    const greeks = calculateGreeks({
      ...baseParams,
      volatility: 0, // Invalid
    });
    expect(greeks.delta).toBe(0);
    expect(greeks.gamma).toBe(0);
  });

  it('should include second-order greeks', () => {
    const greeks = calculateGreeks(baseParams);
    expect(typeof greeks.vanna).toBe('number');
    expect(typeof greeks.charm).toBe('number');
    expect(typeof greeks.volga).toBe('number');
  });

  it('should include third-order greeks', () => {
    const greeks = calculateGreeks(baseParams);
    expect(typeof greeks.speed).toBe('number');
    expect(typeof greeks.zomma).toBe('number');
    expect(typeof greeks.color).toBe('number');
    expect(typeof greeks.ultima).toBe('number');
  });
});

describe('calculateImpliedVolatility', () => {
  it('should recover known volatility from price', () => {
    const knownVol = 0.25; // 25%
    const spot = 100;
    const strike = 105;
    const r = 0.05;
    const q = 0.02;
    const T = 0.25;

    // First calculate the price at known vol
    const price = blackScholes({
      spot,
      strike,
      timeToExpiry: T,
      volatility: knownVol,
      riskFreeRate: r,
      dividendYield: q,
      optionType: 'call',
    });

    // Now recover the IV
    const iv = calculateImpliedVolatility(price, spot, strike, r, q, T, 'call');

    // IV is returned as percentage
    expect(iv).toBeCloseTo(knownVol * 100, 1);
  });

  it('should handle put options', () => {
    const knownVol = 0.30;
    const spot = 100;
    const strike = 95;
    const r = 0.05;
    const q = 0.01;
    const T = 0.5;

    const price = blackScholes({
      spot,
      strike,
      timeToExpiry: T,
      volatility: knownVol,
      riskFreeRate: r,
      dividendYield: q,
      optionType: 'put',
    });

    const iv = calculateImpliedVolatility(price, spot, strike, r, q, T, 'put');
    expect(iv).toBeCloseTo(knownVol * 100, 1);
  });

  it('should return floor for zero or negative price', () => {
    const iv = calculateImpliedVolatility(0, 100, 105, 0.05, 0, 0.25, 'call');
    expect(iv).toBe(0);
  });

  it('should return floor for price below intrinsic', () => {
    // Deep ITM call with price below intrinsic
    const iv = calculateImpliedVolatility(0.50, 110, 100, 0.05, 0, 0.25, 'call');
    expect(iv).toBe(1.0); // 1% floor
  });

  it('should handle high volatility scenarios', () => {
    const knownVol = 0.80; // 80%
    const spot = 100;
    const strike = 100;
    const r = 0.05;
    const q = 0;
    const T = 1;

    const price = blackScholes({
      spot,
      strike,
      timeToExpiry: T,
      volatility: knownVol,
      riskFreeRate: r,
      dividendYield: q,
      optionType: 'call',
    });

    const iv = calculateImpliedVolatility(price, spot, strike, r, q, T, 'call');
    expect(iv).toBeCloseTo(knownVol * 100, 0);
  });
});
