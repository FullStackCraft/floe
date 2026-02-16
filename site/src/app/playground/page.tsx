"use client";

import Link from "next/link";
import { Sandpack } from "@codesandbox/sandpack-react";
import { useState } from "react";

const EXAMPLES = {
  "dealer-exposures": {
    title: "Dealer Exposures",
    description: "Calculate gamma, vanna, and charm exposures using smoothed IV surfaces",
    code: `import {
  getIVSurfaces,
  calculateGammaVannaCharmExposures,
  OptionChain,
  NormalizedOption,
} from "@fullstackcraftllc/floe";

// Helper to get a future expiration date (30 days out)
const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const expirationTimestamp = futureDate.getTime();
const expiration = futureDate.toISOString().split("T")[0]; // "YYYY-MM-DD"

// Sample option data (normally from your broker API)
const sampleOptions: NormalizedOption[] = [
  {
    strike: 445,
    expiration,
    expirationTimestamp,
    optionType: "call",
    bid: 8.50,
    ask: 8.70,
    mark: 8.60,
    last: 8.55,
    volume: 1500,
    openInterest: 25000,
    impliedVolatility: 0.18,
    underlying: "SPY",
    occSymbol: "",
    bidSize: 100,
    askSize: 100,
    timestamp: Date.now(),
  },
  {
    strike: 445,
    expiration,
    expirationTimestamp,
    optionType: "put",
    bid: 3.20,
    ask: 3.40,
    mark: 3.30,
    last: 3.25,
    volume: 2000,
    openInterest: 30000,
    impliedVolatility: 0.19,
    underlying: "SPY",
    occSymbol: "",
    bidSize: 100,
    askSize: 100,
    timestamp: Date.now(),
  },
  {
    strike: 450,
    expiration,
    expirationTimestamp,
    optionType: "call",
    bid: 5.80,
    ask: 6.00,
    mark: 5.90,
    last: 5.85,
    volume: 3000,
    openInterest: 45000,
    impliedVolatility: 0.17,
    underlying: "SPY",
    occSymbol: "",
    bidSize: 100,
    askSize: 100,
    timestamp: Date.now(),
  },
  {
    strike: 450,
    expiration,
    expirationTimestamp,
    optionType: "put",
    bid: 5.50,
    ask: 5.70,
    mark: 5.60,
    last: 5.55,
    volume: 2500,
    openInterest: 35000,
    impliedVolatility: 0.18,
    underlying: "SPY",
    occSymbol: "",
    bidSize: 100,
    askSize: 100,
    timestamp: Date.now(),
  },
  {
    strike: 455,
    expiration,
    expirationTimestamp,
    optionType: "call",
    bid: 3.40,
    ask: 3.60,
    mark: 3.50,
    last: 3.45,
    volume: 2800,
    openInterest: 38000,
    impliedVolatility: 0.16,
    underlying: "SPY",
    occSymbol: "",
    bidSize: 100,
    askSize: 100,
    timestamp: Date.now(),
  },
  {
    strike: 455,
    expiration,
    expirationTimestamp,
    optionType: "put",
    bid: 8.10,
    ask: 8.30,
    mark: 8.20,
    last: 8.15,
    volume: 1800,
    openInterest: 28000,
    impliedVolatility: 0.17,
    underlying: "SPY",
    occSymbol: "",
    bidSize: 100,
    askSize: 100,
    timestamp: Date.now(),
  },
];

// Bundle into the OptionChain type
const chain: OptionChain = {
  symbol: "SPY",
  spot: 448.50,
  riskFreeRate: 0.05,
  dividendYield: 0.015,
  options: sampleOptions,
};

// Build IV surfaces
const ivSurfaces = getIVSurfaces("blackscholes", "totalvariance", chain);
console.log("IV Surfaces built for", ivSurfaces.length, "option types");

// Calculate exposures
const exposureVariants = calculateGammaVannaCharmExposures(chain, ivSurfaces);
const exposures = exposureVariants.map(e => ({ spotPrice: e.spotPrice, expiration: e.expiration, ...e.canonical }));

for (const exp of exposures) {
  console.log("\\nExpiration:", new Date(exp.expiration).toDateString());
  console.log("  Gamma Exposure:", exp.totalGammaExposure.toLocaleString());
  console.log("  Vanna Exposure:", exp.totalVannaExposure.toLocaleString());
  console.log("  Charm Exposure:", exp.totalCharmExposure.toLocaleString());
  console.log("  Net Exposure:", exp.totalNetExposure.toLocaleString());
  console.log("  Max Gamma Strike: $" + exp.strikeOfMaxGamma);
}
`,
  },
  "black-scholes": {
    title: "Black-Scholes Pricing",
    description: "Calculate option prices using the Black-Scholes model",
    code: `import { blackScholes } from "@fullstackcraftllc/floe";

// Price a call option
const callPrice = blackScholes({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,  // 3 months
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call",
  dividendYield: 0.02,
});

console.log("Call Price: $" + callPrice.toFixed(4));

// Price a put option
const putPrice = blackScholes({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "put",
  dividendYield: 0.02,
});

console.log("Put Price: $" + putPrice.toFixed(4));

// Verify put-call parity
const S = 100;
const K = 105;
const r = 0.05;
const q = 0.02;
const T = 0.25;

const parityLHS = callPrice - putPrice;
const parityRHS = S * Math.exp(-q * T) - K * Math.exp(-r * T);

console.log("\\nPut-Call Parity Check:");
console.log("  C - P = " + parityLHS.toFixed(4));
console.log("  S*e^(-qT) - K*e^(-rT) = " + parityRHS.toFixed(4));
console.log("  Difference: " + Math.abs(parityLHS - parityRHS).toFixed(6));
`,
  },
  "greeks": {
    title: "Greeks Calculation",
    description: "Calculate all Greeks up to third order",
    code: `import { calculateGreeks } from "@fullstackcraftllc/floe";

const greeks = calculateGreeks({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,  // 3 months
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call",
  dividendYield: 0.02,
});

console.log("=== Option Price ===");
console.log("Price: $" + greeks.price.toFixed(4));

console.log("\\n=== First Order Greeks ===");
console.log("Delta: " + greeks.delta.toFixed(6));
console.log("Theta: " + greeks.theta.toFixed(6) + " (per day)");
console.log("Vega: " + greeks.vega.toFixed(6) + " (per 1% vol)");
console.log("Rho: " + greeks.rho.toFixed(6) + " (per 1% rate)");

console.log("\\n=== Second Order Greeks ===");
console.log("Gamma: " + greeks.gamma.toFixed(6));
console.log("Vanna: " + greeks.vanna.toFixed(6));
console.log("Charm: " + greeks.charm.toFixed(6) + " (per day)");
console.log("Volga: " + greeks.volga.toFixed(6));

console.log("\\n=== Third Order Greeks ===");
console.log("Speed: " + greeks.speed.toFixed(8));
console.log("Zomma: " + greeks.zomma.toFixed(8));
console.log("Color: " + greeks.color.toFixed(8));
console.log("Ultima: " + greeks.ultima.toFixed(8));
`,
  },
  "implied-volatility": {
    title: "Implied Volatility",
    description: "Calculate IV from market prices using bisection",
    code: `import { calculateImpliedVolatility, blackScholes } from "@fullstackcraftllc/floe";

const spot = 100;
const strike = 105;
const timeToExpiry = 0.25;  // 3 months
const riskFreeRate = 0.05;
const dividendYield = 0.02;
const marketPrice = 3.50;

// Calculate IV from market price
// Note: calculateImpliedVolatility returns IV as a percentage (e.g., 20.0 for 20%)
const ivPercent = calculateImpliedVolatility(
  marketPrice,
  spot,
  strike,
  riskFreeRate,
  dividendYield,
  timeToExpiry,
  "call"
);

console.log("Market Price: $" + marketPrice);
console.log("Implied Volatility: " + ivPercent.toFixed(2) + "%");

// Verify by repricing with the calculated IV
// Note: blackScholes expects volatility as decimal (0.20 for 20%)
const repricedValue = blackScholes({
  spot,
  strike,
  timeToExpiry,
  riskFreeRate,
  volatility: ivPercent / 100,  // Convert percentage to decimal
  optionType: "call",
  dividendYield,
});

console.log("\\nVerification:");
console.log("Repriced Value: $" + repricedValue.toFixed(4));
console.log("Difference: $" + Math.abs(marketPrice - repricedValue).toFixed(6));
`,
  },
  "implied-pdf": {
    title: "Implied PDF",
    description: "Extract market-implied probability distributions from option prices",
    code: `import {
  estimateImpliedProbabilityDistribution,
  getProbabilityInRange,
  getQuantile,
  NormalizedOption,
} from "@fullstackcraftllc/floe";

// Dynamic expiration: 7 days from now
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const expirationTimestamp = futureDate.getTime();
const expiration = futureDate.toISOString().split("T")[0];

// Sample call options for a single expiration
// In practice, these come from your broker API
const callOptions: NormalizedOption[] = [
  { strike: 490, bid: 15.20, ask: 15.50, mark: 15.35, optionType: "call", expirationTimestamp, expiration, underlying: "QQQ", occSymbol: "", last: 15.35, volume: 100, openInterest: 1000, impliedVolatility: 0.20, timestamp: Date.now(), bidSize: 10, askSize: 10 },
  { strike: 495, bid: 11.40, ask: 11.70, mark: 11.55, optionType: "call", expirationTimestamp, expiration, underlying: "QQQ", occSymbol: "", last: 11.55, volume: 100, openInterest: 1000, impliedVolatility: 0.19, timestamp: Date.now(), bidSize: 10, askSize: 10 },
  { strike: 500, bid: 8.10, ask: 8.40, mark: 8.25, optionType: "call", expirationTimestamp, expiration, underlying: "QQQ", occSymbol: "", last: 8.25, volume: 100, openInterest: 1000, impliedVolatility: 0.18, timestamp: Date.now(), bidSize: 10, askSize: 10 },
  { strike: 505, bid: 5.30, ask: 5.60, mark: 5.45, optionType: "call", expirationTimestamp, expiration, underlying: "QQQ", occSymbol: "", last: 5.45, volume: 100, openInterest: 1000, impliedVolatility: 0.17, timestamp: Date.now(), bidSize: 10, askSize: 10 },
  { strike: 510, bid: 3.10, ask: 3.40, mark: 3.25, optionType: "call", expirationTimestamp, expiration, underlying: "QQQ", occSymbol: "", last: 3.25, volume: 100, openInterest: 1000, impliedVolatility: 0.16, timestamp: Date.now(), bidSize: 10, askSize: 10 },
  { strike: 515, bid: 1.60, ask: 1.90, mark: 1.75, optionType: "call", expirationTimestamp, expiration, underlying: "QQQ", occSymbol: "", last: 1.75, volume: 100, openInterest: 1000, impliedVolatility: 0.15, timestamp: Date.now(), bidSize: 10, askSize: 10 },
  { strike: 520, bid: 0.70, ask: 0.95, mark: 0.83, optionType: "call", expirationTimestamp, expiration, underlying: "QQQ", occSymbol: "", last: 0.83, volume: 100, openInterest: 1000, impliedVolatility: 0.14, timestamp: Date.now(), bidSize: 10, askSize: 10 },
];

const spot = 502.50;

// Estimate the implied probability distribution
const result = estimateImpliedProbabilityDistribution("QQQ", spot, callOptions);

if (result.success) {
  const dist = result.distribution;
  
  console.log("=== Implied Probability Distribution ===");
  console.log("Symbol: " + dist.symbol);
  console.log("Spot Price: $" + dist.underlyingPrice);
  console.log("Expiration: " + new Date(dist.expiryDate).toDateString());
  console.log("");
  
  console.log("=== Summary Statistics ===");
  console.log("Most Likely Price (Mode): $" + dist.mostLikelyPrice);
  console.log("Median Price: $" + dist.medianPrice);
  console.log("Expected Value: $" + dist.expectedValue.toFixed(2));
  console.log("Expected Move: ±$" + dist.expectedMove.toFixed(2));
  console.log("Tail Skew: " + dist.tailSkew.toFixed(3));
  console.log("");
  
  console.log("=== Directional Probabilities ===");
  console.log("P(above spot): " + (dist.cumulativeProbabilityAboveSpot * 100).toFixed(1) + "%");
  console.log("P(below spot): " + (dist.cumulativeProbabilityBelowSpot * 100).toFixed(1) + "%");
  console.log("");
  
  // Range probability
  const rangeProb = getProbabilityInRange(dist, 495, 510);
  console.log("P($495 ≤ price ≤ $510): " + (rangeProb * 100).toFixed(1) + "%");
  
  // Confidence intervals using quantiles
  const p10 = getQuantile(dist, 0.10);
  const p90 = getQuantile(dist, 0.90);
  console.log("80% Confidence Interval: [$" + p10 + ", $" + p90 + "]");
  console.log("");
  
  // Display the PDF
  console.log("=== Strike Probabilities ===");
  for (const sp of dist.strikeProbabilities) {
    if (sp.probability > 0.001) {
      const bars = Math.round(sp.probability * 100);
      const marker = sp.strike === dist.mostLikelyPrice ? " ← MODE" : "";
      console.log("$" + sp.strike + ": " + (sp.probability * 100).toFixed(1) + "% " + "█".repeat(bars) + marker);
    }
  }
} else {
  console.log("Error: " + result.error);
}
`,
  },
  "occ-symbols": {
    title: "OCC Symbol Utilities",
    description: "Build and parse OCC option symbols, generate strike ranges",
    code: `import {
  buildOCCSymbol,
  parseOCCSymbol,
  generateStrikesAroundSpot,
  generateOCCSymbolsAroundSpot,
} from "@fullstackcraftllc/floe";

// Dynamic expiration: 30 days from now (next monthly)
const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const expiration = futureDate.toISOString().split("T")[0];

console.log("=== Build OCC Symbols ===");

// Build a call symbol
const callSymbol = buildOCCSymbol({
  symbol: "AAPL",
  expiration,
  optionType: "call",
  strike: 150,
});
console.log("AAPL $150 Call: " + callSymbol);

// Build a put symbol
const putSymbol = buildOCCSymbol({
  symbol: "AAPL",
  expiration,
  optionType: "put",
  strike: 145.50,
});
console.log("AAPL $145.50 Put: " + putSymbol);

console.log("\\n=== Parse OCC Symbols ===");

// Parse the symbols we just created
const parsedCall = parseOCCSymbol(callSymbol);
console.log("Parsed Call:");
console.log("  Symbol: " + parsedCall.symbol);
console.log("  Strike: $" + parsedCall.strike);
console.log("  Type: " + parsedCall.optionType);
console.log("  Expiration: " + parsedCall.expiration.toDateString());

console.log("\\n=== Generate Strikes Around Spot ===");

const spot = 150.25;
const strikes = generateStrikesAroundSpot({
  spot,
  strikesAbove: 5,
  strikesBelow: 5,
  strikeIncrementInDollars: 2.5,
});
console.log("Strikes around $" + spot + ":");
console.log("  " + strikes.join(", "));

console.log("\\n=== Generate Full OCC Symbol Set ===");

const symbols = generateOCCSymbolsAroundSpot("SPY", expiration, 450, {
  strikesAbove: 3,
  strikesBelow: 3,
  strikeIncrementInDollars: 5,
});

console.log("SPY option symbols (3 above/below $450, $5 increments):");
for (const sym of symbols.slice(0, 8)) {
  console.log("  " + sym);
}
console.log("  ... and " + (symbols.length - 8) + " more");
`,
  },
  "hedge-flow": {
    title: "Hedge Flow Analysis",
    description: "Compute the hedge impulse curve and charm integral for dealer positioning analysis",
    code: `import {
  getIVSurfaces,
  calculateGammaVannaCharmExposures,
  analyzeHedgeFlow,
  OptionChain,
  NormalizedOption,
} from "@fullstackcraftllc/floe";

// Helper: expiration 4 hours from now (simulating 0DTE)
const futureDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
const expirationTimestamp = futureDate.getTime();
const expiration = futureDate.toISOString().split("T")[0];

const spot = 600.0;

// Sample 0DTE option chain for SPY around $600
// Note: in production these come from your broker via FloeClient
const makeOption = (
  strike: number, type: "call" | "put",
  bid: number, ask: number, oi: number, iv: number
): NormalizedOption => ({
  strike, optionType: type, bid, ask,
  mark: (bid + ask) / 2, last: (bid + ask) / 2,
  volume: Math.round(oi * 0.3), openInterest: oi,
  impliedVolatility: iv, underlying: "SPY",
  expiration, expirationTimestamp,
  occSymbol: "", bidSize: 50, askSize: 50, timestamp: Date.now(),
});

// Construct realistic positioning:
// - Heavy call OI at 605 (gamma wall above)
// - Heavy put OI at 595 (gamma wall below)
// - Moderate OI at nearby strikes
// - Skewed IV (puts have higher IV than calls)
const options: NormalizedOption[] = [
  makeOption(590, "call", 10.20, 10.40, 8000,  0.22),
  makeOption(590, "put",  0.15,  0.25,  12000, 0.28),
  makeOption(593, "call", 7.30,  7.50,  10000, 0.21),
  makeOption(593, "put",  0.35,  0.45,  15000, 0.26),
  makeOption(595, "call", 5.40,  5.60,  15000, 0.20),
  makeOption(595, "put",  0.55,  0.70,  35000, 0.25),
  makeOption(597, "call", 3.60,  3.80,  12000, 0.19),
  makeOption(597, "put",  0.90,  1.05,  18000, 0.23),
  makeOption(598, "call", 2.80,  3.00,  14000, 0.185),
  makeOption(598, "put",  1.10,  1.25,  16000, 0.22),
  makeOption(600, "call", 1.50,  1.70,  25000, 0.18),
  makeOption(600, "put",  1.50,  1.70,  25000, 0.21),
  makeOption(602, "call", 0.70,  0.85,  18000, 0.175),
  makeOption(602, "put",  2.60,  2.80,  14000, 0.20),
  makeOption(603, "call", 0.45,  0.60,  16000, 0.17),
  makeOption(603, "put",  3.30,  3.50,  12000, 0.195),
  makeOption(605, "call", 0.20,  0.35,  40000, 0.165),
  makeOption(605, "put",  5.10,  5.30,  15000, 0.19),
  makeOption(607, "call", 0.05,  0.15,  10000, 0.16),
  makeOption(607, "put",  7.00,  7.20,  8000,  0.185),
  makeOption(610, "call", 0.01,  0.05,  5000,  0.155),
  makeOption(610, "put",  9.90,  10.10, 6000,  0.18),
];

const chain: OptionChain = {
  symbol: "SPY",
  spot,
  riskFreeRate: 0.05,
  dividendYield: 0.015,
  options,
};

// Build IV surfaces and exposures
const ivSurfaces = getIVSurfaces("blackscholes", "totalvariance", chain);
const exposureVariants = calculateGammaVannaCharmExposures(chain, ivSurfaces);
const exposures = exposureVariants.map(e => ({ spotPrice: e.spotPrice, expiration: e.expiration, ...e.canonical }));

if (exposures.length === 0) {
  console.log("No exposures computed (options may be expired)");
} else {
  const callSurface = ivSurfaces.find(s => s.putCall === "call");

  // Run the full hedge flow analysis
  const analysis = analyzeHedgeFlow(exposures[0], callSurface, {
    rangePercent: 2,
    stepPercent: 0.05,
    kernelWidthStrikes: 2,
  });

  const { impulseCurve, charmIntegral, regimeParams } = analysis;

  console.log("=== Market Regime ===");
  console.log("Regime: " + regimeParams.regime);
  console.log("ATM IV: " + (regimeParams.atmIV * 100).toFixed(1) + "%");
  console.log("Spot-Vol Correlation: " + regimeParams.impliedSpotVolCorr.toFixed(3));

  console.log("\\n=== Hedge Impulse Curve ===");
  console.log("Spot-vol coupling k: " + impulseCurve.spotVolCoupling.toFixed(2));
  console.log("Strike spacing: " + impulseCurve.strikeSpacing + " pts");
  console.log("Kernel width: " + impulseCurve.kernelWidth.toFixed(1) + " pts");
  console.log("Impulse at spot: " + impulseCurve.impulseAtSpot.toFixed(0));
  console.log("Slope at spot: " + impulseCurve.slopeAtSpot.toFixed(0));
  console.log("Impulse regime: " + impulseCurve.regime);
  console.log("Directional bias: " + impulseCurve.asymmetry.bias);

  if (impulseCurve.zeroCrossings.length > 0) {
    console.log("\\nFlip levels (zero crossings):");
    for (const zc of impulseCurve.zeroCrossings) {
      console.log("  $" + zc.price.toFixed(1) + " (" + zc.direction + ")");
    }
  }

  if (impulseCurve.extrema.length > 0) {
    console.log("\\nKey levels:");
    for (const ext of impulseCurve.extrema) {
      const label = ext.type === "basin" ? "Attractor (wall)" : "Accelerator (vacuum)";
      console.log("  $" + ext.price.toFixed(1) + ": " + label);
    }
  }

  if (impulseCurve.nearestAttractorAbove) {
    console.log("\\nNearest attractor above: $" + impulseCurve.nearestAttractorAbove.toFixed(1));
  }
  if (impulseCurve.nearestAttractorBelow) {
    console.log("Nearest attractor below: $" + impulseCurve.nearestAttractorBelow.toFixed(1));
  }

  // Print a mini ASCII chart of the impulse curve
  console.log("\\n=== Impulse Curve (ASCII) ===");
  const step = Math.max(1, Math.floor(impulseCurve.curve.length / 25));
  const maxAbs = Math.max(...impulseCurve.curve.map(p => Math.abs(p.impulse)));
  for (let i = 0; i < impulseCurve.curve.length; i += step) {
    const p = impulseCurve.curve[i];
    const width = maxAbs > 0 ? Math.round((p.impulse / maxAbs) * 20) : 0;
    const bar = width > 0 ? "+".repeat(width) : "-".repeat(-width);
    const marker = Math.abs(p.price - spot) < 0.5 ? " <-- SPOT" : "";
    console.log("$" + p.price.toFixed(0).padStart(4) + " |" + (width >= 0 ? " " + bar : bar) + marker);
  }

  console.log("\\n=== Charm Integral ===");
  console.log("Minutes to expiry: " + charmIntegral.minutesRemaining.toFixed(0));
  console.log("Total charm to close: " + charmIntegral.totalCharmToClose.toLocaleString());
  console.log("Direction: " + charmIntegral.direction);

  if (charmIntegral.strikeContributions.length > 0) {
    console.log("\\nTop charm contributors:");
    for (const sc of charmIntegral.strikeContributions.slice(0, 5)) {
      console.log("  $" + sc.strike + ": " + (sc.fractionOfTotal * 100).toFixed(1) + "% of total");
    }
  }

  if (charmIntegral.buckets.length > 0) {
    console.log("\\nCharm accumulation curve:");
    const bstep = Math.max(1, Math.floor(charmIntegral.buckets.length / 8));
    for (let i = 0; i < charmIntegral.buckets.length; i += bstep) {
      const b = charmIntegral.buckets[i];
      console.log("  " + b.minutesRemaining.toFixed(0).padStart(4) + " min left: cumulative " + b.cumulativeCEX.toLocaleString());
    }
  }
}
`,
  },
  "volatility-analysis": {
    title: "IV vs RV Analysis",
    description: "Model-free implied volatility from option chains and tick-based realized volatility for variance risk premium monitoring",
    code: `import {
  computeVarianceSwapIV,
  computeImpliedVolatility,
  computeRealizedVolatility,
  NormalizedOption,
  PriceObservation,
} from "@fullstackcraftllc/floe";

// Helper: expiration 4 hours from now (simulating 0DTE)
const hours = 4;
const futureDate = new Date(Date.now() + hours * 60 * 60 * 1000);
const expirationTimestamp = futureDate.getTime();
const expiration = futureDate.toISOString().split("T")[0];

const spot = 600.0;

// Helper to build sample options
const makeOpt = (
  strike: number, type: "call" | "put",
  bid: number, ask: number, oi: number
): NormalizedOption => ({
  strike, optionType: type, bid, ask,
  mark: (bid + ask) / 2, last: (bid + ask) / 2,
  volume: Math.round(oi * 0.2), openInterest: oi,
  impliedVolatility: 0.18, underlying: "SPY",
  expiration, expirationTimestamp,
  occSymbol: "", bidSize: 50, askSize: 50, timestamp: Date.now(),
});

// 0DTE option chain (today's expiration)
const todayOptions: NormalizedOption[] = [
  makeOpt(585, "call", 15.10, 15.30, 5000),
  makeOpt(585, "put",  0.05,  0.10,  8000),
  makeOpt(590, "call", 10.10, 10.30, 8000),
  makeOpt(590, "put",  0.10,  0.20,  12000),
  makeOpt(593, "call", 7.20,  7.40,  10000),
  makeOpt(593, "put",  0.25,  0.35,  14000),
  makeOpt(595, "call", 5.30,  5.50,  15000),
  makeOpt(595, "put",  0.40,  0.55,  20000),
  makeOpt(597, "call", 3.50,  3.70,  12000),
  makeOpt(597, "put",  0.70,  0.85,  16000),
  makeOpt(598, "call", 2.70,  2.90,  14000),
  makeOpt(598, "put",  0.95,  1.10,  14000),
  makeOpt(600, "call", 1.40,  1.60,  25000),
  makeOpt(600, "put",  1.40,  1.60,  25000),
  makeOpt(602, "call", 0.60,  0.75,  18000),
  makeOpt(602, "put",  2.50,  2.70,  14000),
  makeOpt(603, "call", 0.35,  0.50,  16000),
  makeOpt(603, "put",  3.20,  3.40,  12000),
  makeOpt(605, "call", 0.15,  0.25,  22000),
  makeOpt(605, "put",  5.00,  5.20,  10000),
  makeOpt(607, "call", 0.05,  0.10,  10000),
  makeOpt(607, "put",  6.90,  7.10,  8000),
  makeOpt(610, "call", 0.01,  0.05,  5000),
  makeOpt(610, "put",  9.80,  10.00, 5000),
];

// ==========================================
// 1. Model-Free Implied Volatility (0DTE)
// ==========================================
console.log("=== 0DTE Model-Free Implied Volatility ===");

const ivResult = computeVarianceSwapIV(todayOptions, spot, 0.05);

console.log("Implied Vol: " + (ivResult.impliedVolatility * 100).toFixed(2) + "%");
console.log("Forward Price: $" + ivResult.forward.toFixed(2));
console.log("ATM Strike (K\u2080): $" + ivResult.k0);
console.log("Time to Expiry: " + (ivResult.timeToExpiry * 365 * 24).toFixed(1) + " hours");
console.log("Strikes Contributing: " + ivResult.numStrikes);
console.log("Put Contribution: " + ivResult.putContribution.toFixed(6));
console.log("Call Contribution: " + ivResult.callContribution.toFixed(6));

// ==========================================
// 2. Two-Term Interpolation (VIX-style)
// ==========================================
console.log("\n=== Two-Term Interpolation ===");

// Simulate 1DTE options (tomorrow, slightly higher IV = normal term structure)
const tomorrowExp = new Date(Date.now() + 28 * 60 * 60 * 1000);
const tomorrowOptions: NormalizedOption[] = todayOptions.map(o => ({
  ...o,
  expirationTimestamp: tomorrowExp.getTime(),
  expiration: tomorrowExp.toISOString().split("T")[0],
  // Slightly wider prices (more time value)
  bid: o.bid * 1.3,
  ask: o.ask * 1.3,
  mark: o.mark * 1.3,
}));

const interpolated = computeImpliedVolatility(
  todayOptions,
  spot,
  0.05,
  tomorrowOptions,
  1  // target: 1-day constant maturity
);

console.log("Interpolated 1-Day IV: " + (interpolated.impliedVolatility * 100).toFixed(2) + "%");
console.log("Near-term (0DTE) IV: " + (interpolated.nearTerm.impliedVolatility * 100).toFixed(2) + "%");
console.log("Far-term (1DTE) IV: " + ((interpolated.farTerm?.impliedVolatility ?? 0) * 100).toFixed(2) + "%");
console.log("Is interpolated: " + interpolated.isInterpolated);

// Term structure signal
const iv0dte = interpolated.nearTerm.impliedVolatility;
const iv1dte = interpolated.farTerm?.impliedVolatility ?? 0;
const termSpread = (iv0dte - iv1dte) * 100;

console.log("\nTerm Structure:");
if (termSpread > 2) {
  console.log("BACKWARDATION: 0DTE IV >> 1DTE IV (+" + termSpread.toFixed(1) + " pts)");
  console.log("=> Today is the event. Elevated intraday expectations.");
} else if (termSpread < -2) {
  console.log("CONTANGO: 1DTE IV >> 0DTE IV (" + termSpread.toFixed(1) + " pts)");
  console.log("=> Quiet today, volatility expected tomorrow.");
} else {
  console.log("FLAT: 0DTE ~ 1DTE (spread: " + termSpread.toFixed(1) + " pts)");
  console.log("=> Normal conditions, no unusual term structure.");
}

// ==========================================
// 3. Tick-Based Realized Volatility
// ==========================================
console.log("\n=== Realized Volatility ===");

// Simulate 2 hours of price ticks (1 per minute, 120 ticks)
// with a random walk + slight upward drift
const observations: PriceObservation[] = [];
let price = spot;
const startTime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago

for (let i = 0; i < 120; i++) {
  price += (Math.random() - 0.48) * 0.5; // slight upward bias
  observations.push({
    price: Math.max(price, 580), // floor
    timestamp: startTime + i * 60 * 1000,
  });
}

const rv = computeRealizedVolatility(observations);

console.log("Realized Vol: " + (rv.realizedVolatility * 100).toFixed(2) + "%");
console.log("Observations: " + rv.numObservations);
console.log("Returns Computed: " + rv.numReturns);
console.log("Elapsed: " + rv.elapsedMinutes.toFixed(0) + " minutes");
console.log("Quadratic Variation: " + rv.quadraticVariation.toFixed(8));

// ==========================================
// 4. Variance Risk Premium
// ==========================================
console.log("\n=== Intraday Variance Risk Premium ===");

const vrp = (ivResult.impliedVolatility - rv.realizedVolatility) * 100;
console.log("0DTE IV: " + (ivResult.impliedVolatility * 100).toFixed(2) + "%");
console.log("Realized Vol: " + (rv.realizedVolatility * 100).toFixed(2) + "%");
console.log("VRP: " + (vrp > 0 ? "+" : "") + vrp.toFixed(2) + " points");

if (vrp > 3) {
  console.log("=> Options are EXPENSIVE relative to realized movement.");
  console.log("   Potential edge in selling premium.");
} else if (vrp < -3) {
  console.log("=> Options are CHEAP relative to realized movement.");
  console.log("   Realized vol exceeding expectations.");
} else {
  console.log("=> Options are FAIRLY PRICED relative to current dynamics.");
}
`,
  },
};

