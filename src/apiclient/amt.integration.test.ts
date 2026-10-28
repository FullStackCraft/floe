import { NewApiClient, AMTEventCategory } from './index';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Integration tests for AMT JOY API endpoints.
 *
 * IMPORTANT: To run these tests, set the environment variable:
 *   FLOE_DATA_API_KEY=amtjoy_live_xxx
 *
 * Run with:
 *   FLOE_DATA_API_KEY=xxx npm test -- --testPathPattern=amt.integration
 *
 * Tests will skip gracefully if the API key is not provided.
 */

const API_KEY = process.env.FLOE_DATA_API_KEY || '';
const shouldSkip = !API_KEY;

function skipIfNoKey(): boolean {
  if (shouldSkip) {
    console.log('Skipping: FLOE_DATA_API_KEY not set');
    return true;
  }
  return false;
}

describe('AMT Integration Tests', () => {
  it('GetAMTSessionStats — futures (NQ)', async () => {
    if (skipIfNoKey()) return;

    const client = NewApiClient(API_KEY);
    const rows = await client.GetAMTSessionStats(undefined, {
      symbol: 'NQ',
      session_id: '2025-03-10',
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].symbol).toBe('NQ');
    expect(rows[0].session_id).toBe('2025-03-10');
    expect(rows[0].session_data).toBeDefined();
    expect(typeof rows[0].session_data).toBe('object');
  }, 15000);

  it('GetAMTSessionStats — stock (SPY)', async () => {
    if (skipIfNoKey()) return;

    const client = NewApiClient(API_KEY);
    const rows = await client.GetAMTSessionStats(undefined, {
      symbol: 'SPY',
      session_id: '2025-03-10',
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].symbol).toBe('SPY');
    expect(rows[0].session_data).toBeDefined();
  }, 15000);

  it('GetAMTEvents — futures (NQ)', async () => {
    if (skipIfNoKey()) return;

    const client = NewApiClient(API_KEY);
    const rows = await client.GetAMTEvents(undefined, {
      symbol: 'NQ',
      session_id: '2025-03-10',
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].symbol).toBe('NQ');
    expect(Array.isArray(rows[0].events)).toBe(true);
    expect(rows[0].events.length).toBeGreaterThan(0);

    // Verify event structure
    const event = rows[0].events[0];
    expect(event).toHaveProperty('event_code');
    expect(event).toHaveProperty('event_category');
  }, 15000);

  it('GetAMTEvents — stock (SPY)', async () => {
    if (skipIfNoKey()) return;

    const client = NewApiClient(API_KEY);
    const rows = await client.GetAMTEvents(undefined, {
      symbol: 'SPY',
      session_id: '2025-03-10',
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(Array.isArray(rows[0].events)).toBe(true);

    // Stocks should not have overnight events
    const overnightEvents = rows[0].events.filter(
      (e) => e.event_category === AMTEventCategory.Overnight
    );
    expect(overnightEvents.length).toBe(0);
  }, 15000);

  it('GetAMTSessionStats — invalid symbol returns empty', async () => {
    if (skipIfNoKey()) return;

    const client = NewApiClient(API_KEY);
    const rows = await client.GetAMTSessionStats(undefined, {
      symbol: 'ZZZZZ',
      session_id: '2025-03-10',
    });

    expect(rows.length).toBe(0);
  }, 15000);

  it('GetAMTEvents — invalid session_id format rejects', async () => {
    if (skipIfNoKey()) return;

    const client = NewApiClient(API_KEY);
    await expect(
      client.GetAMTEvents(undefined, {
        symbol: 'NQ',
        session_id: 'not-a-date',
      })
    ).rejects.toThrow();
  }, 15000);
});
