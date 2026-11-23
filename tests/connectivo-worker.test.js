import test from 'node:test';
import assert from 'node:assert/strict';
import { startConnectivoSync } from '../backend/integrations/connectivo/worker.js';
import { INTERVAL_MS } from '../backend/integrations/connectivo/sync.js';

const boundary = Date.parse('2026-11-23T18:30:00Z');
const config = { billingName: 'BT-rev1', dialerName: 'MED_MAIN_BTrev1' };

function createClock(start = boundary) {
  let current = start;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => current,
    recordAttempt: async () => {},
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: current + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    jumpTo: (at) => (current = at),
    scheduled: () => [...timers.values()].map(({ at }) => at).sort((a, b) => a - b),
    async advanceTo(at) {
      let next;
      while ((next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0])) {
        if (next[1].at > at) break;
        timers.delete(next[0]);
        current = Math.max(current, next[1].at);
        next[1].callback();
        await new Promise((resolve) => setImmediate(resolve));
      }
      current = Math.max(current, at);
    },
  };
}

function createLogger() {
  const messages = { info: [], warn: [], error: [] };
  return {
    messages,
    info: (message) => messages.info.push(message),
    warn: (message) => messages.warn.push(message),
    error: (message) => messages.error.push(message),
  };
}

test('retries a transient read inside the same half-hour and keeps the next boundary', async () => {
  const clock = createClock();
  const logger = createLogger();
  const reads = [];
  const records = [];
  const attempts = [];
  const snapshot = { account: 'fixture', billingDate: '2026-11-23', totals: {} };
  const stop = startConnectivoSync(null, config, {
    ...clock,
    logger,
    async readSnapshot() {
      reads.push(clock.now());
      if (reads.length === 1) throw new Error('Temporary connection failure');
      return snapshot;
    },
    async recordSnapshot(...args) {
      records.push(args);
      return 'imported';
    },
    async recordAttempt(...args) {
      attempts.push(args);
    },
  });
  try {
    await clock.advanceTo(boundary + 20_000);
    assert.deepEqual(reads, [boundary + 20_000]);
    assert.deepEqual(clock.scheduled(), [boundary + 30_000]);
    await clock.advanceTo(boundary + 30_000);
    assert.deepEqual(reads, [boundary + 20_000, boundary + 30_000]);
    assert.equal(records.length, 1);
    assert.equal(records[0][2], boundary);
    assert.equal(records[0][3], snapshot);
    assert.deepEqual(clock.scheduled(), [boundary + INTERVAL_MS + 20_000]);
    assert.equal(logger.messages.warn.length, 1);
    assert.equal(logger.messages.error.length, 0);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0][2], boundary);
    assert.match(attempts[0][3].message, /Temporary connection failure/);
    assert.equal(attempts[1][2], boundary);
    assert.equal(attempts[1][3], null);
  } finally {
    await stop();
  }
});

test('stops retrying after the sampling window and resumes at the next half-hour', async () => {
  const clock = createClock();
  const logger = createLogger();
  const reads = [];
  const stop = startConnectivoSync(null, config, {
    ...clock,
    logger,
    async readSnapshot() {
      reads.push(clock.now());
      throw new Error('Temporary connection failure');
    },
    async recordSnapshot() {
      assert.fail('A failed billing read must not be recorded');
    },
  });
  try {
    await clock.advanceTo(boundary + 5 * 60_000);
    assert.equal(reads.length, 11);
    assert.equal(reads.at(-1), boundary + 120_000);
    assert.equal(logger.messages.warn.length, 10);
    assert.equal(logger.messages.error.length, 1);
    assert.deepEqual(clock.scheduled(), [boundary + INTERVAL_MS + 20_000]);
    await clock.advanceTo(boundary + INTERVAL_MS + 20_000);
    assert.equal(reads.at(-1), boundary + INTERVAL_MS + 20_000);
  } finally {
    await stop();
  }
});

test('never records a read that completes after the sampling deadline', async () => {
  const clock = createClock();
  const logger = createLogger();
  const stop = startConnectivoSync(null, config, {
    ...clock,
    logger,
    async readSnapshot() {
      clock.jumpTo(boundary + 120_001);
      return {};
    },
    async recordSnapshot() {
      assert.fail('Late billing counters must not be assigned to a past interval');
    },
  });
  try {
    await clock.advanceTo(boundary + 20_000);
    assert.equal(logger.messages.error.length, 1);
    assert.match(logger.messages.error[0], /missed the sampling window/);
    assert.deepEqual(clock.scheduled(), [boundary + INTERVAL_MS + 20_000]);
  } finally {
    await stop();
  }
});

test('status persistence failure does not repeat a saved interval or stop scheduling', async () => {
  const clock = createClock();
  const logger = createLogger();
  let records = 0;
  const stop = startConnectivoSync(null, config, {
    ...clock,
    logger,
    async readSnapshot() {
      return {};
    },
    async recordSnapshot() {
      records++;
      return 'imported';
    },
    async recordAttempt() {
      throw new Error('Status storage unavailable');
    },
  });
  try {
    await clock.advanceTo(boundary + 20_000);
    assert.equal(records, 1);
    assert.equal(logger.messages.error.length, 1);
    assert.match(logger.messages.error[0], /Could not save sync status/);
    assert.equal(logger.messages.warn.length, 0);
    assert.deepEqual(clock.scheduled(), [boundary + INTERVAL_MS + 20_000]);
  } finally {
    await stop();
  }
});

test('shutdown cancels a scheduled retry', async () => {
  const clock = createClock();
  let reads = 0;
  const stop = startConnectivoSync(null, config, {
    ...clock,
    logger: createLogger(),
    async readSnapshot() {
      reads++;
      throw new Error('Temporary connection failure');
    },
  });
  await clock.advanceTo(boundary + 20_000);
  assert.deepEqual(clock.scheduled(), [boundary + 30_000]);
  await stop();
  await clock.advanceTo(boundary + INTERVAL_MS);
  assert.equal(reads, 1);
  assert.deepEqual(clock.scheduled(), []);
});

test('startup outside the sampling window waits for the next complete boundary', async () => {
  const clock = createClock(boundary + 10 * 60_000);
  const stop = startConnectivoSync(null, config, {
    ...clock,
    logger: createLogger(),
    async readSnapshot() {
      assert.fail('Startup must not fabricate an earlier boundary reading');
    },
  });
  assert.deepEqual(clock.scheduled(), [boundary + INTERVAL_MS + 20_000]);
  await stop();
});

test('takes the 7 AM PKT closing reading then waits for the 5 PM PKT opening reading', async () => {
  const closing = Date.parse('2026-11-23T02:00:00Z');
  const opening = Date.parse('2026-11-23T12:00:00Z');
  const clock = createClock(closing);
  const samples = [];
  const stop = startConnectivoSync(null, config, {
    ...clock,
    logger: createLogger(),
    readSnapshot: async () => ({}),
    async recordSnapshot(_db, _config, at) {
      samples.push(at);
      return 'imported';
    },
  });
  try {
    await clock.advanceTo(opening + 20_000);
    assert.deepEqual(samples, [closing, opening]);
    assert.deepEqual(clock.scheduled(), [opening + INTERVAL_MS + 20_000]);
  } finally {
    await stop();
  }
});

test('starting up during the daytime pause schedules the opening reading', async () => {
  const clock = createClock(Date.parse('2026-11-23T08:00:00Z'));
  const stop = startConnectivoSync(null, config, { ...clock, logger: createLogger() });
  assert.deepEqual(clock.scheduled(), [Date.parse('2026-11-23T12:00:20Z')]);
  await stop();
});
