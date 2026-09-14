<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { FEATURE_LABELS, newRow, type FeatureKind, type PatternRow } from '../lib/types';

  const pat = $derived(store.activePattern);

  const featureKinds = Object.keys(FEATURE_LABELS) as FeatureKind[];

  function deltaOf(idx: number): number {
    if (!pat) return 0;
    const cur = pat.rows[idx].stitchCount;
    const prev = idx === 0 ? (pat.rows.length > 1 ? pat.rows[pat.rows.length - 1].stitchCount : 0) : pat.rows[idx - 1].stitchCount;
    return cur - prev;
  }

  function updateRow(idx: number, patch: Partial<PatternRow>, label: string) {
    void store.mutatePattern(label, (p) => {
      Object.assign(p.rows[idx], patch);
    });
  }

  function toggleAction(idx: number, kind: FeatureKind) {
    const row = pat!.rows[idx];
    const actions = row.actions.includes(kind)
      ? row.actions.filter((a) => a !== kind)
      : [...row.actions, kind];
    updateRow(idx, { actions }, `${row.actions.includes(kind) ? '移除' : '添加'}动作「${FEATURE_LABELS[kind]}」`);
  }

  function addRow(afterIdx: number) {
    void store.mutatePattern('添加行', (p) => {
      const side = afterIdx >= 0 ? (p.rows[afterIdx].side === 'RS' ? 'WS' : 'RS') : 'RS';
      const count = afterIdx >= 0 ? p.rows[afterIdx].stitchCount : 0;
      p.rows.splice(afterIdx + 1, 0, newRow(side, count));
    });
  }

  function removeRow(idx: number) {
    void store.mutatePattern(`删除第 ${idx + 1} 行`, (p) => {
      p.rows.splice(idx, 1);
    });
  }

  function moveRow(idx: number, dir: -1 | 1) {
    void store.mutatePattern('移动行', (p) => {
      const j = idx + dir;
      if (j < 0 || j >= p.rows.length) return;
      [p.rows[idx], p.rows[j]] = [p.rows[j], p.rows[idx]];
    });
  }

  function duplicateRow(idx: number) {
    void store.mutatePattern('复制行', (p) => {
      const copy = { ...p.rows[idx], id: crypto.randomUUID() };
      p.rows.splice(idx + 1, 0, copy);
    });
  }
</script>

