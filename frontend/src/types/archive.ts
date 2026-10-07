import type { WoodBoard } from './wood-board';
import type { SoundChamber } from './sound-chamber';
import type { LacquerLayer } from './lacquer-layer';
import type { Stringing } from './stringing';

/**
 * 归档时冻结的四类工序记录快照。
 * 验收档以当次快照为准，不用四表实时拼接——否则旧验收会跟着之后的工序修改变。
 */
export interface ArchiveSnapshot {
  /** 面板 + 底板配对（归档时点的记录） */
  boards: WoodBoard[];
  /** 槽腹尺寸记录 */
  chamber: SoundChamber;
  /** 灰胎髹漆遍次（按遍次升序） */
  layers: LacquerLayer[];
  /** 上弦与音色文字评价 */
  stringing: Stringing;
}

/** 验收档状态：有效 / 已变更（归档后任一工序记录又被改动） */
export type ArchiveStatus = '有效' | '已变更';

/** 成琴验收档：四道工序齐备时把当次记录存成快照；重新归档生成新版本，旧档保留 */
export interface QinArchive {
  id: string;
  /** 琴号 */
  guqinNo: string;
  /** 版本号：同一琴号从 1 开始，重新归档 +1 */
  version: number;
  /** 成琴日期 ISO */
  completedAt: string;
  /** 验琴人 */
  inspector: string;
  /** 归档时间 ISO */
  archivedAt: string;
  /** 归档时累计灰胎厚度（mm） */
  cumulativeMm: number;
  /** 快照指纹：与四表当前指纹不一致即「已变更」 */
  fingerprint: string;
  /** 当次快照（验收依据） */
  snapshot: ArchiveSnapshot;
}