type ExampleKey = keyof typeof EXAMPLES;

export default function PlaygroundPage() {
  const [activeExample, setActiveExample] = useState<ExampleKey>("dealer-exposures");
  const example = EXAMPLES[activeExample];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-mono text-2xl font-bold text-[#CB3837]">
              floe
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-lg font-medium">Playground</h1>
          </div>
          <nav className="flex gap-4">
            <Link href="/documentation" className="text-gray-600 hover:text-black transition-colors">
              Docs
            </Link>
            <Link href="/examples" className="text-gray-600 hover:text-black transition-colors">
              Examples
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Example Selector */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EXAMPLES) as ExampleKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setActiveExample(key)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeExample === key
                    ? "bg-[#CB3837] text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:border-gray-400"
                }`}
              >
                {EXAMPLES[key].title}
              </button>
            ))}
          </div>
          <p className="mt-3 text-gray-600">{example.description}</p>
        </div>

        {/* Sandpack Editor */}
        <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
          <Sandpack
            template="vanilla-ts"
            theme="light"
            files={{
              "/index.ts": example.code,
            }}
            customSetup={{
              dependencies: {
                "@fullstackcraftllc/floe": "latest",
              },
            }}
            options={{
              showConsole: true,
              showConsoleButton: true,
              editorHeight: 500,
              showLineNumbers: true,
              showInlineErrors: true,
              wrapContent: true,
              autorun: true,
              autoReload: true,
            }}
          />
        </div>

        {/* Tips */}
        <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-mono text-lg font-semibold mb-3">Tips</h2>
          <ul className="text-gray-600 space-y-2 text-sm">
            <li>• Edit the code and see results instantly in the console below</li>
            <li>• All floe functions are available via the <code className="bg-gray-100 px-1 rounded">@fullstackcraftllc/floe</code> import</li>
            <li>• Check the <Link href="/documentation" className="text-[#CB3837] hover:underline">documentation</Link> for full API reference</li>
            <li>• Results appear in the console panel at the bottom of the editor</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
