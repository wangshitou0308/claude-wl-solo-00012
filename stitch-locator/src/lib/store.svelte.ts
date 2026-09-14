import { db } from './db';
import { computeCandidates, discriminatingQuestions } from './engine';
import type { ConfirmedSpot, Observation, Pattern, PatternRow, Session } from './types';
import { emptyObservation, newPattern } from './types';

interface UndoEntry {
  label: string;
  undo: () => void;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

class Store {
  patterns = $state<Pattern[]>([]);
  activePatternId = $state<string | null>(null);
  observation = $state<Observation>(emptyObservation());
  confirmed = $state<ConfirmedSpot | null>(null);
  /** 花样已改动，未确认的旧定位已失效 */
  sessionInvalid = $state(false);
  loaded = $state(false);
  undoStack = $state<UndoEntry[]>([]);

  activePattern = $derived(this.patterns.find((p) => p.id === this.activePatternId) ?? null);

  result = $derived(this.activePattern ? computeCandidates(this.activePattern, this.observation) : null);
  compatible = $derived(this.result?.compatible ?? []);
  questions = $derived(
    this.activePattern && !this.sessionInvalid
      ? discriminatingQuestions(this.activePattern, this.observation, this.compatible)
      : [],
  );
  /** 确认快照对应的花样版本已过时 */
  confirmedStale = $derived(
    this.confirmed != null && this.activePattern != null && this.confirmed.patternVersion !== this.activePattern.version,
  );

  async load() {
    this.patterns = await db.allPatterns();
    const session = await db.getSession();
    if (this.patterns.length === 0) {
      const seed = samplePattern();
      this.patterns = [seed];
      await db.putPattern(seed);
    }
    if (session) {
      const pat = this.patterns.find((p) => p.id === session.patternId);
      if (pat) {
        this.activePatternId = pat.id;
        this.observation = session.observation;
        this.confirmed = session.confirmed;
        // 花样版本已变：未确认的旧定位立即失效
        this.sessionInvalid = pat.version !== session.patternVersion;
      }
    }
    if (!this.activePatternId && this.patterns.length > 0) this.activePatternId = this.patterns[0].id;
    this.loaded = true;
  }

  // ---------- 持久化 ----------

  private async persistPattern() {
    if (this.activePattern) await db.putPattern(clone(this.activePattern));
  }

  private async persistSession() {
    if (!this.activePatternId) return;
    const s: Session = {
      patternId: this.activePatternId,
      patternVersion: this.activePattern?.version ?? 0,
      observation: clone(this.observation),
      confirmed: this.confirmed ? clone(this.confirmed) : null,
    };
    await db.putSession(s);
  }

  // ---------- 撤销 ----------

  private pushUndo(label: string, undo: () => void) {
    this.undoStack.push({ label, undo });
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  undo() {
    const entry = this.undoStack.pop();
    if (entry) entry.undo();
  }

  // ---------- 花样编辑（任何改动：版本 +1，旧定位失效） ----------

  private touchPattern() {
    if (!this.activePattern) return;
    this.activePattern.version += 1;
    this.activePattern.updatedAt = Date.now();
    this.sessionInvalid = true; // 未确认的旧定位立即失效
  }

  async mutatePattern(label: string, fn: (p: Pattern) => void) {
    const pat = this.activePattern;
    if (!pat) return;
    const before = clone(pat);
    fn(pat);
    this.touchPattern();
    await this.persistPattern();
    await this.persistSession();
    this.pushUndo(label, () => {
      const idx = this.patterns.findIndex((p) => p.id === before.id);
      if (idx >= 0) {
        this.patterns[idx] = clone(before);
        this.sessionInvalid = true;
        void this.persistPattern();
        void this.persistSession();
      }
    });
  }

  async addPattern() {
    const p = newPattern(`新花样 ${this.patterns.length + 1}`);
    p.rows = [];
    this.patterns.push(p);
    this.activePatternId = p.id;
    this.observation = emptyObservation();
    this.confirmed = null;
    this.sessionInvalid = false;
    await db.putPattern(clone(p));
    await this.persistSession();
    this.pushUndo(`新建花样「${p.name}」`, () => {
      this.patterns = this.patterns.filter((x) => x.id !== p.id);
      void db.deletePattern(p.id);
      if (this.activePatternId === p.id) this.activePatternId = this.patterns[0]?.id ?? null;
    });
  }

  async deletePattern(id: string) {
    const idx = this.patterns.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [removed] = this.patterns.splice(idx, 1);
    await db.deletePattern(id);
    if (this.activePatternId === id) {
      this.activePatternId = this.patterns[0]?.id ?? null;
      this.observation = emptyObservation();
      this.confirmed = null;
      this.sessionInvalid = false;
      await this.persistSession();
    }
    this.pushUndo(`删除花样「${removed.name}」`, () => {
      this.patterns.splice(Math.min(idx, this.patterns.length), 0, removed);
      void db.putPattern(clone(removed));
    });
  }

  async selectPattern(id: string) {
    if (id === this.activePatternId) return;
    this.activePatternId = id;
    this.observation = emptyObservation();
    this.confirmed = null;
    this.sessionInvalid = false;
    await this.persistSession();
  }

  // ---------- 观察录入（可撤销） ----------

  setObservation(patch: Partial<Observation>, label = '修改现场观察') {
    const before = clone(this.observation);
    Object.assign(this.observation, patch);
    this.sessionInvalid = false; // 重新录入观察，开始新一轮定位
    void this.persistSession();
    this.pushUndo(label, () => {
      this.observation = before;
      void this.persistSession();
    });
  }

  // ---------- 确认续针点：冻结观察与花样版本 ----------

  async confirm(afterRow: number) {
    if (!this.activePattern) return;
    this.confirmed = {
      afterRow,
      patternVersion: this.activePattern.version,
      observation: clone(this.observation),
      confirmedAt: Date.now(),
    };
    await this.persistSession();
    this.pushUndo(`确认续针点（循环第 ${afterRow} 行）`, () => {
      this.confirmed = null;
      void this.persistSession();
    });
  }

  async unconfirm() {
    const before = this.confirmed;
    this.confirmed = null;
    await this.persistSession();
    if (before) {
      this.pushUndo('取消确认续针点', () => {
        this.confirmed = before;
        void this.persistSession();
      });
    }
  }
}

function samplePattern(): Pattern {
  const p = newPattern('示例：扭花罗纹围巾（8 行循环）');
  const rows: Array<[string, number, string, string[], string]> = [
    ['RS', 42, '米白', ['cable'], '挂绿色记号圈'],
    ['WS', 42, '米白', [], ''],
    ['RS', 42, '米白', [], ''],
    ['WS', 42, '米白', [], ''],
    ['RS', 42, '驼色', ['colorChange', 'lace'], '挂红色记号圈'],
    ['WS', 42, '驼色', [], ''],
    ['RS', 42, '驼色', ['cable'], ''],
    ['WS', 42, '驼色', [], '翻面'],
  ];
  p.rows = rows.map(([side, count, color, actions, marker], i) => ({
    id: crypto.randomUUID(),
    side: side as 'RS' | 'WS',
    stitchCount: count,
    color,
    actions: actions as PatternRow['actions'],
    endMarker: marker,
    note: i === 0 ? '第 1 行：6 针扭花置前' : '',
  }));
  p.piece = { label: '左袖 / 右袖', totalStitches: 42, repeatMultiple: 6, symmetric: true };
  return p;
}

export const store = new Store();
