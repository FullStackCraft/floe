import { FloeClient, Broker } from './FloeClient';
import { generateOCCSymbolsAroundSpot } from '../utils/occ';
import { NormalizedTicker, NormalizedOption } from '../types';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Integration test for FloeClient with Charles Schwab broker.
 * 
 * IMPORTANT: To run this test, you must provide Schwab OAuth credentials.
 * Set the environment variables:
 *   - SCHWAB_ACCESS_TOKEN: Your OAuth access token
 * 
 * Run with: 
 *   SCHWAB_ACCESS_TOKEN=xxx npm test -- --testPathPattern=FloeClientWithSchwab
 * 
 * To get these credentials:
 * 1. Register an application at https://developer.schwab.com/
 * 2. Complete the OAuth flow to get an access token
 * 3. Access tokens typically expire in 30 minutes; use refresh tokens for longer sessions
 * 
 * NOTE: Option streaming tests may not receive data outside of market hours.
 * The tests are designed to pass during off-hours by checking connection success
 * and symbol generation rather than requiring live data.
 */

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// Schwab OAuth access token - use environment variable or paste directly for manual testing
const SCHWAB_ACCESS_TOKEN = process.env.SCHWAB_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN_HERE';

// Test parameters
const TEST_SYMBOL = 'SPY';
const TEST_EXPIRATION = '2025-12-20'; // Use a valid future expiration
const TEST_SPOT_PRICE = 600; // Approximate current SPY price - adjust as needed
const STRIKES_ABOVE = 10;
const STRIKES_BELOW = 10;
const STRIKE_INCREMENT = 1;

// Timeout for receiving streaming data (ms)
const STREAM_TIMEOUT = 15000;

// Skip tests if no credentials are provided
const shouldSkip = SCHWAB_ACCESS_TOKEN === 'YOUR_ACCESS_TOKEN_HERE';

// ============================================================================
// HELPERS
// ============================================================================

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
console.log(`\n📊 Market is currently: ${marketOpen ? '🟢 OPEN' : '🔴 CLOSED'}\n`);

// ============================================================================
// TESTS
// ============================================================================

describe('FloeClient with Schwab Integration', () => {
  let client: FloeClient;

  beforeEach(() => {
    client = new FloeClient();
  });

  afterEach(() => {
    if (client.isConnected()) {
      client.disconnect();
    }
  });

  describe('Connection', () => {
    it('should connect to Schwab streaming API via WebSocket', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
        console.log('Set SCHWAB_ACCESS_TOKEN environment variable to run this test');
        return;
      }

      // Act
      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);

      // Assert
      expect(client.isConnected()).toBe(true);
    }, 15000);

    it('should disconnect cleanly', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
        return;
      }

      // Arrange
      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);
      expect(client.isConnected()).toBe(true);

      // Act
      client.disconnect();

      // Assert
      expect(client.isConnected()).toBe(false);
    }, 15000);
  });

  describe('Ticker Subscriptions', () => {
    it('should receive ticker updates for subscribed symbols', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
        return;
      }

      // Arrange
      const receivedTickers: NormalizedTicker[] = [];
      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);

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
        console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
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

      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);

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
        console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
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
      console.log('DEALER EXPOSURE USE CASE TEST (Schwab WebSocket)');
      console.log('='.repeat(60));
      console.log(`Underlying: ${TEST_SYMBOL}`);
      console.log(`Expiration: ${TEST_EXPIRATION}`);
      console.log(`Spot Price: ${TEST_SPOT_PRICE}`);
      console.log(`Options to subscribe: ${optionSymbols.length}`);
      console.log('='.repeat(60));

      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);

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
        console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
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
      console.log('OPEN INTEREST TEST (Schwab REST API)');
      console.log('='.repeat(60));
      console.log(`Fetching open interest for ${optionSymbols.length} options`);

      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);

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

      // Verify we received data (may be 0 depending on market hours and option liquidity)
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
        console.log('⚠️  No options fetched - this may be expected outside of market hours');
      }
    }, 30000);
  });

  describe('Live Open Interest Tracking', () => {
    it('should track intraday OI changes from option trades', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
        return;
      }

      if (!marketOpen) {
        console.log('⚠️  Skipping live OI test - market is closed');
        return;
      }

      // Arrange
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
      console.log('LIVE OPEN INTEREST TRACKING TEST');
      console.log('='.repeat(60));
      console.log(`Subscribing to ${optionSymbols.length} options for live OI`);

      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);

      // Subscribe and fetch initial OI
      client.subscribeToOptions(optionSymbols);
      await client.fetchOpenInterest();

      // Wait for some streaming updates
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, STREAM_TIMEOUT);

        let updateCount = 0;
        client.on('optionUpdate', () => {
          updateCount++;
          if (updateCount >= 10) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      // Check live OI values
      const allOptions = client.getAllOptions();
      
      console.log('\nLive OI Data:');
      for (const [symbol, option] of allOptions) {
        if (option.openInterest > 0 || option.liveOpenInterest !== undefined) {
          console.log(`  ${symbol}:`);
          console.log(`    Base OI: ${option.openInterest}`);
          console.log(`    Live OI: ${option.liveOpenInterest ?? 'N/A'}`);
        }
      }

      console.log('='.repeat(60));

      // Verify we have some options with OI data
      expect(allOptions.size).toBeGreaterThan(0);
    }, STREAM_TIMEOUT + 15000);
  });
});

