import { FloeClient, Broker } from './FloeClient';
import { generateOCCSymbolsAroundSpot } from '../utils/occ';
import { NormalizedTicker, NormalizedOption } from '../types';

/**
 * Integration test for FloeClient with Tradier broker.
 * 
 * IMPORTANT: To run this test, you must provide a valid Tradier API token.
 * Set the TRADIER_API_KEY environment variable or paste the token directly below.
 * 
 * Run with: TRADIER_API_KEY=your-token-here npm test -- --testPathPattern=FloeClientWithTradier
 * 
 * NOTE: Option streaming tests may not receive data outside of market hours.
 * The tests are designed to pass during off-hours by checking connection success
 * and symbol generation rather than requiring live data.
 */

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// Paste your Tradier API token here for manual testing, or use environment variable
const TRADIER_API_KEY = process.env.TRADIER_API_KEY || 'YOUR_TRADIER_API_KEY_HERE';

// Test parameters
const TEST_SYMBOL = 'QQQ';
const TEST_EXPIRATION = '2025-01-17'; // Use a valid future expiration
const TEST_SPOT_PRICE = 530; // Approximate current QQQ price - adjust as needed
const STRIKES_ABOVE = 5;
const STRIKES_BELOW = 5;
const STRIKE_INCREMENT = 5;

// Timeout for receiving streaming data (ms)
const STREAM_TIMEOUT = 15000;

// Skip tests if no API key is provided
const shouldSkip = TRADIER_API_KEY === 'YOUR_TRADIER_API_KEY_HERE' || TRADIER_API_KEY === 'PASTE_YOUR_KEY_HERE';

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

describe('FloeClient with Tradier Integration', () => {
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
    it('should connect to Tradier streaming API', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TRADIER_API_KEY provided');
        return;
      }

      // Arrange
      // - FloeClient is created in beforeEach

      // Act
      await client.connect(Broker.TRADIER, TRADIER_API_KEY);

      // Assert
      expect(client.isConnected()).toBe(true);
    }, 10000);

    it('should disconnect cleanly', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TRADIER_API_KEY provided');
        return;
      }

      // Arrange
      await client.connect(Broker.TRADIER, TRADIER_API_KEY);
      expect(client.isConnected()).toBe(true);

      // Act
      client.disconnect();

      // Assert
      expect(client.isConnected()).toBe(false);
    }, 10000);
  });

  describe('Ticker Subscriptions', () => {
    it('should receive ticker updates for subscribed symbols', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TRADIER_API_KEY provided');
        return;
      }

      // Arrange
      const receivedTickers: NormalizedTicker[] = [];
      await client.connect(Broker.TRADIER, TRADIER_API_KEY);

      // Act
      const tickerPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout: No ticker updates received within ${STREAM_TIMEOUT}ms`));
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
          clearTimeout(timeout);
          reject(error);
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
    }, STREAM_TIMEOUT + 5000);
  });

  describe('Option Subscriptions', () => {
    it('should subscribe to options and receive updates when market is open', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TRADIER_API_KEY provided');
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
          strikeIncrement: STRIKE_INCREMENT,
        }
      );

      console.log(`Generated ${optionSymbols.length} option symbols to subscribe to`);
      console.log('Sample symbols:', optionSymbols.slice(0, 4));

      await client.connect(Broker.TRADIER, TRADIER_API_KEY);

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
        expect(option.expirationTimestamp).toBeGreaterThan(Date.now());
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
    }, STREAM_TIMEOUT + 5000);
  });

  describe('Combined Ticker and Option Subscriptions (Dealer Exposure Use Case)', () => {
    it('should receive both ticker and option updates simultaneously', async () => {
      if (shouldSkip) {
        console.log('Skipping test: No TRADIER_API_KEY provided');
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
          strikeIncrement: STRIKE_INCREMENT,
        }
      );

      console.log('='.repeat(60));
      console.log('DEALER EXPOSURE USE CASE TEST');
      console.log('='.repeat(60));
      console.log(`Underlying: ${TEST_SYMBOL}`);
      console.log(`Expiration: ${TEST_EXPIRATION}`);
      console.log(`Spot Price: ${TEST_SPOT_PRICE}`);
      console.log(`Options to subscribe: ${optionSymbols.length}`);
      console.log('='.repeat(60));

      await client.connect(Broker.TRADIER, TRADIER_API_KEY);

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

        expect(receivedOptions.length).toBeGreaterThan(0);

        // Verify options have the correct underlying
        for (const option of receivedOptions) {
          expect(option.underlying).toBe(TEST_SYMBOL);
        }

        // Log a summary of the option data (like what you'd use for exposure calc)
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
        // Outside market hours - verify connection and subscriptions work
        console.log('\n⚠️  Market is closed - limited data expected');
        expect(client.isConnected()).toBe(true);
        expect(client.getSubscribedTickers()).toContain(TEST_SYMBOL);
        expect(client.getSubscribedOptions().length).toBe(optionSymbols.length);
        
        // We might still get some ticker data even when market is closed
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
    }, STREAM_TIMEOUT + 10000);
  });
});

describe('OCC Symbol Generation', () => {
  it('should generate correct OCC symbols around spot price (compact format)', () => {
    // Arrange
    const symbol = 'QQQ';
    const expiration = '2025-01-17';
    const spot = 530;

    // Act
    const symbols = generateOCCSymbolsAroundSpot(symbol, expiration, spot, {
      strikesAbove: 2,
      strikesBelow: 2,
      strikeIncrement: 5,
    });

    // Assert
    // Should have 5 strikes (520, 525, 530, 535, 540) × 2 types = 10 symbols
    expect(symbols.length).toBe(10);

    // Verify compact format: SYMBOL + YYMMDD + C/P + 8 digits (no padding)
    // QQQ250117C00520000 = 18 characters
    for (const sym of symbols) {
      expect(sym).toMatch(/^[A-Z]{1,6}\d{6}[CP]\d{8}$/);
    }

    // Check first symbol is what we expect
    expect(symbols[0]).toBe('QQQ250117C00520000');
    expect(symbols[1]).toBe('QQQ250117P00520000');

    // Check that we have both calls and puts
    const calls = symbols.filter(s => s.includes('C'));
    const puts = symbols.filter(s => s.includes('P'));
    expect(calls.length).toBe(5);
    expect(puts.length).toBe(5);

    console.log('Generated symbols:', symbols);
  });

  it('should parse both compact and padded OCC symbols', () => {
    // Arrange
    const compactSymbol = 'AAPL230120C00150000';
    const paddedSymbol = 'AAPL  230120C00150000';

    // Act & Assert - both should parse to the same values
    const { parseOCCSymbol } = require('../utils/occ');

    const compactParsed = parseOCCSymbol(compactSymbol);
    expect(compactParsed.symbol).toBe('AAPL');
    expect(compactParsed.strike).toBe(150);
    expect(compactParsed.optionType).toBe('call');

    const paddedParsed = parseOCCSymbol(paddedSymbol);
    expect(paddedParsed.symbol).toBe('AAPL');
    expect(paddedParsed.strike).toBe(150);
    expect(paddedParsed.optionType).toBe('call');
  });
});
