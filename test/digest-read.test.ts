import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs sorted by name and counts the truncated line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts retries and keeps the offset in times', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('reports the last status and error of a failed job', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row?.lastStatus).toBe('fail');
    expect(row?.lastError).toBe('quota exceeded');
    expect(row?.owner).toBe('lane-07');
  });

  it('keeps a row whose owner is null', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
    expect(row?.lastError).toBeNull();
  });

  it('does not count the truncated last line as a run', () => {
    const row = night?.rows.find((r) => r.job === 'lane/sync');
    expect(row?.runs).toBe(8);
    expect(row?.retries).toBe(1);
    expect(row?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight on synthetic nights', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns an empty night for an empty file', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts invalid lines, ignores blank lines, uses the last owner', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","owner":"x"}',
      '',
      '{"at":"2026-01-03T02:00:00+02:00","job":"a","status":"fail","owner":"y","error":"boom"}',
      '{"at":"2026-01-03T03:00:00+02:00","job":"a","status":"ok","owner":"y"}',
      '{"at":"2026-01-03T03:00:00+02:00","job":"b","status":"weird","owner":"y"}',
      '{"job":"b","status":"ok","owner":"y"}',
      '[1,2]',
      'not json',
      '',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n'));
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(4);
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'y',
        runs: 3,
        retries: 0,
        lastStatus: 'ok',
        lastError: 'boom',
        firstAt: '2026-01-03T01:00:00+02:00',
        lastAt: '2026-01-03T03:00:00+02:00',
      },
    ]);
  });
});
