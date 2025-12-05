/**
 * Statistical utility functions
 */

/**
 * Cumulative distribution function for standard normal distribution
 * Using an approximation method (Abramowitz and Stegun)
 * 
 * @param x - Input value
 * @returns Cumulative probability
 */
export function cumulativeNormalDistribution(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const probability =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return x > 0 ? 1 - probability : probability;
}

/**
 * Probability density function for standard normal distribution
 * 
 * @param x - Input value
 * @returns Probability density
 */
export function normalPDF(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}
