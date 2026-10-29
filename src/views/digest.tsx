import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

function Row({ row }: { row: DigestRow }) {
  const manyRetries = row.retries >= 3;
  const failed = row.lastStatus === 'fail';
  return (
    <tr class={manyRetries || failed ? 'warn' : undefined}>
      <td>{row.job}</td>
      <td>{row.owner ?? dash}</td>
      <td>{row.runs}</td>
      <td class={manyRetries ? 'warn' : undefined}>{row.retries}</td>
      <td class={failed ? 'warn' : undefined}>{row.lastStatus}</td>
      <td>{row.lastError ?? dash}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestPage({ night }: { night: Night }) {
  const rows = [...night.rows].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.badLines > 0 ? (
        <p class="mute">{night.badLines} line(s) in the log did not parse</p>
      ) : null}
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row row={row} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
