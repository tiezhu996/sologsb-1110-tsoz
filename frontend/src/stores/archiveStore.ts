import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import { collectStageRecords, missingStageLabels, sameRecords, type StageRecords } from '../utils/archive';
import { useBoardStore } from './boardStore';
import { useChamberStore } from './chamberStore';
import { useLacquerStore } from './lacquerStore';
import { useStringingStore } from './stringingStore';
import type { ArchiveStatus, QinArchive } from '../types/archive';

export interface ArchiveInput {
  guqinNo: string;
  /** 成琴日期 ISO */
  finishedAt: string;
  /** 验琴人 */
  inspector: string;
}

/** 带派生状态的归档行（列表展示用） */
export interface ArchiveRow {
  archive: QinArchive;
  status: ArchiveStatus;
  /** 是否该琴的最新一版归档 */
  isLatest: boolean;
}

interface ArchiveState {
  archives: QinArchive[];
  hydrated: boolean;
}

/** 收集某琴当前四表工序记录（归档快照与变更对比共用） */
function collectCurrent(guqinNo: string): StageRecords {
  return collectStageRecords({
    guqinNo,
    boards: useBoardStore().boards,
    chambers: useChamberStore().chambers,
    lacquers: useLacquerStore().layers,
    stringings: useStringingStore().stringings,
  });
}

/**
 * 成琴归档（交琴验收档）。
 * 归档只写快照、不存四表引用：之后板材 / 槽腹 / 髹漆 / 上弦任一修改，
 * 旧档内容不变，仅状态被派生为「已变更」，重新归档生成新版本。
 */
export const useArchiveStore = defineStore('archive', {
  state: (): ArchiveState => ({ archives: [], hydrated: false }),

  getters: {
    /** 某琴的归档版本（新版在前） */
    versionsOf(state) {
      return (guqinNo: string): QinArchive[] =>
        state.archives.filter((a) => a.guqinNo === guqinNo).sort((a, b) => b.version - a.version);
    },
    /** 某琴的最新一版归档 */
    latestOf() {
      return (guqinNo: string): QinArchive | undefined => this.versionsOf(guqinNo)[0];
    },
    /** 下一归档版本号 */
    nextVersionOf(state) {
      return (guqinNo: string): number => state.archives.filter((a) => a.guqinNo === guqinNo).reduce((max, a) => Math.max(max, a.version), 0) + 1;
    },
    /**
     * 归档状态（派生）：快照与当前四表记录一致为「有效」，否则「已变更」。
     * 不落库，重开页面 / 导入备份后由快照对比重新推导。
     */
    statusOf() {
      return (archive: QinArchive): ArchiveStatus => (sameRecords(archive.snapshot, collectCurrent(archive.guqinNo)) ? 'active' : 'stale');
    },
    /** 全部归档行（含派生状态），按归档时间倒序 */
    rows(): ArchiveRow[] {
      return [...this.archives]
        .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
        .map((archive) => ({
          archive,
          status: this.statusOf(archive),
          isLatest: this.latestOf(archive.guqinNo)?.id === archive.id,
        }));
    },
    /** 已归档琴数（按琴号去重） */
    archivedCount(state): number {
      return new Set(state.archives.map((a) => a.guqinNo)).size;
    },
  },

  actions: {
    async hydrate() {
      this.archives = await db.archives.orderBy('archivedAt').reverse().toArray();
      this.hydrated = true;
    },

    /** 某琴当前缺项（供归档对话框列清并挡住） */
    missingOf(guqinNo: string): string[] {
      return missingStageLabels(collectCurrent(guqinNo));
    },

    /**
     * 成琴归档：四道工序齐备才允许，把当时四类记录连同成琴日期、验琴人存成快照。
     * 缺项时抛错挡住；重复归档生成递增版本，旧档保留。
     */
    async archive(input: ArchiveInput): Promise<QinArchive> {
      const guqinNo = input.guqinNo.trim();
      const inspector = input.inspector.trim();
      if (!inspector) throw new Error('请填写验琴人');
      const records = collectCurrent(guqinNo);
      const missing = missingStageLabels(records);
      if (missing.length) {
        throw new Error(`缺项未齐，不能归档：${missing.join('、')}`);
      }
      const archive: QinArchive = {
        id: uid('archive'),
        guqinNo,
        version: this.nextVersionOf(guqinNo),
        finishedAt: input.finishedAt,
        inspector,
        archivedAt: new Date().toISOString(),
        // 快照：深拷贝当时记录，与四表脱离关系
        snapshot: toPlain(records) as QinArchive['snapshot'],
      };
      await db.archives.put(toPlain(archive));
      this.archives = [archive, ...this.archives];
      return archive;
    },
  },
});
