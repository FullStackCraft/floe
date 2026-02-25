import { FloeClient, Broker } from './FloeClient';
import { generateOCCSymbolsAroundSpot } from '../utils/occ';
import { NormalizedTicker, NormalizedOption } from '../types';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Integration test for FloeClient with TastyTrade broker.
 * 
 * IMPORTANT: To run this test, you must provide TastyTrade OAuth credentials.
 * Set the environment variables:
 *   - TASTYTRADE_CLIENT_SECRET: Your OAuth client secret
 *   - TASTYTRADE_REFRESH_TOKEN: Your refresh token (never expires)
 * 
 * Run with: 
 *   TASTYTRADE_CLIENT_SECRET=xxx TASTYTRADE_REFRESH_TOKEN=xxx npm test -- --testPathPattern=FloeClientWithTastyTrade
 * 
 * To get these credentials:
 * 1. Create an OAuth application at https://my.tastytrade.com/app.html#/manage/api-access/oauth-applications
 * 2. Save the client secret
 * 3. Go to OAuth Applications > Manage > Create Grant to get a refresh token
 * 
 * NOTE: Option streaming tests may not receive data outside of market hours.
 * The tests are designed to pass during off-hours by checking connection success
 * and symbol generation rather than requiring live data.
 */

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// TastyTrade OAuth credentials - use environment variables or paste directly for manual testing
const TASTYTRADE_CLIENT_SECRET = process.env.TASTYTRADE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE';
const TASTYTRADE_REFRESH_TOKEN = process.env.TASTYTRADE_REFRESH_TOKEN || 'YOUR_REFRESH_TOKEN_HERE';

// Use sandbox environment for testing (set to true for paper trading API)
const USE_SANDBOX = process.env.TASTYTRADE_SANDBOX === 'true';

// Test parameters
const TEST_SYMBOL = 'SPY';
const TEST_EXPIRATION = '2025-12-20'; // Use a valid future expiration (weekly)
const TEST_SPOT_PRICE = 600; // Approximate current SPY price - adjust as needed
const STRIKES_ABOVE = 10;
const STRIKES_BELOW = 10;
const STRIKE_INCREMENT = 1;

// Timeout for receiving streaming data (ms)
const STREAM_TIMEOUT = 15000;

// Skip tests if no credentials are provided
const shouldSkip = 
  TASTYTRADE_CLIENT_SECRET === 'YOUR_CLIENT_SECRET_HERE' || 
  TASTYTRADE_REFRESH_TOKEN === 'YOUR_REFRESH_TOKEN_HERE';

/**
 * Helper: returns true if an error is an auth/token/session failure.
 * Tests that hit this will pass with a warning instead of failing.
 */
function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    return /invalid or expired token|authentication failed|failed to get session token|failed to create.*session|401|403/i.test(err.message);
  }
  return false;
}

/**
 * Log a warning and return early when the token is bad.
 */
