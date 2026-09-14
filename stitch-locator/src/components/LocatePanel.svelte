<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { FEATURE_LABELS, type FeatureKind } from '../lib/types';
  import { nextRows, rowAt } from '../lib/engine';

  const pat = $derived(store.activePattern);
  const obs = $derived(store.observation);
  const result = $derived(store.result);
  const compatible = $derived(store.compatible);
  const questions = $derived(store.questions);
  const colors = $derived(pat ? [...new Set(pat.rows.map((r) => r.color).filter((c) => c.trim() !== ''))] : []);

  let newFeatureKind = $state<FeatureKind>('cable');
  let newFeaturePresent = $state(true);
  let newFeatureWithin = $state(2);

  function addFeature() {
    store.setObservation(
      { features: [...obs.features, { kind: newFeatureKind, present: newFeaturePresent, withinRows: newFeatureWithin }] },
      '添加可辨特征',
    );
  }

  function removeFeature(idx: number) {
    store.setObservation({ features: obs.features.filter((_, i) => i !== idx) }, '移除可辨特征');
  }

  const unique = $derived(compatible.length === 1 ? compatible[0] : null);
</script>

{#if pat}
  {#if store.sessionInvalid && !store.confirmed}
    <div class="banner warn">⚠️ 花样已改动，之前的定位结果已失效。请重新核对下面的现场观察。</div>
  {/if}

  <section class="panel">
    <h2>① 续织前的现场观察</h2>
    <div class="grid">
      <label>
        针上总针数
        <input
          type="number" min="0" placeholder="数一针算一针"
          value={obs.stitchesOnNeedle ?? ''}
          onchange={(e) =>
            store.setObservation(
              { stitchesOnNeedle: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) },
              '录入针上针数',
            )}
        />
      </label>
      <label>
        织物朝向（哪面朝您）
        <select
          value={obs.fabricSide}
          onchange={(e) => store.setObservation({ fabricSide: e.currentTarget.value as typeof obs.fabricSide }, '录入织物朝向')}
        >
          <option value="unknown">看不清</option>
          <option value="RS">正面朝我</option>
          <option value="WS">反面朝我</option>
        </select>
      </label>
      <label>
        手中当前线色
        <input
          list="colors" placeholder="不确定可留空"
          value={obs.currentColor}
          onchange={(e) => store.setObservation({ currentColor: e.currentTarget.value }, '录入当前线色')}
        />
        <datalist id="colors">
          {#each colors as c}<option value={c}></option>{/each}
        </datalist>
      </label>
      <fieldset class="confidence">
        <legend>对以上记忆的把握程度</legend>
        <label><input type="radio" name="conf" checked={obs.confidence === 'sure'} onchange={() => store.setObservation({ confidence: 'sure' }, '修改把握程度')} /> 有把握（特征作为硬条件）</label>
        <label><input type="radio" name="conf" checked={obs.confidence === 'likely'} onchange={() => store.setObservation({ confidence: 'likely' }, '修改把握程度')} /> 大致记得</label>
        <label><input type="radio" name="conf" checked={obs.confidence === 'unsure'} onchange={() => store.setObservation({ confidence: 'unsure' }, '修改把握程度')} /> 不太确定</label>
      </fieldset>
    </div>

    <h3>最近可辨特征</h3>
    <div class="feat-add">
      <select bind:value={newFeatureKind}>
        {#each Object.entries(FEATURE_LABELS) as [k, label]}<option value={k}>{label}</option>{/each}
      </select>
      <select bind:value={newFeaturePresent}>
        <option value={true}>织过</option>
        <option value={false}>没织过</option>
      </select>
      <label>最近 <input type="number" min="1" max="4" class="w48" bind:value={newFeatureWithin} /> 行内</label>
      <button onclick={addFeature}>＋ 添加</button>
    </div>
    {#if obs.features.length > 0}
      <ul class="feat-list">
        {#each obs.features as f, i}
          <li>
            最近 {f.withinRows} 行{f.present ? '有' : '没有'}「{FEATURE_LABELS[f.kind]}」
            <button class="link" onclick={() => removeFeature(i)}>移除</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">还没有录入特征。针数、朝向、线色足以定位时可以不填。</p>
    {/if}
  </section>

  <section class="panel">
    <h2>② 相容行位（保留全部可能，不凭单一特征猜测）</h2>
    {#if result}
      {#if compatible.length === 0}
        <div class="banner bad">没有完全相容的行位。请检查针数是否数错，或到「断点恢复」页处理漏针 / 多织。</div>
        <details>
          <summary>查看各行位被排除的原因</summary>
          <ul>
            {#each result.candidates as c}
              <li>循环第 {c.afterRow} 行：{c.hardFails.join('；')}</li>
            {/each}
          </ul>
        </details>
      {:else if unique}
        {@const next = nextRows(pat, unique.afterRow, 1)[0]}
        <div class="banner good">
          <strong>唯一定位：您刚完成循环第 {unique.afterRow} 行。</strong><br />
          下一行（循环第 {next.cycleRow} 行，{next.row.side === 'RS' ? '正面' : '反面'}）：
          {next.row.color ? `用「${next.row.color}」，` : ''}
          {next.row.actions.length ? next.row.actions.map((a) => FEATURE_LABELS[a]).join('、') : '按花样平织'}
          {#if next.delta !== 0}，净{next.delta > 0 ? '加' : '减'} {Math.abs(next.delta)} 针{/if}
          {#if next.row.endMarker}，行末：{next.row.endMarker}{/if}
          ，完成后 {next.row.stitchCount} 针。
        </div>
        <button class="primary" onclick={() => store.confirm(unique.afterRow)}>✓ 确认这个续针点并生成打印卡</button>
      {:else}
        <p>有 <strong>{compatible.length}</strong> 个相容行位。请回答下方推荐问题以缩小范围，或直接确认其一：</p>
        <table class="cand">
          <thead><tr><th>刚完成的行</th><th>吻合的记忆</th><th>不吻合</th><th></th></tr></thead>
          <tbody>
            {#each compatible as c}
              <tr>
                <td>循环第 {c.afterRow} 行（{rowAt(pat, c.afterRow).side === 'RS' ? '正面' : '反面'}行，{rowAt(pat, c.afterRow).stitchCount} 针）</td>
                <td class="ok">{c.softMatched.length ? c.softMatched.join('；') : '—'}</td>
                <td class="miss">{c.softMissed.length ? c.softMissed.join('；') : '—'}</td>
                <td><button onclick={() => store.confirm(c.afterRow)}>确认此处</button></td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if questions.length > 0}
          <h3>③ 最能区分候选的观察项</h3>
          {#each questions as q}
            <div class="question">
              <strong>{q.text}</strong>
              <ul>
                {#each q.answers as a}
                  <li>
                    若「{a.label}」→ 剩 {a.remaining.length} 个行位：
                    {a.remaining.map((r) => `第 ${r} 行`).join('、')}
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        {/if}
      {/if}
    {/if}
  </section>
{/if}

<style>
  .panel { background: #fff; border: 1px solid #e2d9c8; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  h2 { font-size: 18px; margin: 0 0 12px; } h3 { font-size: 15px; margin: 14px 0 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .grid label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  .confidence { border: 1px solid #e2d9c8; border-radius: 8px; font-size: 13px; }
  .confidence label { display: block; margin: 2px 0; }
  .feat-add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .w48 { width: 48px; }
  .feat-list { padding-left: 18px; }
  .hint { color: #8a7a5c; font-size: 13px; }
  .banner { border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
  .banner.warn { background: #fff4d6; border: 1px solid #e0c060; }
  .banner.good { background: #e6f4ea; border: 1px solid #7fbf8f; }
  .banner.bad { background: #fdecea; border: 1px solid #e08a80; }
  table.cand { border-collapse: collapse; width: 100%; }
  .cand th, .cand td { border: 1px solid #e8e0cf; padding: 6px 8px; font-size: 14px; }
  .cand th { background: #f6f1e6; }
  .ok { color: #1a7f37; } .miss { color: #b3261e; }
  .question { border-left: 3px solid #7a5c2e; padding: 6px 12px; margin: 8px 0; background: #fbf8f0; }
  button.primary { background: #7a5c2e; color: #fff; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
  button.link { background: none; border: none; color: #7a5c2e; text-decoration: underline; cursor: pointer; }
</style>
