/**
 * Maps option root symbols to their underlying symbols.
 * Index options often have different root symbols than their underlying.
 * e.g., SPX options have the prefix 'SPXW', at least in brokers like Tradier.
 */
export const OPTION_ROOT_TO_UNDERLYING: Record<string, string> = {
  'SPXW': 'SPX',   // SPX Weekly options
  'SPXPM': 'SPX',  // SPX PM-settled options
  'NDXP': 'NDX',   // NDXP is Tradier's NDX options root
  'RUTW': 'RUT',   // RUT Weekly options
  'DJXW': 'DJX',   // DJX Weekly options
  // Add more as needed
};

/**
 * Get the underlying symbol for an option root.
 * Returns the root itself if no mapping exists (i.e., for regular equity options).
 */
export const getUnderlyingFromOptionRoot = (optionRoot: string): string => {
  return OPTION_ROOT_TO_UNDERLYING[optionRoot.toUpperCase()] || optionRoot;
}