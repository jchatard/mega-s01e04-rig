import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

// Normal night, written out of job order on purpose: the reader sorts by job.
const normal =
  [
    line('2026-10-28T01:30:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
    line('2026-10-28T01:31:00+01:00', 'fixtures/zeta', 'ok', null),
    line('2026-10-28T01:32:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
    line('2026-10-28T01:33:00+01:00', 'fixtures/alpha', 'ok', 'rook'),
    line('2026-10-28T01:34:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
    line('2026-10-28T01:35:00+01:00', 'fixtures/refresh', 'ok', 'rook'),
    line('2026-10-28T01:36:00+01:00', 'fixtures/broken', 'fail', 'rook', 'disk full'),
  ].join('\n') + '\n';

// One good line, one truncated line, one more good line.
const bad =
  [
    line('2026-10-27T02:00:00+01:00', 'fixtures/b-job', 'ok', 'rook'),
    '{"at":"2026-10-27T02:01:00+01:00","job":"fixtures/trunc',
    line('2026-10-27T02:02:00+01:00', 'fixtures/a-job', 'ok', 'rook'),
  ].join('\n') + '\n';

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), normal);
  writeFileSync(join(runsDir, '2026-10-26.jsonl'), '');
  writeFileSync(join(runsDir, '2026-10-27.jsonl'), bad);
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// The <tr> markup of the row that mentions `job`.
function rowHtml(html: string, job: string): string {
  const chunk = html.split('<tr').find((c) => c.includes(job));
  if (!chunk) throw new Error(`no row for ${job}`);
  return chunk;
}

const warnClass = /class="[^"]*\bwarn\b/;

async function pageJobs(path: string): Promise<string[]> {
  const html = await (await app.request(path)).text();
  return [...html.matchAll(/fixtures\/[a-z-]+/g)].map((m) => m[0]).filter((j, i, all) => all.indexOf(j) === i);
}

type Body = { night: string; rows: DigestRow[]; badLines: number };

describe('GET /digest/:night', () => {
  it('renders the lane banner, one table and one row per job sorted by job', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(await pageJobs('/digest/2026-10-28')).toEqual([
      'fixtures/alpha',
      'fixtures/broken',
      'fixtures/refresh',
      'fixtures/zeta',
    ]);
  });

  it('marks a job with 3 retries and a failed job as warn, not a clean one', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    expect(rowHtml(html, 'fixtures/refresh')).toMatch(warnClass);
    expect(rowHtml(html, 'fixtures/broken')).toMatch(warnClass);
    expect(rowHtml(html, 'fixtures/alpha')).not.toMatch(warnClass);
  });

  it('renders a null owner as an em dash and keeps the row', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    expect(rowHtml(html, 'fixtures/zeta')).toContain('—');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty file', async () => {
    const res = await app.request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the good jobs when a line is bad', async () => {
    const res = await app.request('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('fixtures/a-job');
    expect(html).toContain('fixtures/b-job');
    expect(html).not.toContain('fixtures/trunc');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns night, sorted rows and badLines 0', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual([
      'fixtures/alpha',
      'fixtures/broken',
      'fixtures/refresh',
      'fixtures/zeta',
    ]);
    const refresh = body.rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', owner: 'rook' });
    expect(body.rows.find((r) => r.job === 'fixtures/zeta')?.owner).toBeNull();
    expect(body.rows.find((r) => r.job === 'fixtures/broken')?.lastStatus).toBe('fail');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('returns no rows and badLines 0 for an empty file', async () => {
    const res = await app.request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-26', rows: [], badLines: 0 });
  });

  it('counts a bad line and keeps the good rows', async () => {
    const res = await app.request('/api/digest/2026-10-27');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['fixtures/a-job', 'fixtures/b-job']);
  });
});

describe('page and JSON agree', () => {
  it.each(['2026-10-28', '2026-10-27'])('list the same jobs in the same order for %s', async (night) => {
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as Body;
    expect(await pageJobs(`/digest/${night}`)).toEqual(body.rows.map((r) => r.job));
  });
});
