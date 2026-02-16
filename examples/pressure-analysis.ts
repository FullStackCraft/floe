/**
 * Example: Using the Pressure Field and IV Path Prediction
 * 
 * This demonstrates how to use floe's pressure field and IV path prediction
 * to analyze the dynamics that Cem Karsan describes.
 */

import {
  getIVSurfaces,
  calculateGammaVannaCharmExposures,
  deriveRegimeParams,
  normalizeExposures,
  buildPressureGrid,
  predictIVSurfaceEvolution,
  runCascadeSimulation,
  getIVPathOfLeastResistance,
  OptionChain,
} from '@fullstackcraftllc/floe';

// Assume you have an option chain from your broker
declare const chain: OptionChain;

async function analyzeHedgingDynamics() {
  // Step 1: Build IV surfaces
  const surfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
  const callSurface = surfaces.find(s => s.putCall === 'call')!;
  
  // Step 2: Calculate raw exposures
  const allExposures = calculateGammaVannaCharmExposures(chain, surfaces);
  const exposures = allExposures[0];
  
  // Step 3: Derive regime from the IV surface
  const regime = deriveRegimeParams(callSurface, chain.spot);
  
  console.log('=== REGIME ANALYSIS ===');
  console.log(`Regime: ${regime.regime}`);
  console.log(`ATM IV: ${(regime.atmIV * 100).toFixed(1)}%`);
  console.log(`Implied Spot-Vol Correlation: ${regime.impliedSpotVolCorr.toFixed(2)}`);
  
  // Step 4: Normalize exposures to compare gamma/vanna/charm
  const normalized = normalizeExposures(exposures, regime);
  
  console.log('\n=== NORMALIZED EXPOSURES ===');
  console.log(`Dominant Greek: ${normalized.dominantGreek.toUpperCase()}`);
  console.log(`Weights: Gamma ${(normalized.weights.gamma * 100).toFixed(1)}% | Vanna ${(normalized.weights.vanna * 100).toFixed(1)}% | Charm ${(normalized.weights.charm * 100).toFixed(1)}%`);
  
  // Step 5: Build pressure grid
  const grid = buildPressureGrid('SPX', chain, exposures, callSurface);
  
  console.log('\n=== PRESSURE FIELD ===');
  console.log(`Path: ${grid.pathOfLeastResistance.direction.toUpperCase()} to ${grid.pathOfLeastResistance.targetSpot.toFixed(2)}`);
  console.log(`Confidence: ${(grid.pathOfLeastResistance.confidence * 100).toFixed(0)}%`);
  
  // Step 6: IV path analysis (Cem's key insight)
  const ivPath = getIVPathOfLeastResistance(callSurface, exposures, chain.spot);
  
  console.log('\n=== IV PATH (Cem Karsan Insight) ===');
  console.log(`IV Direction: ${ivPath.direction.toUpperCase()}`);
  console.log(`Rationale: ${ivPath.rationale}`);
  
  // Step 7: Cascade simulation
  const cascade = runCascadeSimulation(callSurface, exposures, chain.spot, -0.02);
  
  console.log('\n=== CASCADE: -2% Shock ===');
  console.log(`Outcome: ${cascade.outcome}`);
  console.log(`Insight: ${cascade.insight}`);
}

analyzeHedgingDynamics().catch(console.error);
