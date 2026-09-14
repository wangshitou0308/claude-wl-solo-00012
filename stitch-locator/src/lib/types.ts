/** 正反面：RS=正面，WS=反面 */
export type Side = 'RS' | 'WS';

/** 行内关键动作 / 可辨特征种类 */
export type FeatureKind =
  | 'cable'        // 扭花
  | 'lace'         // 镂空
  | 'increase'     // 加针
  | 'decrease'     // 减针
  | 'colorChange'  // 换色
  | 'shortRow'     // 引返
  | 'marker';      // 行末标记（挂记号圈等）

export const FEATURE_LABELS: Record<FeatureKind, string> = {
  cable: '扭花',
  lace: '镂空',
  increase: '加针',
  decrease: '减针',
  colorChange: '换色',
  shortRow: '引返',
  marker: '行末标记',
};

export interface PatternRow {
  id: string;
  side: Side;
  /** 本行结束后针上针数 */
  stitchCount: number;
  color: string;
  actions: FeatureKind[];
  /** 行末标记说明，如「挂绿色记号圈」 */
  endMarker: string;
  note: string;
}

/** 织片信息：用于对称袖片 / 前后片的重复单元推算 */
export interface PieceInfo {
  label: string;            // 如「左袖 / 右袖」「前片 / 后片」
  totalStitches: number;    // 整片总针数
  repeatMultiple: number;   // 重复单元针数（0 = 不按单元推算）
  symmetric: boolean;       // 是否存在对称的另一片
}

export interface Pattern {
  id: string;
  name: string;
  craft: 'knit' | 'crochet';
  /** 每次花样改动 +1，旧定位随之失效 */
  version: number;
  updatedAt: number;
  rows: PatternRow[];       // 一个完整循环
  piece: PieceInfo;
}

/** 续织前录入的现场观察 */
export interface Observation {
  stitchesOnNeedle: number | null;
  /** 拿起织物时哪一面朝向自己；unknown = 看不清 */
  fabricSide: Side | 'unknown';
  /** 手中当前线色；空串 = 不确定 */
  currentColor: string;
  /** 最近可辨特征 */
  features: ObservedFeature[];
  /** 把握程度：sure=有把握（特征作为硬条件），其余作为打分参考 */
  confidence: 'sure' | 'likely' | 'unsure';
}

export interface ObservedFeature {
  kind: FeatureKind;
  present: boolean;     // 记得「有」还是「没有」
  withinRows: number;   // 最近几行之内（1-4）
}

export interface Candidate {
  /** 假设「刚完成循环第 afterRow 行」 */
  afterRow: number;
  hardOk: boolean;
  hardFails: string[];
  softMatched: string[];
  softMissed: string[];
}

/** 确认续针点时冻结的快照 */
export interface ConfirmedSpot {
  afterRow: number;
  patternVersion: number;
  observation: Observation;
  confirmedAt: number;
}

export interface Session {
  patternId: string;
  patternVersion: number;
  observation: Observation;
  confirmed: ConfirmedSpot | null;
}

export function emptyObservation(): Observation {
  return {
    stitchesOnNeedle: null,
    fabricSide: 'unknown',
    currentColor: '',
    features: [],
    confidence: 'likely',
  };
}

export function newRow(side: Side, stitchCount: number): PatternRow {
  return {
    id: crypto.randomUUID(),
    side,
    stitchCount,
    color: '',
    actions: [],
    endMarker: '',
    note: '',
  };
}

export function newPattern(name: string): Pattern {
  return {
    id: crypto.randomUUID(),
    name,
    craft: 'knit',
    version: 1,
    updatedAt: Date.now(),
    rows: [],
    piece: { label: '', totalStitches: 0, repeatMultiple: 0, symmetric: false },
  };
}