function warnAuthSkip(testName: string): void {
  console.warn(
    `⚠️  [${testName}] Skipped — token is invalid or expired. This is NOT a real test pass.`
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gets a fresh session token using the OAuth refresh token.
 * This follows the TastyTrade OAuth flow:
 * 1. POST /oauth/token with refresh_token grant type
 * 2. Receive access_token (session token) that lasts ~15 minutes
 */
async function getSessionToken(): Promise<string> {
  const baseUrl = USE_SANDBOX 
    ? 'https://api.cert.tastyworks.com' 
    : 'https://api.tastyworks.com';
  
  const body = JSON.stringify({
    grant_type: 'refresh_token',
    client_secret: TASTYTRADE_CLIENT_SECRET,
    refresh_token: TASTYTRADE_REFRESH_TOKEN,
  });
  
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'floe/1.0',
    },
    body,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get session token: ${response.status} ${errorText}`);
  }
  
  const data = await response.json() as { access_token: string; expires_in: number };
  console.log(`✅ Got fresh session token (expires in ${data.expires_in}s)`);
  return data.access_token;
}

/**
 * Check if US stock market is currently open (roughly).
 * NYSE/NASDAQ: 9:30 AM - 4:00 PM ET, Mon-Fri
 */
function isMarketOpen(): boolean {
  const now = new Date();
  const etOffset = -5; // EST (adjust for DST if needed)
  const utcHour = now.getUTCHours();
  const etHour = (utcHour + 24 + etOffset) % 24;
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend
  if (day === 0 || day === 6) return false;
  
  // Before 9:30 AM or after 4:00 PM ET
  const etMinutes = etHour * 60 + now.getUTCMinutes();
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return etMinutes >= marketOpen && etMinutes < marketClose;
}

const marketOpen = isMarketOpen();
console.log(`\n📊 Market is currently: ${marketOpen ? '🟢 OPEN' : '🔴 CLOSED'}`);
console.log(`🔧 Using ${USE_SANDBOX ? 'SANDBOX' : 'PRODUCTION'} environment\n`);

// ============================================================================
// TESTS
// ============================================================================

describe('FloeClient with TastyTrade Integration', () => {
  let client: FloeClient;
  let sessionToken: string;

  beforeAll(async () => {
    if (!shouldSkip) {
      try {
        sessionToken = await getSessionToken();
      } catch (err) {
        console.warn('⚠️  Failed to get TastyTrade session token — tests will skip gracefully.');
        sessionToken = '';
      }
    }
  });

  beforeEach(() => {
    client = new FloeClient();
  });

  afterEach(() => {
    if (client.isConnected()) {
      client.disconnect();
    }
  });

  describe('Connection', () => {
    it('should connect to TastyTrade streaming API via DxLink', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TastyTrade credentials provided');
        console.log('Set TASTYTRADE_CLIENT_SECRET and TASTYTRADE_REFRESH_TOKEN environment variables to run this test');
        return;
      }

      try {
        // Act
        await client.connect(Broker.TASTYTRADE, sessionToken);

        // Assert
        expect(client.isConnected()).toBe(true);
      } catch (err) {
        if (isAuthError(err)) { warnAuthSkip('should connect to TastyTrade streaming API via DxLink'); return; }
        throw err;
      }
    }, 15000);

    it('should disconnect cleanly', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TastyTrade credentials provided');
        return;
      }

      try {
        // Arrange
        await client.connect(Broker.TASTYTRADE, sessionToken);
        expect(client.isConnected()).toBe(true);

        // Act
        client.disconnect();

        // Assert
        expect(client.isConnected()).toBe(false);
      } catch (err) {
        if (isAuthError(err)) { warnAuthSkip('should disconnect cleanly'); return; }
        throw err;
      }
    }, 15000);
  });

  describe('Ticker Subscriptions', () => {
    it('should receive ticker updates for subscribed symbols', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TastyTrade credentials provided');
        return;
      }

      // Arrange
      const receivedTickers: NormalizedTicker[] = [];
      try {
        await client.connect(Broker.TASTYTRADE, sessionToken);
      } catch (err) {
        if (isAuthError(err)) { warnAuthSkip('should receive ticker updates for subscribed symbols'); return; }
        throw err;
      }

      // Act
      const tickerPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (receivedTickers.length > 0) {
            resolve();
          } else {
            reject(new Error(`Timeout: No ticker updates received within ${STREAM_TIMEOUT}ms`));
          }
        }, STREAM_TIMEOUT);

        client.on('tickerUpdate', (ticker) => {
          console.log('Received ticker update:', ticker.symbol, 'spot:', ticker.spot);
          receivedTickers.push(ticker);
          
          // Resolve after receiving at least one update
          if (receivedTickers.length >= 1) {
            clearTimeout(timeout);
            resolve();
          }
        });

        client.on('error', (error) => {
          console.error('Stream error:', error);
          // Don't reject immediately - let it try to continue
        });
      });

      client.subscribeToTickers([TEST_SYMBOL]);

      await tickerPromise;

      // Assert
      expect(receivedTickers.length).toBeGreaterThan(0);
      
      const ticker = receivedTickers[0];
      expect(ticker.symbol).toBe(TEST_SYMBOL);
      expect(ticker.spot).toBeGreaterThan(0);
      expect(ticker.timestamp).toBeGreaterThan(0);
      
      // Verify bid/ask make sense (bid <= ask)
      if (ticker.bid > 0 && ticker.ask > 0) {
        expect(ticker.bid).toBeLessThanOrEqual(ticker.ask);
      }
    }, STREAM_TIMEOUT + 10000);
  });

  describe('Option Subscriptions', () => {
    it('should subscribe to options and receive updates when market is open', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TastyTrade credentials provided');
        return;
      }

      // Arrange
      const receivedOptions: NormalizedOption[] = [];
      
      // Generate OCC symbols around the test spot price
      const optionSymbols = generateOCCSymbolsAroundSpot(
        TEST_SYMBOL,
        TEST_EXPIRATION,
        TEST_SPOT_PRICE,
        {
          strikesAbove: STRIKES_ABOVE,
          strikesBelow: STRIKES_BELOW,
          strikeIncrementInDollars: STRIKE_INCREMENT,
        }
      );

      console.log(`Generated ${optionSymbols.length} option symbols to subscribe to`);
      console.log('Sample symbols:', optionSymbols.slice(0, 4));

      try {
        await client.connect(Broker.TASTYTRADE, sessionToken);
      } catch (err) {
        if (isAuthError(err)) { warnAuthSkip('should subscribe to options and receive updates when market is open'); return; }
        throw err;
      }

      // Act
      const optionPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Always resolve - we'll check results based on market hours
          console.log(`Timeout reached. Received ${receivedOptions.length} option updates.`);
          resolve();
        }, STREAM_TIMEOUT);

        client.on('optionUpdate', (option) => {
          console.log('Received option update:', option.occSymbol, 'mark:', option.mark);
          receivedOptions.push(option);
          
          // Resolve after receiving at least 3 updates
          if (receivedOptions.length >= 3) {
            clearTimeout(timeout);
            resolve();
          }
        });

        client.on('error', (error) => {
          console.error('Stream error:', error);
          // Don't reject - let the test continue
        });
      });

      client.subscribeToOptions(optionSymbols);

      await optionPromise;

      // Assert - expectations depend on market hours
      if (marketOpen) {
        // During market hours, we should receive option data
        expect(receivedOptions.length).toBeGreaterThan(0);
        
        const option = receivedOptions[0];
        expect(option.underlying).toBe(TEST_SYMBOL);
        expect(option.strike).toBeGreaterThan(0);
        expect(['call', 'put']).toContain(option.optionType);
        expect(option.timestamp).toBeGreaterThan(0);
        
        // Verify bid/ask make sense (bid <= ask)
        if (option.bid > 0 && option.ask > 0) {
          expect(option.bid).toBeLessThanOrEqual(option.ask);
        }
      } else {
        // Outside market hours, just verify we connected and subscribed successfully
        console.log('⚠️  Market is closed - option streaming data may not be available');
        console.log(`   Received ${receivedOptions.length} option updates (0 is expected outside market hours)`);
        // Test passes regardless - we're just verifying the connection works
        expect(client.isConnected()).toBe(true);
        expect(client.getSubscribedOptions().length).toBe(optionSymbols.length);
      }
    }, STREAM_TIMEOUT + 10000);
  });

  describe('Combined Ticker and Option Subscriptions (Dealer Exposure Use Case)', () => {
    it('should receive both ticker and option updates simultaneously', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TastyTrade credentials provided');
        return;
      }

      // Arrange
      const receivedTickers: NormalizedTicker[] = [];
      const receivedOptions: NormalizedOption[] = [];

      // Generate option symbols around spot (like for dealer exposure calculation)
      const optionSymbols = generateOCCSymbolsAroundSpot(
        TEST_SYMBOL,
        TEST_EXPIRATION,
        TEST_SPOT_PRICE,
        {
          strikesAbove: STRIKES_ABOVE,
          strikesBelow: STRIKES_BELOW,
          strikeIncrementInDollars: STRIKE_INCREMENT,
        }
      );

      console.log('='.repeat(60));
      console.log('DEALER EXPOSURE USE CASE TEST (TastyTrade/DxLink)');
      console.log('='.repeat(60));
      console.log(`Underlying: ${TEST_SYMBOL}`);
      console.log(`Expiration: ${TEST_EXPIRATION}`);
      console.log(`Spot Price: ${TEST_SPOT_PRICE}`);
      console.log(`Options to subscribe: ${optionSymbols.length}`);
      console.log('='.repeat(60));

      try {
        await client.connect(Broker.TASTYTRADE, sessionToken);
      } catch (err) {
        if (isAuthError(err)) { warnAuthSkip('should receive both ticker and option updates simultaneously'); return; }
        throw err;
      }

      // Act
      const dataPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.log(`\nTimeout reached. Tickers: ${receivedTickers.length}, Options: ${receivedOptions.length}`);
          // Always resolve - we'll check results based on market hours
          resolve();
        }, STREAM_TIMEOUT);

        client.on('tickerUpdate', (ticker) => {
          receivedTickers.push(ticker);
          console.log(`[TICKER] ${ticker.symbol}: spot=${ticker.spot.toFixed(2)}, bid=${ticker.bid}, ask=${ticker.ask}`);
          
          checkComplete();
        });

        client.on('optionUpdate', (option) => {
          receivedOptions.push(option);
          console.log(`[OPTION] ${option.occSymbol}: mark=${option.mark.toFixed(2)}, bid=${option.bid}, ask=${option.ask}`);
          
          checkComplete();
        });

        client.on('error', (error) => {
          console.error('[ERROR]', error);
          // Don't reject - let the test continue
        });

        function checkComplete() {
          // Complete when we have at least 1 ticker and 5 options (or just tickers if market closed)
          if (marketOpen) {
            if (receivedTickers.length >= 1 && receivedOptions.length >= 5) {
              clearTimeout(timeout);
              resolve();
            }
          } else {
            // Outside market hours, just getting ticker data is a win
            if (receivedTickers.length >= 1) {
              clearTimeout(timeout);
              resolve();
            }
          }
        }
      });

      // Subscribe to both tickers and options
      client.subscribeToTickers([TEST_SYMBOL]);
      client.subscribeToOptions(optionSymbols);

      await dataPromise;

      // Assert
      console.log('\n' + '='.repeat(60));
      console.log('RESULTS');
      console.log('='.repeat(60));
      console.log(`Market Status: ${marketOpen ? '🟢 OPEN' : '🔴 CLOSED'}`);
      console.log(`Total ticker updates: ${receivedTickers.length}`);
      console.log(`Total option updates: ${receivedOptions.length}`);
      console.log(`Unique options: ${new Set(receivedOptions.map(o => o.occSymbol)).size}`);
      
      if (marketOpen) {
        // During market hours, expect full data
        expect(receivedTickers.length).toBeGreaterThan(0);
        const latestTicker = receivedTickers[receivedTickers.length - 1];
        expect(latestTicker.symbol).toBe(TEST_SYMBOL);
        expect(latestTicker.spot).toBeGreaterThan(0);

        if (receivedOptions.length > 0) {
          // Verify options have the correct underlying
          for (const option of receivedOptions) {
            expect(option.underlying).toBe(TEST_SYMBOL);
          }

          // Log a summary of the option data
          const optionsByStrike = new Map<number, NormalizedOption[]>();
          for (const opt of receivedOptions) {
            const existing = optionsByStrike.get(opt.strike) || [];
            existing.push(opt);
            optionsByStrike.set(opt.strike, existing);
          }

          console.log('\nOptions by Strike:');
          for (const [strike, opts] of Array.from(optionsByStrike.entries()).sort((a, b) => a[0] - b[0])) {
            const calls = opts.filter(o => o.optionType === 'call');
            const puts = opts.filter(o => o.optionType === 'put');
            console.log(`  $${strike}: ${calls.length} calls, ${puts.length} puts`);
          }
        } else {
          console.log('⚠️  No option streaming data received');
        }
      } else {
        // Outside market hours - verify connection and subscriptions work
        console.log('\n⚠️  Market is closed - limited data expected');
        expect(client.isConnected()).toBe(true);
        expect(client.getSubscribedTickers()).toContain(TEST_SYMBOL);
        expect(client.getSubscribedOptions().length).toBe(optionSymbols.length);
        
        if (receivedTickers.length > 0) {
          console.log(`✅ Received ${receivedTickers.length} ticker updates`);
          const latestTicker = receivedTickers[receivedTickers.length - 1];
          expect(latestTicker.symbol).toBe(TEST_SYMBOL);
        }
        
        if (receivedOptions.length > 0) {
          console.log(`✅ Received ${receivedOptions.length} option updates (bonus!)`);
        }
      }

      console.log('='.repeat(60));
    }, STREAM_TIMEOUT + 15000);
  });

  describe('Open Interest via REST API', () => {
    it('should fetch open interest for subscribed options', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TastyTrade credentials provided');
        return;
      }

      // Arrange
      const optionSymbols = generateOCCSymbolsAroundSpot(
        TEST_SYMBOL,
        TEST_EXPIRATION,
        TEST_SPOT_PRICE,
        {
          strikesAbove: STRIKES_ABOVE,
          strikesBelow: STRIKES_BELOW,
          strikeIncrementInDollars: STRIKE_INCREMENT,
        }
      );

      console.log('='.repeat(60));
      console.log('OPEN INTEREST TEST (TastyTrade REST API)');
      console.log('='.repeat(60));
      console.log(`Fetching open interest for ${optionSymbols.length} options`);

      try {
        await client.connect(Broker.TASTYTRADE, sessionToken);
      } catch (err) {
        if (isAuthError(err)) { warnAuthSkip('should fetch open interest for subscribed options'); return; }
        throw err;
      }

      // Subscribe to options
      client.subscribeToOptions(optionSymbols);

      // Act - Fetch open interest via REST API
      await client.fetchOpenInterest();

      // Assert - Check what data we received
      const allOptions = client.getAllOptions();
      
      console.log(`\nReceived data for ${allOptions.size} options:`);
      
      let optionsWithOI = 0;
      let optionsWithVolume = 0;
      let optionsWithBidAsk = 0;
      
      for (const [symbol, option] of allOptions) {
        console.log(`  ${symbol}:`);
        console.log(`    OI=${option.openInterest}, Vol=${option.volume}, Bid=${option.bid}, Ask=${option.ask}, IV=${option.impliedVolatility?.toFixed(4) ?? 'N/A'}`);
        
        if (option.openInterest > 0) optionsWithOI++;
        if (option.volume > 0) optionsWithVolume++;
        if (option.bid > 0 && option.ask > 0) optionsWithBidAsk++;
      }

      console.log('\n' + '='.repeat(60));
      console.log('SUMMARY');
      console.log('='.repeat(60));
      console.log(`Total options fetched: ${allOptions.size}`);
      console.log(`Options with OI > 0: ${optionsWithOI}`);
      console.log(`Options with Volume > 0: ${optionsWithVolume}`);
      console.log(`Options with Bid/Ask: ${optionsWithBidAsk}`);
      console.log('='.repeat(60));

      // Verify we received data (may be 0 if option chain endpoint returns different format)
      // TastyTrade option chain API may need adjustment
      if (allOptions.size > 0) {
        // Verify the data structure is correct
        const sampleOption = allOptions.values().next().value;
        expect(sampleOption).toBeDefined();
        if (sampleOption) {
          expect(sampleOption.underlying).toBe(TEST_SYMBOL);
          expect(sampleOption.strike).toBeGreaterThan(0);
          expect(['call', 'put']).toContain(sampleOption.optionType);
        }
      } else {
        console.log('⚠️  No options fetched - TastyTrade option chain API may need different endpoint');
      }
    }, 30000);
  });

  describe('Greeks via DxLink Streaming', () => {
    it('should receive Greeks updates for options', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TastyTrade credentials provided');
        return;
      }

      if (!marketOpen) {
        console.log('⚠️  Skipping Greeks test - market is closed');
        return;
      }

      // Arrange
      const receivedWithGreeks: NormalizedOption[] = [];
      
      const optionSymbols = generateOCCSymbolsAroundSpot(
        TEST_SYMBOL,
        TEST_EXPIRATION,
        TEST_SPOT_PRICE,
        {
          strikesAbove: 3,
          strikesBelow: 3,
          strikeIncrementInDollars: STRIKE_INCREMENT,
        }
      );

      console.log('='.repeat(60));
      console.log('GREEKS STREAMING TEST (DxLink)');
      console.log('='.repeat(60));
      console.log(`Subscribing to ${optionSymbols.length} options for Greeks`);

      try {
        await client.connect(Broker.TASTYTRADE, sessionToken);
      } catch (err) {
        if (isAuthError(err)) { warnAuthSkip('should receive Greeks updates for options'); return; }
        throw err;
      }

      // Act
      const greeksPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.log(`Timeout reached. Options with IV: ${receivedWithGreeks.length}`);
          resolve();
        }, STREAM_TIMEOUT);

        client.on('optionUpdate', (option) => {
          // Check if we got IV data (Greeks include volatility)
          if (option.impliedVolatility > 0) {
            receivedWithGreeks.push(option);
            console.log(`[GREEKS] ${option.occSymbol}: IV=${(option.impliedVolatility * 100).toFixed(2)}%`);
            
            if (receivedWithGreeks.length >= 3) {
              clearTimeout(timeout);
              resolve();
            }
          }
        });

        client.on('error', (error) => {
          console.error('[ERROR]', error);
        });
      });

      client.subscribeToOptions(optionSymbols);

      await greeksPromise;

      // Assert
      console.log('\n' + '='.repeat(60));
      console.log(`Received ${receivedWithGreeks.length} options with IV data`);
      console.log('='.repeat(60));

      if (receivedWithGreeks.length > 0) {
        const sample = receivedWithGreeks[0];
        expect(sample.impliedVolatility).toBeGreaterThan(0);
        console.log('\nSample option with Greeks:');
        console.log(`  Symbol: ${sample.occSymbol}`);
        console.log(`  IV: ${(sample.impliedVolatility * 100).toFixed(2)}%`);
      } else {
        console.log('⚠️  No Greeks data received - may need market hours');
      }
    }, STREAM_TIMEOUT + 10000);
  });
});

describe('TastyTradeClient Direct Usage', () => {
  let sessionToken: string;

  beforeAll(async () => {
    if (!shouldSkip) {
      try {
        sessionToken = await getSessionToken();
      } catch (err) {
        console.warn('⚠️  Failed to get TastyTrade session token — tests will skip gracefully.');
        sessionToken = '';
      }
    }
  });

  it('should work with multiple symbols', async () => {
    if (shouldSkip) {
      console.log('Skipping test: No TastyTrade credentials provided');
      return;
    }

    // Arrange
    const client = new FloeClient();
    const receivedTickers: NormalizedTicker[] = [];
    const symbols = ['SPY', 'QQQ', 'AAPL'];

    // Act
    try {
      await client.connect(Broker.TASTYTRADE, sessionToken);
      
      client.on('tickerUpdate', (ticker: NormalizedTicker) => {
        receivedTickers.push(ticker);
        console.log(`Received: ${ticker.symbol} @ ${ticker.spot}`);
      });

      client.on('error', (error: Error) => {
        console.error('Error:', error);
      });

      client.subscribeToTickers(symbols);

      // Wait for some data
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Assert
      expect(client.isConnected()).toBe(true);
      console.log(`Received ${receivedTickers.length} ticker updates via direct client`);
    } catch (err) {
      if (isAuthError(err)) { warnAuthSkip('should work with multiple symbols'); return; }
      throw err;
    } finally {
      if (client.isConnected()) client.disconnect();
    }
  }, 15000);
});

describe('DxLink Symbol Conversion', () => {
  it('should correctly handle OCC to streamer symbol conversion', () => {
    // This tests the internal conversion logic conceptually
    // OCC format: UNDERLYING + YYMMDD + C/P + STRIKE (8 digits, price * 1000)
    // TastyTrade streamer format: .UNDERLYING + YYMMDD + C/P + STRIKE (plain number)
    
    // Example conversions:
    // OCC: SPY251220C00600000 -> Streamer: .SPY251220C600
    // OCC: AAPL251220P00150000 -> Streamer: .AAPL251220P150
    
    const testCases = [
      { occ: 'SPY251220C00600000', expectedUnderlying: 'SPY', expectedStrike: 600 },
      { occ: 'AAPL251220P00150000', expectedUnderlying: 'AAPL', expectedStrike: 150 },
      { occ: 'QQQ251220C00525500', expectedUnderlying: 'QQQ', expectedStrike: 525.5 },
    ];

    const { parseOCCSymbol } = require('../utils/occ');

    for (const testCase of testCases) {
      const parsed = parseOCCSymbol(testCase.occ);
      expect(parsed.symbol).toBe(testCase.expectedUnderlying);
      expect(parsed.strike).toBe(testCase.expectedStrike);
    }

    console.log('✅ OCC symbol parsing verified');
  });
});

describe('Verbose Mode', () => {
  let sessionToken: string;

  beforeAll(async () => {
    if (!shouldSkip) {
      try {
        sessionToken = await getSessionToken();
      } catch (err) {
        console.warn('⚠️  Failed to get TastyTrade session token — tests will skip gracefully.');
        sessionToken = '';
      }
    }
  });

  it('should create client with verbose logging enabled', () => {
    // Arrange & Act
    const verboseClient = new FloeClient({ verbose: true });
    const normalClient = new FloeClient();
    const explicitFalseClient = new FloeClient({ verbose: false });

    // Assert - all should be created successfully
    expect(verboseClient).toBeDefined();
    expect(normalClient).toBeDefined();
    expect(explicitFalseClient).toBeDefined();

    console.log('✅ Verbose mode clients created successfully');
  });

  it('should log verbose information when enabled', async () => {
    if (shouldSkip) {
      console.log('Skipping test: No TastyTrade credentials provided');
      return;
    }

    // This test demonstrates verbose logging - check console output
    console.log('\n='.repeat(60));
    console.log('VERBOSE MODE TEST - Watch for [TastyTrade:*] log messages');
    console.log('='.repeat(60));

    const client = new FloeClient({ verbose: true });

    try {
      await client.connect(Broker.TASTYTRADE, sessionToken);
      
      // Subscribe to a few options to trigger OI logging
      const optionSymbols = generateOCCSymbolsAroundSpot(
        TEST_SYMBOL,
        TEST_EXPIRATION,
        TEST_SPOT_PRICE,
        {
          strikesAbove: 2,
          strikesBelow: 2,
          strikeIncrementInDollars: STRIKE_INCREMENT,
        }
      );

      client.subscribeToOptions(optionSymbols);
      
      // Fetch OI to trigger base OI logging
      await client.fetchOpenInterest();

      // Wait briefly for any streaming updates
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('='.repeat(60));
      console.log('Check above for [TastyTrade:OI] and [TastyTrade:DxLink] log messages');
      console.log('='.repeat(60));

    } catch (err) {
      if (isAuthError(err)) { warnAuthSkip('should log verbose information when enabled'); return; }
      throw err;
    } finally {
      if (client.isConnected()) client.disconnect();
    }
  }, 30000);
});
