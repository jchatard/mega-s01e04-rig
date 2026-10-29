import { describe, expect, it } from 'vitest';
import type { DigestRow, Night } from '../src/digest/types.js';
import { DigestPage } from '../src/views/digest.js';

const row = (job: string, over: Partial<DigestRow> = {}): DigestRow => ({
  job,
  owner: 'ann',
  runs: 2,
  retries: 0,
  lastStatus: 'ok',
  lastError: null,
  firstAt: '2026-10-28T01:00:00+02:00',
  lastAt: '2026-10-28T01:05:00+02:00',
  ...over,
});

describe('DigestPage', () => {
  it('sorts, marks and dashes', () => {
    const night: Night = {
      night: '2026-10-28',
      badLines: 2,
      rows: [row('b', { owner: null, retries: 3 }), row('a', { lastStatus: 'fail', lastError: 'boom' })],
    };
    const html = String(<DigestPage night={night} />);
    expect(html).toContain('digest · 2026-10-28');
    expect(html.indexOf('>a<')).toBeLessThan(html.indexOf('>b<'));
    expect(html).toContain('—');
    expect(html).toContain('class="warn"');
    expect(html).toContain('2 line(s) in the log did not parse');
    expect(html).toContain('2026-10-28T01:00:00+02:00');
  });

  it('says nothing ran', () => {
    const html = String(<DigestPage night={{ night: '2026-10-28', rows: [], badLines: 0 }} />);
    expect(html).toContain('nothing ran');
  });
});
