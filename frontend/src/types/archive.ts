import type { WoodBoard } from './wood-board';
import type { SoundChamber } from './sound-chamber';
import type { LacquerLayer } from './lacquer-layer';
import type { Stringing } from './stringing';

/**
 * 归档快照：归档当时四类工序记录（板材配对 / 槽腹 / 灰胎遍次 / 上弦）的深拷贝。
 * 验收档必须存快照、不做四表实时拼——否则旧验收会跟着之后的工序修改变化。
 */
export interface ArchiveSnapshot {
  /** 面板 + 底板 */
  boards: WoodBoard[];
  /** 槽腹尺寸记录 */
  chamber: SoundChamber;
  /** 灰胎髹漆全部遍次 */
  lacquers: LacquerLayer[];
  /** 上弦与音色评价 */
  stringing: Stringing;
}

/** 成琴归档（交琴验收档），同一琴号可多次归档形成版本序列 */
export interface QinArchive {
  id: string;
  /** 琴号 */
  guqinNo: string;
  /** 归档版本号，同一琴号从 1 开始递增 */
  version: number;
  /** 成琴日期 ISO */
  finishedAt: string;
  /** 验琴人 */
  inspector: string;
  /** 归档时间 ISO */
  archivedAt: string;
  /** 当时的四类记录快照 */
  snapshot: ArchiveSnapshot;
}

/**
 * 归档状态（派生值，不落库）：
 * active 有效——快照与当前四表记录一致；stale 已变更——归档后任一工序记录被改动。
 * 状态由快照对比实时推导，因此重开页面、导入备份后依然正确。
 */
export type ArchiveStatus = 'active' | 'stale';

export const ARCHIVE_STATUS_LABELS: Record<ArchiveStatus, string> = {
  active: '有效',
  stale: '已变更',
};
