import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Counted independently of src: lines that do not parse (the truncated last one) are skipped.
function expected(file: string) {
  const c = { ok: 0, retry: 0, fail: 0 };
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    try {
      c[JSON.parse(l).status as 'ok' | 'retry' | 'fail']++;
    } catch {
      // ignored
    }
  }
  return c;
}

const config ={ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest with counts', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    const { ok, retry, fail } = expected('runs/2026-10-28.jsonl');
    expect(html).toContain(`ok ${ok} · retry ${retry} · fail <span class="warn">${fail}</span>`);
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
