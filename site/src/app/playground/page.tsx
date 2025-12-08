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

// Sample option data (normally from your broker API)
const sampleOptions: NormalizedOption[] = [
  {
    strike: 445,
    expiration: "2024-01-19",
    expirationTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    optionType: "call",
    bid: 8.50,
    ask: 8.70,
    mark: 8.60,
    last: 8.55,
    volume: 1500,
    openInterest: 25000,
    impliedVolatility: 0.18,
  },
  {
    strike: 445,
    expiration: "2024-01-19",
    expirationTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    optionType: "put",
    bid: 3.20,
    ask: 3.40,
    mark: 3.30,
    last: 3.25,
    volume: 2000,
    openInterest: 30000,
    impliedVolatility: 0.19,
  },
  {
    strike: 450,
    expiration: "2024-01-19",
    expirationTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    optionType: "call",
    bid: 5.80,
    ask: 6.00,
    mark: 5.90,
    last: 5.85,
    volume: 3000,
    openInterest: 45000,
    impliedVolatility: 0.17,
  },
  {
    strike: 450,
    expiration: "2024-01-19",
    expirationTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    optionType: "put",
    bid: 5.50,
    ask: 5.70,
    mark: 5.60,
    last: 5.55,
    volume: 2500,
    openInterest: 35000,
    impliedVolatility: 0.18,
  },
];

// Bundle into an OptionChain
const chain: OptionChain = {
  symbol: "SPY",
  spot: 448.50,
  riskFreeRate: 0.05,
  dividendYield: 0.015,
  options: sampleOptions,
};

// Build IV surfaces
const ivSurfaces = getIVSurfaces("blackscholes", "totalvariance", chain);
console.log("IV Surfaces:", ivSurfaces);

// Calculate exposures
const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

for (const exp of exposures) {
  console.log("\\nExpiration:", new Date(exp.expiration).toDateString());
  console.log("  Gamma Exposure:", exp.totalGammaExposure.toLocaleString());
  console.log("  Vanna Exposure:", exp.totalVannaExposure.toLocaleString());
  console.log("  Charm Exposure:", exp.totalCharmExposure.toLocaleString());
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
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call",
  dividendYield: 0.02,
});

console.log("Call Price:", callPrice.toFixed(4));

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

console.log("Put Price:", putPrice.toFixed(4));

// Verify put-call parity
const S = 100;
const K = 105;
const r = 0.05;
const q = 0.02;
const T = 0.25;

const parityLHS = callPrice - putPrice;
const parityRHS = S * Math.exp(-q * T) - K * Math.exp(-r * T);

console.log("\\nPut-Call Parity Check:");
console.log("  C - P =", parityLHS.toFixed(4));
console.log("  S*e^(-qT) - K*e^(-rT) =", parityRHS.toFixed(4));
console.log("  Difference:", Math.abs(parityLHS - parityRHS).toFixed(6));
`,
  },
  "greeks": {
    title: "Greeks Calculation",
    description: "Calculate all Greeks up to third order",
    code: `import { calculateGreeks } from "@fullstackcraftllc/floe";

const greeks = calculateGreeks({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call",
  dividendYield: 0.02,
});

console.log("=== First Order Greeks ===");
console.log("Delta:", greeks.delta.toFixed(6));
console.log("Theta:", greeks.theta.toFixed(6), "(per day)");
console.log("Vega:", greeks.vega.toFixed(6), "(per 1% vol)");
console.log("Rho:", greeks.rho.toFixed(6), "(per 1% rate)");

console.log("\\n=== Second Order Greeks ===");
console.log("Gamma:", greeks.gamma.toFixed(6));
console.log("Vanna:", greeks.vanna.toFixed(6));
console.log("Charm:", greeks.charm.toFixed(6), "(per day)");
console.log("Volga:", greeks.volga.toFixed(6));

console.log("\\n=== Third Order Greeks ===");
console.log("Speed:", greeks.speed.toFixed(8));
console.log("Zomma:", greeks.zomma.toFixed(8));
console.log("Color:", greeks.color.toFixed(8));
console.log("Ultima:", greeks.ultima.toFixed(8));
`,
  },
  "implied-volatility": {
    title: "Implied Volatility",
    description: "Calculate IV from market prices using bisection",
    code: `import { calculateImpliedVolatility, blackScholes } from "@fullstackcraftllc/floe";

const spot = 100;
const strike = 105;
const timeToExpiry = 0.25;
const riskFreeRate = 0.05;
const dividendYield = 0.02;
const marketPrice = 3.50;

// Calculate IV from market price
const iv = calculateImpliedVolatility(
  marketPrice,
  spot,
  strike,
  riskFreeRate,
  dividendYield,
  timeToExpiry,
  "call"
);

console.log("Market Price:", marketPrice);
console.log("Implied Volatility:", (iv * 100).toFixed(2) + "%");

// Verify by repricing with the calculated IV
const repricedValue = blackScholes({
  spot,
  strike,
  timeToExpiry,
  riskFreeRate,
  volatility: iv,
  optionType: "call",
  dividendYield,
});

console.log("\\nVerification:");
console.log("Repriced Value:", repricedValue.toFixed(4));
console.log("Difference:", Math.abs(marketPrice - repricedValue).toFixed(6));
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
