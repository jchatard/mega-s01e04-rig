import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type NightCounts = { ok: number; retry: number; fail: number };

// Log lines per status for one night. Lines that do not parse are ignored.
export function countNight(runsDir: string, night: string): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return counts;
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const status = (JSON.parse(line) as { status?: unknown }).status;
      if (status === 'ok' || status === 'retry' || status === 'fail') counts[status]++;
    } catch {
      // bad line: ignored
    }
  }
  return counts;
}
