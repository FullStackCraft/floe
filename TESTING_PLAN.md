# Floe Testing Plan

## Overview

Now that the mathematical formulas have been verified against the Go source code, we need comprehensive unit tests to ensure correctness and catch regressions.

## Testing Strategy

### Phase 1: Unit Tests (PRIORITY)

#### 1. Black-Scholes Module (`src/blackscholes/index.test.ts`)

**Test Cases:**

1. **Call Option Pricing**
   - [ ] Standard ATM call (S=K)
   - [ ] ITM call (S>K)
   - [ ] OTM call (S<K)
   - [ ] Deep ITM call
   - [ ] Deep OTM call
   - [ ] Near expiration (t→0)
   - [ ] Long expiration (t=2 years)
   - [ ] With dividend yield
   - [ ] Zero volatility edge case
   - [ ] Zero time edge case

2. **Put Option Pricing**
   - [ ] Standard ATM put (S=K)
   - [ ] ITM put (S<K)
   - [ ] OTM put (S>K)
   - [ ] Deep ITM put
   - [ ] Deep OTM put
   - [ ] Near expiration (t→0)
   - [ ] Long expiration (t=2 years)
   - [ ] With dividend yield

3. **Greeks Calculations**
   - [ ] Delta range checks (-1 to 1)
   - [ ] Gamma always positive
   - [ ] Theta typically negative (time decay)
   - [ ] Vega always positive
   - [ ] Call vs Put Greeks relationships
   - [ ] Put-Call Parity validation
   - [ ] Greeks at extreme strikes

4. **Implied Volatility**
   - [ ] Standard case (market price → IV → price recovery)
   - [ ] Deep ITM options (floor behavior)
   - [ ] Deep OTM options
   - [ ] ATM options (highest sensitivity)
   - [ ] Convergence tests
   - [ ] Edge cases (zero extrinsic value)

**Test Data Sources:**
- Pre-calculated values from Go implementation
- Known academic examples
- Market data samples

#### 2. Volatility Module (`src/volatility/index.test.ts`)

**Test Cases:**

1. **IV Surface Construction**
   - [ ] Single expiration surface
   - [ ] Multiple expirations
   - [ ] Call surface construction
   - [ ] Put surface construction
   - [ ] Strike sorting validation
   - [ ] Empty option chain handling

2. **IV Surface Smoothing**
   - [ ] 'totalvariance' smoothing correctness
   - [ ] 'none' smoothing (pass-through)
   - [ ] Minimum data point requirements (5 points)
   - [ ] IV floor filtering (1.5%)
   - [ ] Expired options handling

3. **IV Lookup**
   - [ ] Exact strike match
   - [ ] Strike not found (return 0)
   - [ ] Wrong expiration
   - [ ] Wrong option type

#### 3. Smoothing Module (`src/volatility/smoothing.test.ts`)

**Test Cases:**

1. **Cubic Spline Interpolation**
   - [ ] Known interpolation points
   - [ ] Smoothness (continuous first derivative)
   - [ ] Boundary behavior
   - [ ] Insufficient data (<3 points)

2. **Convexity Enforcement**
   - [ ] Verify convexity after processing
   - [ ] Test with smile curve (U-shape)
   - [ ] Test with smirk curve
   - [ ] Edge cases (monotonic input)

3. **Total Variance Conversion**
   - [ ] IV% → variance → IV% round trip
   - [ ] Zero variance handling
   - [ ] Negative variance prevention

#### 4. Exposure Module (`src/exposure/index.test.ts`)

**Test Cases:**

1. **Gamma Exposure**
   - [ ] Single strike exposure
   - [ ] Multiple strikes aggregation
   - [ ] Dealer perspective (sign convention)
   - [ ] Call vs put contributions
   - [ ] Contract size normalization (×100)
   - [ ] 1% move sensitivity (×0.01)

2. **Vanna Exposure**
   - [ ] Calculation correctness
   - [ ] IV percentage scaling
   - [ ] Multiple strikes

3. **Charm Exposure**
   - [ ] Per-day normalization (÷365)
   - [ ] Time to expiration weighting
   - [ ] Multiple strikes

4. **Net Exposure**
   - [ ] Sum of all three exposures
   - [ ] Strike extremes identification
   - [ ] Sorting validation

