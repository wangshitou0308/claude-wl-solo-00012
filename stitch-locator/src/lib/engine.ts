import type {
  Candidate,
  FeatureKind,
  Observation,
  Pattern,
  PatternRow,
} from './types';
import { FEATURE_LABELS } from './types';

/** 循环内 1 基行号 -> 行对象 */
export function rowAt(pattern: Pattern, oneBased: number): PatternRow {
  const n = pattern.rows.length;
  return pattern.rows[(((oneBased - 1) % n) + n) % n];
}

/** 某行是否包含指定特征（换色由相邻行线色推得，行末标记由文本推得） */
export function rowHasFeature(pattern: Pattern, oneBased: number, kind: FeatureKind): boolean {
  const n = pattern.rows.length;
  const row = rowAt(pattern, oneBased);
  if (kind === 'colorChange') {
    const prev = rowAt(pattern, oneBased - 1);
    return row.color !== '' && prev.color !== '' && row.color !== prev.color;
  }
  if (kind === 'marker') return row.endMarker.trim() !== '';
  if (kind === 'increase' || kind === 'decrease') {
    const prev = rowAt(pattern, oneBased - 1);
    const d = row.stitchCount - prev.stitchCount;
    return kind === 'increase' ? d > 0 : d < 0;
  }
  return row.actions.includes(kind);
}

/** 特征是否出现在「刚完成第 k 行」之前的 within 行内（含第 k 行） */
function featureInWindow(pattern: Pattern, k: number, within: number, kind: FeatureKind): boolean {
  for (let i = 0; i < within; i++) {
    if (rowHasFeature(pattern, k - i, kind)) return true;
  }
  return false;
}

export interface CandidateResult {
  candidates: Candidate[];
  /** 通过全部硬条件的候选 */
  compatible: Candidate[];
}

/**
 * 计算全部候选行位：保留所有相容解，不凭单一特征猜测。
 * 硬条件：针上针数、织物朝向、当前线色；把握程度为「有把握」时，可辨特征也作为硬条件。
 * 其余特征只做吻合度打分。
 */
export function computeCandidates(pattern: Pattern, obs: Observation): CandidateResult {
  const n = pattern.rows.length;
  const candidates: Candidate[] = [];
  if (n === 0) return { candidates, compatible: [] };

  for (let k = 1; k <= n; k++) {
    const finished = rowAt(pattern, k);      // 刚完成的行
    const next = rowAt(pattern, k + 1);      // 即将织的行
    const hardFails: string[] = [];
    const softMatched: string[] = [];
    const softMissed: string[] = [];

    if (obs.stitchesOnNeedle != null && finished.stitchCount !== obs.stitchesOnNeedle) {
      hardFails.push(`针数不符：该行结束后应为 ${finished.stitchCount} 针，您数到 ${obs.stitchesOnNeedle} 针`);
    }
    if (obs.fabricSide !== 'unknown' && next.side !== obs.fabricSide) {
      hardFails.push(`朝向不符：若停在此处，下一行是${next.side === 'RS' ? '正' : '反'}面行`);
    }
    if (obs.currentColor.trim() !== '' && next.color.trim() !== '' && next.color !== obs.currentColor.trim()) {
      hardFails.push(`线色不符：下一行应用「${next.color}」`);
    }

    for (const f of obs.features) {
      const found = featureInWindow(pattern, k, f.withinRows, f.kind);
      const hit = f.present ? found : !found;
      const desc = `最近 ${f.withinRows} 行${f.present ? '有' : '没有'}${FEATURE_LABELS[f.kind]}`;
      if (obs.confidence === 'sure') {
        if (!hit) hardFails.push(`特征不符：您记得${desc}`);
      } else if (hit) {
        softMatched.push(desc);
      } else {
        softMissed.push(desc);
      }
    }

    candidates.push({ afterRow: k, hardOk: hardFails.length === 0, hardFails, softMatched, softMissed });
  }

  const compatible = candidates.filter((c) => c.hardOk);
  compatible.sort((a, b) => b.softMatched.length - a.softMatched.length || a.afterRow - b.afterRow);
  return { candidates, compatible };
}

export interface QuestionAnswer {
  label: string;
  remaining: number[]; // 该答案下剩余的行位
}

export interface Question {
  id: string;
  text: string;
  answers: QuestionAnswer[];
  /** 信息增益（比特），越大越能区分候选 */
  gain: number;
}

/** 信息增益：回答前候选均匀分布，回答后收敛到某一分支 */
function splitGain(total: number, branches: number[][]): number {
  return (
    Math.log2(total) -
    branches.reduce((s, b) => (b.length ? s + (b.length / total) * Math.log2(b.length) : s), 0)
  );
}

