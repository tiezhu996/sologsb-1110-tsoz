import type { WoodBoard } from '../types/wood-board';
import type { SoundChamber } from '../types/sound-chamber';
import type { LacquerLayer } from '../types/lacquer-layer';
import type { Stringing } from '../types/stringing';
import type { ArchiveSnapshot, ArchiveStatus, QinArchive } from '../types/archive';
import { STAGE_LABELS } from '../types/ui';
import { cumulativeThickness, sortLayers } from './layer';
import { toPlain } from './plain';

/** 灰胎完工目标累计厚度（mm）：进度判定与成琴归档共用同一道门槛 */
export const STAGE_TARGET_MM = 1.0;

export interface SnapshotBuild {
  /** 四道工序齐备时为可冻结的快照，否则为 null */
  snapshot: ArchiveSnapshot | null;
  /** 当前累计灰胎厚度（mm） */
  cumulativeMm: number;
  /** 缺失工序标签（空数组 = 齐备，可归档） */
  missing: string[];
}

/**
 * 用四表当前记录拼出某琴的工序快照并校验齐备：
 * 选材=面板+底板配对，掏膛=有槽腹记录，灰胎=累计厚度达标，上弦=有上弦记录。
 * 归档落库时必须把返回的快照冻结进验收档；若改成验收时实时拼四表，
 * 旧验收就会跟着之后的工序修改变，失去存档意义。
 */
export function buildSnapshot(
  guqinNo: string,
  boards: WoodBoard[],
  chambers: SoundChamber[],
  layers: LacquerLayer[],
  stringings: Stringing[],
): SnapshotBuild {
  const pair = boards
    .filter((board) => board.guqinNo === guqinNo)
    .sort((a, b) => (a.part === b.part ? a.boardNo.localeCompare(b.boardNo) : a.part === '面板' ? -1 : 1));
  const panel = pair.find((board) => board.part === '面板');
  const base = pair.find((board) => board.part === '底板');
  const chamber = chambers.find((item) => item.guqinNo === guqinNo);
  const ownLayers = sortLayers(layers.filter((layer) => layer.guqinNo === guqinNo));
  const total = cumulativeThickness(ownLayers);
  const stringing = stringings.find((item) => item.guqinNo === guqinNo);

  const missing: string[] = [];
  if (!panel || !base) missing.push(STAGE_LABELS.select);
  if (!chamber) missing.push(STAGE_LABELS.carve);
  if (total < STAGE_TARGET_MM) missing.push(STAGE_LABELS.lacquer);
  if (!stringing) missing.push(STAGE_LABELS.string);

  return {
    snapshot: missing.length === 0 ? { boards: pair, chamber: chamber!, layers: ownLayers, stringing: stringing! } : null,
    cumulativeMm: Number(total.toFixed(2)),
    missing,
  };
}

/** 稳定序列化：对象键排序、跳过 undefined，保证同一内容得到同一字符串 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? '';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const body = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',');
  return `{${body}}`;
}

/**
 * 快照指纹（FNV-1a，32 位）：归档时随验收档存下；
 * 之后用四表当前记录重算比对，不一致即说明工序被改动过。
 */
export function fingerprintOf(snapshot: ArchiveSnapshot): string {
  const text = stableStringify(toPlain(snapshot));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 验收档状态：四表当前指纹与存档指纹一致为「有效」，否则「已变更」 */
export function archiveStatus(archive: QinArchive, current: ArchiveSnapshot | null): ArchiveStatus {
  if (!current) return '已变更';
  return fingerprintOf(current) === archive.fingerprint ? '有效' : '已变更';
}