5. **Shares to Cover**
   - [ ] BUY action (negative exposure)
   - [ ] SELL action (positive exposure)
   - [ ] Implied move calculation
   - [ ] Resulting price calculation
   - [ ] Division by zero protection
   - [ ] NaN/Inf handling

#### 5. Statistics Module (`src/utils/statistics.test.ts`)

**Test Cases:**

1. **Normal CDF**
   - [ ] Standard values (-3σ to +3σ)
   - [ ] Symmetry: CDF(-x) = 1 - CDF(x)
   - [ ] Edge cases (0, ±∞)
   - [ ] Known values (0 → 0.5)

2. **Normal PDF**
   - [ ] Peak at x=0
   - [ ] Symmetry
   - [ ] Known values
   - [ ] Area under curve ≈ 1

### Phase 2: Integration Tests

**Test Scenarios:**

1. **Full Workflow Test**
   ```typescript
   // Test: Load options → Build surfaces → Calculate exposures
   const options = loadTestOptions();
   const surfaces = getIVSurfaces(...);
   const exposures = calculateGammaVannaCharmExposures(...);
   // Validate end-to-end results
   ```

2. **Cross-Validation with Go**
   - [ ] Run same test data through both implementations
   - [ ] Compare numerical results (within tolerance)
   - [ ] Document any differences

3. **Broker Adapter Tests**
   - [ ] Schwab data normalization
   - [ ] TD Ameritrade data normalization
   - [ ] Interactive Brokers data normalization
   - [ ] Error handling for malformed data

### Phase 3: Property-Based Tests

**Properties to Test:**

1. **Put-Call Parity**
   ```typescript
   C - P = S*e^(-q*t) - K*e^(-r*t)
   ```

2. **Greeks Relationships**
   - Call delta + Put delta = e^(-q*t)
   - Gamma is always positive
   - |Delta| ≤ 1
   - Vega ≥ 0

3. **IV Surface Properties**
   - Smoothed IV should be continuous
   - Total variance should be convex
   - No arbitrage conditions

### Phase 4: Performance Tests

**Benchmarks:**

1. **Single Option Pricing**
   - [ ] Target: <1ms per option

2. **Greeks Calculation**
   - [ ] Target: <1ms for full Greeks set

3. **IV Surface Construction**
   - [ ] Target: <100ms for typical chain (200 options)

4. **Exposure Calculation**
   - [ ] Target: <500ms for full chain analysis

## Test Data

### 1. Synthetic Data
- Generate known scenarios with exact answers
- Edge cases and boundary conditions

### 2. Market Data Samples
- Real option chains from various underlyings
- Different market conditions (high/low IV, etc.)

### 3. Go Implementation Results
- Export test cases from Go code
- Use as ground truth for validation

## Testing Tools

```json
{
  "framework": "vitest",
  "coverage": "@vitest/coverage-v8",
  "mocking": "vitest built-in",
  "assertions": "expect"
}
```

## Success Criteria

- [ ] 100% code coverage for core functions
- [ ] All unit tests pass
- [ ] Integration tests validate end-to-end workflow
- [ ] Property-based tests confirm mathematical relationships
- [ ] Performance benchmarks meet targets
- [ ] Cross-validation with Go shows <0.1% difference

## Test File Structure

```
src/
├── blackscholes/
│   ├── index.ts
│   ├── index.test.ts          ← Unit tests
│   └── fixtures.ts             ← Test data
├── volatility/
│   ├── index.ts
│   ├── index.test.ts
│   ├── smoothing.ts
│   ├── smoothing.test.ts
│   └── fixtures.ts
├── exposure/
│   ├── index.ts
│   ├── index.test.ts
│   └── fixtures.ts
└── utils/
    ├── statistics.ts
    └── statistics.test.ts
```

## Next Steps

1. ✅ Verify formulas against Go (COMPLETE)
2. 🔄 Implement unit tests (Phase 1)
3. 🔄 Add integration tests (Phase 2)
4. 🔄 Property-based tests (Phase 3)
5. 🔄 Performance benchmarks (Phase 4)
6. 🔄 Documentation updates
7. 🔄 CI/CD integration

## Notes

- Tests should be deterministic (no random data without seeds)
- Use descriptive test names
- Group related tests with `describe` blocks
- Add comments for complex test scenarios
- Keep test data in fixtures files for reusability