/** 为当前候选集推荐最能区分候选的观察项，并列出每个答案对应的剩余行位 */
export function discriminatingQuestions(
  pattern: Pattern,
  obs: Observation,
  compatible: Candidate[],
): Question[] {
  const n = compatible.length;
  if (n < 2) return [];
  const ks = compatible.map((c) => c.afterRow);
  const questions: Question[] = [];

  const addBinary = (id: string, text: string, pred: (k: number) => boolean, yesLabel: string, noLabel: string) => {
    const yes = ks.filter((k) => pred(k));
    const no = ks.filter((k) => !pred(k));
    if (yes.length === 0 || no.length === 0) return;
    questions.push({
      id,
      text,
      answers: [
        { label: yesLabel, remaining: yes },
        { label: noLabel, remaining: no },
      ],
      gain: splitGain(n, [yes, no]),
    });
  };

  // 1) 最近两行内的可辨特征（尚未录入的）
  const asked = new Set(obs.features.map((f) => f.kind));
  (Object.keys(FEATURE_LABELS) as FeatureKind[]).forEach((kind) => {
    if (asked.has(kind)) return;
    addBinary(
      `feat-${kind}`,
      `最近两行内，您记得织过「${FEATURE_LABELS[kind]}」吗？`,
      (k) => featureInWindow(pattern, k, 2, kind),
      '有',
      '没有',
    );
  });

  // 2) 织物朝向（尚未录入时）
  if (obs.fabricSide === 'unknown') {
    addBinary(
      'side',
      '拿起织物，朝向您的是正面吗？',
      (k) => rowAt(pattern, k + 1).side === 'RS',
      '是正面',
      '是反面',
    );
  }

  // 3) 当前线色（尚未录入时，按花样中出现的颜色逐一提问）
  if (obs.currentColor.trim() === '') {
    const colors = [...new Set(pattern.rows.map((r) => r.color).filter((c) => c.trim() !== ''))];
    for (const color of colors) {
      addBinary(
        `color-${color}`,
        `手中正在用的线，是「${color}」吗？`,
        (k) => rowAt(pattern, k + 1).color === color,
        '是',
        '不是',
      );
    }
  }

  // 4) 针上针数（尚未录入时，按候选涉及的不同针数提问）
  if (obs.stitchesOnNeedle == null) {
    const counts = [...new Set(ks.map((k) => rowAt(pattern, k).stitchCount))];
    for (const count of counts) {
      addBinary(
        `count-${count}`,
        `针上的针数是 ${count} 针吗？`,
        (k) => rowAt(pattern, k).stitchCount === count,
        '是',
        '不是',
      );
    }
  }

  questions.sort((a, b) => b.gain - a.gain);
  return questions.slice(0, 3);
}

/** 即将织的 6 行（打印卡用） */
export function nextRows(pattern: Pattern, afterRow: number, count = 6) {
  const n = pattern.rows.length;
  const out: { cycleRow: number; wraps: boolean; row: PatternRow; delta: number }[] = [];
  for (let i = 1; i <= count; i++) {
    const pos = afterRow + i;
    const cycleRow = ((pos - 1) % n) + 1;
    const row = rowAt(pattern, cycleRow);
    const prev = rowAt(pattern, cycleRow - 1);
    out.push({ cycleRow, wraps: pos > n, row, delta: row.stitchCount - prev.stitchCount });
  }
  return out;
}

// ---------- 断点恢复：拆回 / 补针 / 继续织 ----------

export interface FrogStep {
  row: number;          // 要拆掉的循环行号
  undoText: string;     // 反向操作说明
  stitchesAfter: number; // 拆掉该行后针上针数
}

/** 路径一：从最近八行内拆回 t 行（t = 1..8） */
export function frogPaths(pattern: Pattern, afterRow: number): { t: number; steps: FrogStep[]; endRow: number; endStitches: number }[] {
  const n = pattern.rows.length;
  const max = Math.min(8, n);
  const paths = [];
  for (let t = 1; t <= max; t++) {
    const steps: FrogStep[] = [];
    for (let i = 0; i < t; i++) {
      const r = ((afterRow - i - 1) % n + n) % n + 1;
      const row = rowAt(pattern, r);
      const prev = rowAt(pattern, r - 1);
      const d = row.stitchCount - prev.stitchCount;
      const parts: string[] = [];
      if (d > 0) parts.push(`拆掉 ${d} 针加针`);
      if (d < 0) parts.push(`解开 ${-d} 针并针`);
      for (const a of row.actions) parts.push(`退回${FEATURE_LABELS[a]}`);
      steps.push({
        row: r,
        undoText: parts.length ? parts.join('，') : '平针拆回',
        stitchesAfter: prev.stitchCount,
      });
    }
    const endRow = ((afterRow - t - 1) % n + n) % n + 1;
    paths.push({ t, steps, endRow, endStitches: rowAt(pattern, endRow).stitchCount });
  }
  return paths;
}

