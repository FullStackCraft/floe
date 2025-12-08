/**
 * OCC (Options Clearing Corporation) symbol utilities
 * 
 * OCC symbols follow the format: ROOT + YYMMDD + C/P + STRIKE
 * Example: AAPL230120C00150000 = AAPL $150 Call expiring Jan 20, 2023
 */

import { OptionType } from '../types';

/**
 * Parameters for building an OCC option symbol
 */
export interface OCCSymbolParams {
  /** Underlying ticker symbol (e.g., 'AAPL', 'QQQ') */
  symbol: string;
  /** Expiration date (Date object or ISO string) */
  expiration: Date | string;
  /** Option type: 'call' or 'put' */
  optionType: OptionType;
  /** Strike price in dollars (e.g., 150.50) */
  strike: number;
  /** 
   * If true, pads the symbol to 6 characters with spaces (standard OCC format).
   * If false (default), uses compact format without spaces (common for APIs).
   * @default false
   */
  padded?: boolean;
}

/**
 * Parsed components of an OCC option symbol
 */
export interface ParsedOCCSymbol {
  /** Underlying ticker symbol */
  symbol: string;
  /** Expiration date */
  expiration: Date;
  /** Option type */
  optionType: OptionType;
  /** Strike price in dollars */
  strike: number;
}

/**
 * Parameters for generating strikes around a spot price
 */
export interface StrikeGenerationParams {
  /** Current spot/underlying price */
  spot: number;
  /** Number of strikes above spot to include */
  strikesAbove?: number;
  /** Number of strikes below spot to include */
  strikesBelow?: number;
  /** Strike increment (e.g., 1 for $1 increments, 5 for $5) */
  strikeIncrement?: number;
}

/**
 * Builds an OCC-formatted option symbol.
 * 
 * @param params - The option parameters
 * @returns OCC-formatted symbol string
 * 
 * @remarks
 * OCC format: ROOT(6 chars, left-padded) + YYMMDD + C/P + STRIKE(8 digits, price × 1000)
 * 
 * @example
 * ```typescript
 * const symbol = buildOCCSymbol({
 *   symbol: 'AAPL',
 *   expiration: new Date('2023-01-20'),
 *   optionType: 'call',
 *   strike: 150
 * });
 * // Returns: 'AAPL230120C00150000' (compact format, default)
 * 
 * // With padded format (standard OCC)
 * const symbol2 = buildOCCSymbol({
 *   symbol: 'QQQ',
 *   expiration: '2024-03-15',
 *   optionType: 'put',
 *   strike: 425.50,
 *   padded: true
 * });
 * // Returns: 'QQQ   240315P00425500'
 * ```
 */
export function buildOCCSymbol(params: OCCSymbolParams): string {
  const { symbol, expiration, optionType, strike, padded = false } = params;

  // Format symbol - either padded to 6 chars or compact
  const formattedSymbol = padded 
    ? symbol.toUpperCase().padEnd(6, ' ')
    : symbol.toUpperCase();

  // Format expiration date as YYMMDD
  const expirationDate = typeof expiration === 'string' ? new Date(expiration) : expiration;
  const year = expirationDate.getFullYear().toString().slice(-2);
  const month = (expirationDate.getMonth() + 1).toString().padStart(2, '0');
  const day = expirationDate.getDate().toString().padStart(2, '0');
  const dateString = `${year}${month}${day}`;

  // Option type indicator
  const typeIndicator = optionType === 'call' ? 'C' : 'P';

  // Strike price: multiply by 1000, pad to 8 digits
  const strikeInt = Math.round(strike * 1000);
  const strikeString = strikeInt.toString().padStart(8, '0');

  return `${formattedSymbol}${dateString}${typeIndicator}${strikeString}`;
}

/**
 * Parses an OCC-formatted option symbol into its components.
 * Supports both compact format (e.g., 'AAPL230120C00150000') and
 * padded format (e.g., 'AAPL  230120C00150000').
 * 
 * @param occSymbol - The OCC symbol to parse
 * @returns Parsed symbol components
 * @throws {Error} If the symbol format is invalid
 * 
 * @example
 * ```typescript
 * // Compact format
 * const parsed = parseOCCSymbol('AAPL230120C00150000');
 * // Returns: { symbol: 'AAPL', expiration: Date, optionType: 'call', strike: 150 }
 * 
 * // Padded format (21 chars)
 * const parsed2 = parseOCCSymbol('AAPL  230120C00150000');
 * // Returns: { symbol: 'AAPL', expiration: Date, optionType: 'call', strike: 150 }
 * ```
 */