describe('SchwabClient Direct Usage', () => {
  it('should work with multiple ticker symbols', async () => {
    if (shouldSkip) {
      console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
      return;
    }

    // Arrange
    const client = new FloeClient();
    const receivedTickers: NormalizedTicker[] = [];
    const symbols = ['SPY', 'QQQ', 'AAPL'];

    // Act
    try {
      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);
      
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
    } finally {
      client.disconnect();
    }
  }, 15000);
});

describe('Schwab Symbol Format Handling', () => {
  it('should correctly handle Schwab space-padded option symbols', () => {
    // Schwab uses space-padded format: "AAPL  240517C00170000" (6-char padded underlying)
    // Standard OCC format: "AAPL240517C00170000" (no padding)
    
    const testCases = [
      { schwab: 'SPY   251220C00600000', occ: 'SPY251220C00600000', underlying: 'SPY', strike: 600 },
      { schwab: 'AAPL  251220P00150000', occ: 'AAPL251220P00150000', underlying: 'AAPL', strike: 150 },
      { schwab: 'QQQ   251220C00525500', occ: 'QQQ251220C00525500', underlying: 'QQQ', strike: 525.5 },
    ];

    const { parseOCCSymbol } = require('../utils/occ');

    for (const testCase of testCases) {
      // Parse both formats and verify they produce the same result
      const parsedOcc = parseOCCSymbol(testCase.occ);
      const parsedSchwab = parseOCCSymbol(testCase.schwab);
      
      expect(parsedOcc.symbol).toBe(testCase.underlying);
      expect(parsedOcc.strike).toBe(testCase.strike);
      
      expect(parsedSchwab.symbol).toBe(testCase.underlying);
      expect(parsedSchwab.strike).toBe(testCase.strike);
    }

    console.log('✅ Schwab symbol format handling verified');
  });

  it('should generate OCC symbols that work with Schwab', () => {
    // Verify that our OCC symbol generator creates symbols compatible with Schwab
    const symbols = generateOCCSymbolsAroundSpot('SPY', '2025-12-20', 600, {
      strikesAbove: 2,
      strikesBelow: 2,
      strikeIncrementInDollars: 1,
    });

    // Should have 5 strikes × 2 types = 10 symbols
    expect(symbols.length).toBe(10);

    // All should be valid OCC format
    for (const sym of symbols) {
      expect(sym).toMatch(/^[A-Z]{1,6}\d{6}[CP]\d{8}$/);
    }

    // Check specific symbols
    expect(symbols[0]).toBe('SPY251220C00598000');
    expect(symbols[1]).toBe('SPY251220P00598000');

    console.log('Generated symbols:', symbols);
    console.log('✅ OCC symbol generation verified for Schwab compatibility');
  });
});