{#if pat}
  <section class="panel">
    <div class="meta">
      <label>
        花样名称
        <input
          value={pat.name}
          onchange={(e) => store.mutatePattern('重命名花样', (p) => (p.name = e.currentTarget.value))}
        />
      </label>
      <label>
        针法
        <select
          value={pat.craft}
          onchange={(e) => store.mutatePattern('修改针法类型', (p) => (p.craft = e.currentTarget.value as 'knit' | 'crochet'))}
        >
          <option value="knit">棒针</option>
          <option value="crochet">钩针</option>
        </select>
      </label>
      <span class="version">版本 v{pat.version}（每次改动后旧定位立即失效）</span>
    </div>

    <table class="rows">
      <thead>
        <tr>
          <th>行</th><th>正/反面</th><th>行末针数</th><th>±针</th><th>线色</th>
          <th>关键动作</th><th>行末标记</th><th>备注</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each pat.rows as row, i (row.id)}
          <tr>
            <td class="num">{i + 1}</td>
            <td>
              <select
                value={row.side}
                onchange={(e) => updateRow(i, { side: e.currentTarget.value as 'RS' | 'WS' }, '修改正反面')}
              >
                <option value="RS">正面</option>
                <option value="WS">反面</option>
              </select>
            </td>
            <td>
              <input
                type="number" min="0" class="w64"
                value={row.stitchCount}
                onchange={(e) => updateRow(i, { stitchCount: Number(e.currentTarget.value) }, '修改针数')}
              />
            </td>
            <td class="num delta" class:pos={deltaOf(i) > 0} class:neg={deltaOf(i) < 0}>
              {deltaOf(i) > 0 ? `+${deltaOf(i)}` : deltaOf(i)}
            </td>
            <td>
              <input
                class="w80" placeholder="线色"
                value={row.color}
                onchange={(e) => updateRow(i, { color: e.currentTarget.value }, '修改线色')}
              />
            </td>
            <td class="actions">
              {#each featureKinds as kind}
                <button
                  class="chip" class:on={row.actions.includes(kind)}
                  title={FEATURE_LABELS[kind]}
                  onclick={() => toggleAction(i, kind)}
                >{FEATURE_LABELS[kind]}</button>
              {/each}
            </td>
            <td>
              <input
                class="w110" placeholder="如：挂记号圈"
                value={row.endMarker}
                onchange={(e) => updateRow(i, { endMarker: e.currentTarget.value }, '修改行末标记')}
              />
            </td>
            <td>
              <input
                class="w110" placeholder="备注"
                value={row.note}
                onchange={(e) => updateRow(i, { note: e.currentTarget.value }, '修改备注')}
              />
            </td>
            <td class="ops">
              <button title="上移" onclick={() => moveRow(i, -1)}>↑</button>
              <button title="下移" onclick={() => moveRow(i, 1)}>↓</button>
              <button title="复制此行" onclick={() => duplicateRow(i)}>⧉</button>
              <button title="删除此行" onclick={() => removeRow(i)}>✕</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="primary" onclick={() => addRow(pat.rows.length - 1)}>＋ 添加一行</button>

    <fieldset class="piece">
      <legend>织片信息（用于对称袖片 / 前后片的重复单元推算）</legend>
      <label>织片名称 <input class="w110" value={pat.piece.label} placeholder="如：左袖 / 右袖"
        onchange={(e) => store.mutatePattern('修改织片名称', (p) => (p.piece.label = e.currentTarget.value))} /></label>
      <label>总针数 <input type="number" class="w64" value={pat.piece.totalStitches}
        onchange={(e) => store.mutatePattern('修改总针数', (p) => (p.piece.totalStitches = Number(e.currentTarget.value)))} /></label>
      <label>重复单元针数 <input type="number" class="w64" value={pat.piece.repeatMultiple}
        onchange={(e) => store.mutatePattern('修改重复单元', (p) => (p.piece.repeatMultiple = Number(e.currentTarget.value)))} /></label>
      <label><input type="checkbox" checked={pat.piece.symmetric}
        onchange={(e) => store.mutatePattern('修改对称设置', (p) => (p.piece.symmetric = e.currentTarget.checked))} /> 有对称的另一片</label>
    </fieldset>
  </section>
{:else}
  <p>请先新建一个花样。</p>
{/if}

<style>
  .panel { background: #fff; border: 1px solid #e2d9c8; border-radius: 10px; padding: 16px; }
  .meta { display: flex; gap: 16px; align-items: end; flex-wrap: wrap; margin-bottom: 12px; }
  .meta label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  .version { color: #8a7a5c; font-size: 13px; }
  table.rows { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
  .rows th, .rows td { border: 1px solid #e8e0cf; padding: 4px 6px; font-size: 14px; vertical-align: middle; }
  .rows th { background: #f6f1e6; }
  .num { text-align: center; }
  .delta.pos { color: #1a7f37; } .delta.neg { color: #b3261e; }
  .w64 { width: 64px; } .w80 { width: 80px; } .w110 { width: 110px; }
  .actions { max-width: 260px; }
  .chip { border: 1px solid #cbbf9f; background: #fbf8f0; border-radius: 999px; padding: 2px 8px; margin: 1px; font-size: 12px; cursor: pointer; }
  .chip.on { background: #7a5c2e; color: #fff; border-color: #7a5c2e; }
  .ops button { margin: 0 1px; }
  .piece { margin-top: 16px; border: 1px dashed #cbbf9f; border-radius: 8px; display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
  .piece label { font-size: 14px; display: flex; gap: 6px; align-items: center; }
  button.primary { background: #7a5c2e; color: #fff; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
</style>
