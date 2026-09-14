<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from './lib/store.svelte';
  import PatternEditor from './components/PatternEditor.svelte';
  import LocatePanel from './components/LocatePanel.svelte';
  import RecoverPanel from './components/RecoverPanel.svelte';
  import PrintCard from './components/PrintCard.svelte';

  type Tab = 'pattern' | 'locate' | 'recover' | 'card';
  let tab = $state<Tab>('pattern');

  onMount(() => store.load());

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pattern', label: '① 花样循环' },
    { id: 'locate', label: '② 续针定位' },
    { id: 'recover', label: '③ 断点恢复' },
    { id: 'card', label: '④ 打印卡' },
  ];
</script>

<header class="no-print">
  <h1>🧶 花样续针定位</h1>
  <div class="topbar">
    <select value={store.activePatternId ?? ''} onchange={(e) => store.selectPattern(e.currentTarget.value)}>
      {#each store.patterns as p (p.id)}
        <option value={p.id}>{p.name}（v{p.version}）</option>
      {/each}
    </select>
    <button onclick={() => store.addPattern()}>＋ 新建花样</button>
    {#if store.activePattern}
      <button class="danger" onclick={() => confirm(`确定删除花样「${store.activePattern!.name}」？`) && store.deletePattern(store.activePattern!.id)}>删除</button>
    {/if}
    <button disabled={store.undoStack.length === 0} onclick={() => store.undo()}>
      ↩ 撤销{store.undoStack.length ? `（${store.undoStack[store.undoStack.length - 1].label}）` : ''}
    </button>
  </div>
  <nav>
    {#each tabs as t}
      <button class:active={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </nav>
</header>

<main>
  {#if !store.loaded}
    <p>正在从本机 IndexedDB 读取花样与现场状态…</p>
  {:else if tab === 'pattern'}
    <PatternEditor />
  {:else if tab === 'locate'}
    <LocatePanel />
  {:else if tab === 'recover'}
    <RecoverPanel />
  {:else}
    <PrintCard />
  {/if}
</main>

<style>
  header { max-width: 1080px; margin: 0 auto; padding: 16px 16px 0; }
  h1 { font-size: 22px; margin: 0 0 10px; color: #5c4f38; }
  .topbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .topbar select { min-width: 260px; }
  nav { display: flex; gap: 4px; border-bottom: 2px solid #7a5c2e; }
  nav button { border: none; background: #efe8d8; padding: 10px 18px; border-radius: 8px 8px 0 0; cursor: pointer; font-size: 15px; }
  nav button.active { background: #7a5c2e; color: #fff; }
  main { max-width: 1080px; margin: 0 auto; padding: 16px; }
  button.danger { color: #b3261e; }
</style>