export function parseOCCSymbol(occSymbol: string): ParsedOCCSymbol {
  // Find the option type indicator (C or P) which is always followed by 8 strike digits
  // This works for both compact and padded formats
  const typeMatch = occSymbol.match(/([CP])(\d{8})$/);
  if (!typeMatch) {
    throw new Error(`Invalid OCC symbol format: ${occSymbol}`);
  }

  const typeIndicator = typeMatch[1];
  const strikeString = typeMatch[2];
  
  // Everything before the type indicator should be: SYMBOL + YYMMDD
  const prefix = occSymbol.slice(0, -9); // Remove C/P + 8 digits
  
  // Last 6 characters of prefix are the date (YYMMDD)
  if (prefix.length < 6) {
    throw new Error(`Invalid OCC symbol format: ${occSymbol}`);
  }
  
  const dateString = prefix.slice(-6);
  const symbol = prefix.slice(0, -6).trim();
  
  if (symbol.length === 0) {
    throw new Error(`Invalid OCC symbol: no ticker found in ${occSymbol}`);
  }

  // Parse date
  const year = 2000 + parseInt(dateString.slice(0, 2), 10);
  const month = parseInt(dateString.slice(2, 4), 10) - 1; // 0-indexed
  const day = parseInt(dateString.slice(4, 6), 10);
  const expiration = new Date(year, month, day);

  // Validate date
  if (isNaN(expiration.getTime())) {
    throw new Error(`Invalid date in OCC symbol: ${dateString}`);
  }

  // Parse option type
  const optionType: OptionType = typeIndicator === 'C' ? 'call' : 'put';

  // Parse strike (divide by 1000)
  const strike = parseInt(strikeString, 10) / 1000;

  return { symbol, expiration, optionType, strike };
}

/**
 * Generates an array of strike prices centered around a spot price.
 * 
 * @param params - Strike generation parameters
 * @returns Array of strike prices, sorted ascending
 * 
 * @example
 * ```typescript
 * const strikes = generateStrikesAroundSpot({
 *   spot: 450.25,
 *   strikesAbove: 10,
 *   strikesBelow: 10,
 *   strikeIncrement: 5
 * });
 * // Returns: [405, 410, 415, 420, 425, 430, 435, 440, 445, 450, 455, 460, 465, 470, 475, 480, 485, 490, 495, 500]
 * ```
 */
export function generateStrikesAroundSpot(params: StrikeGenerationParams): number[] {
  const {
    spot,
    strikesAbove = 10,
    strikesBelow = 10,
    strikeIncrement = 1
  } = params;

  // Find the nearest strike at or below spot
  const baseStrike = Math.floor(spot / strikeIncrement) * strikeIncrement;

  const strikes: number[] = [];

  // Generate strikes below (including base)
  for (let i = strikesBelow; i >= 0; i--) {
    strikes.push(baseStrike - i * strikeIncrement);
  }

  // Generate strikes above
  for (let i = 1; i <= strikesAbove; i++) {
    strikes.push(baseStrike + i * strikeIncrement);
  }

  return strikes;
}

/**
 * Generates OCC symbols for calls and puts across multiple strikes.
 * 
 * @param symbol - Underlying ticker symbol
 * @param expiration - Option expiration date
 * @param strikes - Array of strike prices
 * @param includeTypes - Which option types to include (default: both)
 * @returns Array of OCC symbol strings
 * 
 * @example
 * ```typescript
 * const symbols = generateOCCSymbolsForStrikes(
 *   'QQQ',
 *   new Date('2024-01-19'),
 *   [495, 500, 505],
 *   ['call', 'put']
 * );
 * // Returns 6 symbols: 3 calls + 3 puts
 * ```
 */
export function generateOCCSymbolsForStrikes(
  symbol: string,
  expiration: Date | string,
  strikes: number[],
  includeTypes: OptionType[] = ['call', 'put']
): string[] {
  const symbols: string[] = [];

  for (const strike of strikes) {
    for (const optionType of includeTypes) {
      symbols.push(buildOCCSymbol({ symbol, expiration, optionType, strike }));
    }
  }

  return symbols;
}

/**
 * Convenience function to generate OCC symbols around current spot price.
 * 
 * @param symbol - Underlying ticker symbol
 * @param expiration - Option expiration date
 * @param spot - Current spot price
 * @param options - Strike generation options
 * @returns Array of OCC symbol strings for calls and puts
 * 
 * @example
 * ```typescript
 * // Generate 20 calls + 20 puts around QQQ at $502.50
 * const symbols = generateOCCSymbolsAroundSpot('QQQ', '2024-01-19', 502.50, {
 *   strikesAbove: 10,
 *   strikesBelow: 10,
 *   strikeIncrement: 5
 * });
 * // Returns 42 symbols (21 strikes × 2 types)
 * ```
 */
export function generateOCCSymbolsAroundSpot(
  symbol: string,
  expiration: Date | string,
  spot: number,
  options?: Omit<StrikeGenerationParams, 'spot'>
): string[] {
  const strikes = generateStrikesAroundSpot({ spot, ...options });
  return generateOCCSymbolsForStrikes(symbol, expiration, strikes);
}