export interface MendPlan {
  diff: number;                 // 实际 - 应有
  summary: string;
  suspectRows: { row: number; reason: string }[]; // 最近八行中最可能漏/多做的加减针行
  placement: string;            // 补/收针位置建议
}

/** 路径二：补针（漏针）或收掉多针 */
export function mendPlan(pattern: Pattern, afterRow: number, actualStitches: number): MendPlan {
  const expected = rowAt(pattern, afterRow).stitchCount;
  const diff = actualStitches - expected;
  const suspectRows: { row: number; reason: string }[] = [];
  for (let i = 0; i < Math.min(8, pattern.rows.length); i++) {
    const r = ((afterRow - i - 1) % pattern.rows.length + pattern.rows.length) % pattern.rows.length + 1;
    const row = rowAt(pattern, r);
    const prev = rowAt(pattern, r - 1);
    const d = row.stitchCount - prev.stitchCount;
    if (diff < 0 && d > 0) suspectRows.push({ row: r, reason: `此行加 ${d} 针，可能漏加` });
    if (diff > 0 && d < 0) suspectRows.push({ row: r, reason: `此行减 ${-d} 针，可能漏减` });
    if (diff < 0 && d < 0) suspectRows.push({ row: r, reason: `此行减 ${-d} 针，可能多减` });
    if (diff > 0 && d > 0) suspectRows.push({ row: r, reason: `此行加 ${d} 针，可能多加` });
  }
  const abs = Math.abs(diff);
  const every = abs > 0 ? Math.max(1, Math.floor(expected / abs)) : 0;
  const placement =
    diff === 0
      ? '针数一致，无需补针'
      : diff < 0
        ? `在下一行均匀补 ${abs} 针（约每隔 ${every} 针补 1 针），或到上方列出的加针行处挑针补上`
        : `在下一行均匀并掉 ${abs} 针（约每隔 ${every} 针并 1 针），或检查上方列出的减针行是否漏减`;
  return {
    diff,
    summary:
      diff === 0
        ? `针上 ${actualStitches} 针，与应有针数一致`
        : diff < 0
          ? `少了 ${abs} 针（应有 ${expected} 针）`
          : `多了 ${abs} 针（应有 ${expected} 针）`,
    suspectRows,
    placement,
  };
}

/** 路径三：不拆不补，继续织并在下一行调整 */
export function continuePlan(pattern: Pattern, afterRow: number, actualStitches: number) {
  const mend = mendPlan(pattern, afterRow, actualStitches);
  const next = rowAt(pattern, afterRow + 1);
  const prevOfNext = rowAt(pattern, afterRow);
  const plannedDelta = next.stitchCount - prevOfNext.stitchCount;
  const adjustedDelta = plannedDelta - mend.diff;
  return {
    nextRow: ((afterRow) % pattern.rows.length) + 1,
    plannedDelta,
    adjustedDelta,
    text:
      mend.diff === 0
        ? `按原计划织循环第 ${((afterRow) % pattern.rows.length) + 1} 行即可`
        : `织循环第 ${((afterRow) % pattern.rows.length) + 1} 行时，在原加减针基础上${adjustedDelta > plannedDelta ? '多' : '少'} ${Math.abs(mend.diff)} 针（本行净${adjustedDelta >= 0 ? '加' : '减'} ${Math.abs(adjustedDelta)} 针）`,
  };
}

/** 对称袖片 / 前后片受影响的重复单元 */
export function affectedRepeats(pattern: Pattern, afterRow: number, actualStitches: number): string {
  const { piece } = pattern;
  const expected = rowAt(pattern, afterRow).stitchCount;
  if (!piece.repeatMultiple || piece.repeatMultiple <= 0 || piece.totalStitches <= 0) {
    return '未设置织片重复单元，无法推算影响范围（可在花样页填写「织片信息」）';
  }
  const diff = actualStitches - expected;
  if (diff === 0) return '针数一致，重复单元未受影响';
  const totalUnits = Math.floor(piece.totalStitches / piece.repeatMultiple);
  const lo = Math.min(expected, actualStitches);
  const hi = Math.max(expected, actualStitches);
  const firstUnit = Math.floor((lo - 1) / piece.repeatMultiple) + 1;
  const lastUnit = Math.min(totalUnits, Math.floor((hi - 1) / piece.repeatMultiple) + 1);
  const range = firstUnit === lastUnit ? `第 ${firstUnit} 个` : `第 ${firstUnit}–${lastUnit} 个`;
  const mirror = piece.symmetric
    ? `；${piece.label ? `对称的另一片（${piece.label}）` : '对称的另一片'}相同位置的重复单元请一并检查`
    : '';
  return `差异落在${range}重复单元（共 ${totalUnits} 个单元）${mirror}`;
}
