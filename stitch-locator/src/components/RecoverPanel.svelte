<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { affectedRepeats, continuePlan, frogPaths, mendPlan, rowAt } from '../lib/engine';

  const pat = $derived(store.activePattern);
  const confirmed = $derived(store.confirmed);
  /** 恢复路径基于确认时冻结的花样快照，之后的花样改动不影响已确认的位置 */
  const frozen = $derived(confirmed?.patternSnapshot ?? null);

  let actual = $state<number | null>(null);
  let frogT = $state(1);

  const expected = $derived(frozen && confirmed ? rowAt(frozen, confirmed.afterRow).stitchCount : 0);
  const paths = $derived(frozen && confirmed ? frogPaths(frozen, confirmed.afterRow) : []);
  const frogPath = $derived(paths.find((p) => p.t === Number(frogT)));
  const mend = $derived(frozen && confirmed && actual != null ? mendPlan(frozen, confirmed.afterRow, actual) : null);
  const cont = $derived(frozen && confirmed && actual != null ? continuePlan(frozen, confirmed.afterRow, actual) : null);
  const repeats = $derived(frozen && confirmed && actual != null ? affectedRepeats(frozen, confirmed.afterRow, actual) : '');
</script>

{#if !confirmed || !frozen}
  <div class="banner warn">请先在「续针定位」页确认续针点，再使用断点恢复。</div>
{:else}
  {#if store.confirmedStale}
    <div class="banner warn">⚠️ 花样在确认后已改动（当前 v{pat?.version}）。以下路径仍按确认时冻结的 v{confirmed.patternVersion} 计算；若改动涉及这些行，请重新定位确认。</div>
  {/if}
  <div class="panel">
    <h2>断点恢复（从循环第 {confirmed.afterRow} 行之后出发）</h2>
    <p>
      确认位置应有 <strong>{expected}</strong> 针。现在针上实际
      <input type="number" min="0" class="w72" bind:value={actual} placeholder="实际针数" /> 针。
    </p>
    {#if actual != null && mend && cont}
      <p class="summary">{mend.summary}</p>

      <div class="paths">
        <div class="path">
          <h3>路径一：拆回（最近八行内）</h3>
          <label>拆回
            <select bind:value={frogT}>
              {#each paths as p}<option value={p.t}>{p.t} 行</option>{/each}
            </select>
          </label>
          {#if frogPath}
            <ol>
              {#each frogPath.steps as s}
                <li>拆循环第 {s.row} 行：{s.undoText}（拆后 {s.stitchesAfter} 针）</li>
              {/each}
            </ol>
            <p>拆完后停在循环第 {frogPath.endRow} 行之后，针上应为 {frogPath.endStitches} 针。</p>
          {/if}
        </div>

        <div class="path">
          <h3>路径二：补针 / 收针（不拆）</h3>
          <p>{mend.placement}</p>
          {#if mend.suspectRows.length > 0}
            <p>最近八行中最可能出错的行：</p>
            <ul>
              {#each mend.suspectRows as s}
                <li>循环第 {s.row} 行：{s.reason}</li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="path">
          <h3>路径三：继续织，下一行调整</h3>
          <p>{cont.text}</p>
        </div>
      </div>

      <div class="repeats">
        <h3>对称织片 / 重复单元影响</h3>
        <p>{repeats}</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .panel { background: #fff; border: 1px solid #e2d9c8; border-radius: 10px; padding: 16px; }
  .banner.warn { background: #fff4d6; border: 1px solid #e0c060; border-radius: 8px; padding: 10px 12px; }
  .w72 { width: 72px; }
  .summary { font-weight: 600; }
  .paths { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .path { border: 1px solid #e2d9c8; border-radius: 8px; padding: 12px; background: #fbf8f0; }
  .path h3, .repeats h3 { margin-top: 0; font-size: 15px; }
  .repeats { margin-top: 14px; border-top: 1px dashed #cbbf9f; padding-top: 10px; }
</style>
