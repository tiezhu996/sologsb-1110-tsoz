import type { WoodBoard } from '../types/wood-board';
import type { SoundChamber } from '../types/sound-chamber';
import type { LacquerLayer } from '../types/lacquer-layer';
import type { Stringing } from '../types/stringing';
import type { ArchiveSnapshot } from '../types/archive';
import { cumulativeThickness, STAGE_DONE_TARGET_MM } from './layer';

/** 一张琴的四类工序记录（归档校验与快照共用的收集结果） */
export interface StageRecords {
  /** 面板 + 底板（可能缺一块或都缺） */
  boards: WoodBoard[];
  chamber?: SoundChamber;
  /** 灰胎遍次，按遍次升序 */
  lacquers: LacquerLayer[];
  stringing?: Stringing;
}

/** 从四张表收集某琴的当前工序记录（排序固定，便于快照对比） */
export function collectStageRecords(input: {
  guqinNo: string;
  boards: WoodBoard[];
  chambers: SoundChamber[];
  lacquers: LacquerLayer[];
  stringings: Stringing[];
}): StageRecords {
  const boards = input.boards
    .filter((b) => b.guqinNo === input.guqinNo)
    .sort((a, b) => a.part.localeCompare(b.part, 'zh') || a.id.localeCompare(b.id));
  return {
    boards,
    chamber: input.chambers.find((c) => c.guqinNo === input.guqinNo),
    lacquers: input.lacquers.filter((l) => l.guqinNo === input.guqinNo).sort((a, b) => a.seq - b.seq),
    stringing: input.stringings.find((s) => s.guqinNo === input.guqinNo),
  };
}

/** 四道工序的缺项清单（与进度页阶段判定一致）；空数组表示齐备可归档 */
export function missingStageLabels(records: StageRecords): string[] {
  const missing: string[] = [];
  const panel = records.boards.find((b) => b.part === '面板');
  const base = records.boards.find((b) => b.part === '底板');
  if (!panel || !base) missing.push('选材（面板/底板配对）');
  if (!records.chamber) missing.push('掏膛（槽腹尺寸）');
  if (cumulativeThickness(records.lacquers) < STAGE_DONE_TARGET_MM) {
    missing.push(`灰胎（累计未达 ${STAGE_DONE_TARGET_MM}mm）`);
  }
  if (!records.stringing) missing.push('上弦（音色评价）');
  return missing;
}

/** 四道工序是否齐备（可归档） */
export function stagesComplete(records: StageRecords): boolean {
  return missingStageLabels(records).length === 0;
}

/** 递归排序对象键，得到与记录写法无关的稳定序列化结果 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

/** 稳定序列化四类记录，用于快照与当前记录的逐字对比 */
export function stableStringify(records: StageRecords | ArchiveSnapshot): string {
  return JSON.stringify(sortValue(records));
}

/**
 * 快照与当前记录是否一致。
 * 归档后任一工序（板材 / 槽腹 / 髹漆 / 上弦）被增删改，对比即失败，旧档标为「已变更」。
 */
export function sameRecords(snapshot: ArchiveSnapshot, current: StageRecords): boolean {
  return stableStringify(snapshot) === stableStringify(current);
}
