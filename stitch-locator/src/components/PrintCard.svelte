<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { nextRows } from '../lib/engine';
  import { FEATURE_LABELS } from '../lib/types';

  const pat = $derived(store.activePattern);
  const confirmed = $derived(store.confirmed);
  const rows = $derived(pat && confirmed ? nextRows(pat, confirmed.afterRow, 6) : []);
</script>

{#if pat && confirmed}
  <div class="print-card" id="print-card">
    <header>
      <h1>续针打印卡 · {pat.name}</h1>
      <p>
        确认于 {new Date(confirmed.confirmedAt).toLocaleString('zh-CN')} ｜
        花样版本 v{confirmed.patternVersion} ｜ 已完成循环第 {confirmed.afterRow} 行
      </p>
      {#if store.confirmedStale}
        <p class="stale">⚠️ 确认之后花样又有改动（当前 v{pat.version}），本卡基于冻结的 v{confirmed.patternVersion}，请以织物为准。</p>
      {/if}
    </header>

    <table>
      <thead>
        <tr><th>接下来</th><th>循环行号</th><th>正/反面</th><th>线色</th><th>关键动作</th><th>行末针数</th><th>行末标记</th></tr>
      </thead>
      <tbody>
        {#each rows as r, i}
          <tr>
            <td>第 {i + 1} 行</td>
            <td>第 {r.cycleRow} 行{r.wraps ? '（新循环）' : ''}</td>
            <td>{r.row.side === 'RS' ? '正面' : '反面'}</td>
            <td>{r.row.color || '—'}</td>
            <td>
              {r.row.actions.length ? r.row.actions.map((a) => FEATURE_LABELS[a]).join('、') : '平织'}
              {r.delta !== 0 ? `；净${r.delta > 0 ? '加' : '减'}${Math.abs(r.delta)}针` : ''}
              {r.row.note ? `；${r.row.note}` : ''}
            </td>
            <td>{r.row.stitchCount}</td>
            <td>{r.row.endMarker || '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <footer>
      <p>冻结观察：针上 {confirmed.observation.stitchesOnNeedle ?? '未录'} 针 ｜
        朝向 {confirmed.observation.fabricSide === 'unknown' ? '未录' : confirmed.observation.fabricSide === 'RS' ? '正面朝我' : '反面朝我'} ｜
        线色 {confirmed.observation.currentColor || '未录'}</p>
    </footer>
  </div>
  <div class="actions no-print">
    <button class="primary" onclick={() => window.print()}>🖨️ 打印这张卡</button>
    <button onclick={() => store.unconfirm()}>取消确认（重新定位）</button>
  </div>
{:else}
  <p class="no-print">确认续针点后，这里会生成只含接下来六行的打印卡。</p>
{/if}

<style>
  .print-card { background: #fff; border: 2px solid #7a5c2e; border-radius: 10px; padding: 20px; max-width: 720px; }
  .print-card h1 { font-size: 20px; margin: 0 0 6px; }
  .print-card header p { margin: 2px 0; color: #5c4f38; font-size: 13px; }
  .stale { color: #b3261e !important; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #999; padding: 6px 8px; font-size: 15px; text-align: left; }
  th { background: #f6f1e6; }
  footer p { font-size: 12px; color: #5c4f38; }
  .actions { margin-top: 12px; display: flex; gap: 8px; }
  button.primary { background: #7a5c2e; color: #fff; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; }

  @media print {
    :global(body) * { visibility: hidden; }
    .print-card, .print-card * { visibility: visible; }
    .print-card { position: absolute; inset: 0 auto auto 0; border-radius: 0; width: 100%; max-width: none; }
    .no-print { display: none !important; }
  }
</style>
