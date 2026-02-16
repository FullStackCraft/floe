import { IVSurface } from '../types';
import { MarketRegime, RegimeParams } from './types';

/**
 * Derive regime parameters from the IV surface
 */
export function deriveRegimeParams(
  ivSurface: IVSurface,
  spot: number,
): RegimeParams {
  const { strikes, smoothedIVs } = ivSurface;
  
  const atmIV = interpolateIVAtStrike(strikes, smoothedIVs, spot) / 100;
  const skew = calculateSkewAtSpot(strikes, smoothedIVs, spot);
  const impliedSpotVolCorr = skewToCorrelation(skew);
  const curvature = calculateCurvatureAtSpot(strikes, smoothedIVs, spot);
  const impliedVolOfVol = curvatureToVolOfVol(curvature, atmIV);
  const regime = ivToRegime(atmIV);
  const expectedDailySpotMove = atmIV / Math.sqrt(252);
  const expectedDailyVolMove = impliedVolOfVol / Math.sqrt(252);
  
  return {
    atmIV,
    impliedSpotVolCorr,
    impliedVolOfVol,
    regime,
    expectedDailySpotMove,
    expectedDailyVolMove,
  };
}

function skewToCorrelation(skew: number): number {
  const SKEW_TO_CORR_SCALE = 0.15;
  return Math.max(-0.95, Math.min(0.5, skew * SKEW_TO_CORR_SCALE));
}

function curvatureToVolOfVol(curvature: number, atmIV: number): number {
  const VOL_OF_VOL_SCALE = 2.0;
  return Math.sqrt(Math.abs(curvature)) * VOL_OF_VOL_SCALE * atmIV;
}

function ivToRegime(atmIV: number): MarketRegime {
  if (atmIV < 0.15) return 'calm';
  if (atmIV < 0.20) return 'normal';
  if (atmIV < 0.35) return 'stressed';
  return 'crisis';
}

export function interpolateIVAtStrike(
  strikes: number[],
  ivs: number[],
  targetStrike: number,
): number {
  if (strikes.length === 0 || ivs.length === 0) return 20;
  if (strikes.length === 1) return ivs[0];
  
  let lower = 0;
  let upper = strikes.length - 1;
  
  for (let i = 0; i < strikes.length - 1; i++) {
    if (strikes[i] <= targetStrike && strikes[i + 1] >= targetStrike) {
      lower = i;
      upper = i + 1;
      break;
    }
  }
  
  if (targetStrike <= strikes[0]) return ivs[0];
  if (targetStrike >= strikes[strikes.length - 1]) return ivs[ivs.length - 1];
  
  const t = (targetStrike - strikes[lower]) / (strikes[upper] - strikes[lower]);
  return ivs[lower] + t * (ivs[upper] - ivs[lower]);
}

function calculateSkewAtSpot(strikes: number[], ivs: number[], spot: number): number {
  if (strikes.length < 2) return 0;
  
  let lowerIdx = 0;
  let upperIdx = strikes.length - 1;
  
  for (let i = 0; i < strikes.length - 1; i++) {
    if (strikes[i] <= spot && strikes[i + 1] >= spot) {
      lowerIdx = i;
      upperIdx = i + 1;
      break;
    }
  }
  
  const dIV = ivs[upperIdx] - ivs[lowerIdx];
  const dK = strikes[upperIdx] - strikes[lowerIdx];
  
  return dK > 0 ? (dIV / dK) * spot : 0;
}

function calculateCurvatureAtSpot(strikes: number[], ivs: number[], spot: number): number {
  if (strikes.length < 3) return 0;
  
  let centerIdx = 0;
  for (let i = 0; i < strikes.length; i++) {
    if (Math.abs(strikes[i] - spot) < Math.abs(strikes[centerIdx] - spot)) {
      centerIdx = i;
    }
  }
  
  if (centerIdx === 0 || centerIdx === strikes.length - 1) return 0;
  
  const h = (strikes[centerIdx + 1] - strikes[centerIdx - 1]) / 2;
  if (h <= 0) return 0;
  
  const ivMinus = ivs[centerIdx - 1];
  const iv = ivs[centerIdx];
  const ivPlus = ivs[centerIdx + 1];
  
  return ((ivPlus - 2 * iv + ivMinus) / (h * h)) * spot * spot;
}