describe('Error Handling', () => {
  it('should emit error event on invalid credentials', async () => {
    // Arrange
    const client = new FloeClient();
    let errorReceived: Error | null = null;

    client.on('error', (error) => {
      errorReceived = error;
      console.log('Received expected error:', error.message);
    });

    // Act & Assert
    try {
      await client.connect(Broker.SCHWAB, 'invalid-token');
      // If we get here, either an error should have been emitted
      // or the connection should have failed
      expect(errorReceived !== null || !client.isConnected()).toBe(true);
    } catch (error) {
      // Connection failure is expected with invalid credentials
      expect(error).toBeDefined();
      console.log('Connection failed as expected:', error);
    } finally {
      client.disconnect();
    }
  }, 15000);

  it('should handle disconnection gracefully', async () => {
    if (shouldSkip) {
      console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
      return;
    }

    // Arrange
    const client = new FloeClient();
    let disconnectReceived = false;

    client.on('disconnected', ({ broker, reason }) => {
      disconnectReceived = true;
      console.log(`Disconnected from ${broker}: ${reason}`);
    });

    // Act
    await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);
    expect(client.isConnected()).toBe(true);

    client.disconnect();

    // Assert
    expect(client.isConnected()).toBe(false);
    expect(disconnectReceived).toBe(true);
  }, 15000);
});

describe('Subscription Management', () => {
  it('should track subscribed symbols correctly', async () => {
    if (shouldSkip) {
      console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
      return;
    }

    // Arrange
    const client = new FloeClient();
    const tickers = ['SPY', 'QQQ'];
    const options = ['SPY251220C00600000', 'SPY251220P00600000'];

    try {
      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);

      // Act
      client.subscribeToTickers(tickers);
      client.subscribeToOptions(options);

      // Assert
      const subscribedTickers = client.getSubscribedTickers();
      const subscribedOptions = client.getSubscribedOptions();

      expect(subscribedTickers).toContain('SPY');
      expect(subscribedTickers).toContain('QQQ');
      expect(subscribedOptions).toContain('SPY251220C00600000');
      expect(subscribedOptions).toContain('SPY251220P00600000');

      // Unsubscribe
      client.unsubscribeFromTickers(['SPY']);
      client.unsubscribeFromOptions(['SPY251220C00600000']);

      // Verify unsubscription
      const afterUnsubTickers = client.getSubscribedTickers();
      const afterUnsubOptions = client.getSubscribedOptions();

      expect(afterUnsubTickers).not.toContain('SPY');
      expect(afterUnsubTickers).toContain('QQQ');
      expect(afterUnsubOptions).not.toContain('SPY251220C00600000');
      expect(afterUnsubOptions).toContain('SPY251220P00600000');

      console.log('✅ Subscription management verified');
    } finally {
      client.disconnect();
    }
  }, 15000);
});

describe('Verbose Mode', () => {
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
      console.log('Skipping test: No SCHWAB_ACCESS_TOKEN provided');
      return;
    }

    // This test demonstrates verbose logging - check console output
    console.log('\n='.repeat(60));
    console.log('VERBOSE MODE TEST - Watch for [Schwab:*] log messages');
    console.log('='.repeat(60));

    const client = new FloeClient({ verbose: true });

    try {
      await client.connect(Broker.SCHWAB, SCHWAB_ACCESS_TOKEN);
      
      // Subscribe to a few options to trigger OI logging
      const optionSymbols = generateOCCSymbolsAroundSpot(
        TEST_SYMBOL,
        TEST_EXPIRATION,
        TEST_SPOT_PRICE,
        {
          strikesAbove: 2,
          strikesBelow: 2,
          strikeIncrementInDollars: 5,
        }
      );

      client.subscribeToOptions(optionSymbols);
      
      // Fetch OI to trigger base OI logging
      await client.fetchOpenInterest();

      // Wait briefly for any streaming updates
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('='.repeat(60));
      console.log('Check above for [Schwab:OI] and [Schwab:WS] log messages');
      console.log('='.repeat(60));

    } finally {
      client.disconnect();
    }
  }, 30000);
});
