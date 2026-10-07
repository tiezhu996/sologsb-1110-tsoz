import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import { buildSnapshot, fingerprintOf } from '../utils/archive';
import { useBoardStore } from './boardStore';
import { useChamberStore } from './chamberStore';
import { useLacquerStore } from './lacquerStore';
import { useStringingStore } from './stringingStore';
import type { ArchiveSnapshot, QinArchive } from '../types/archive';

export interface ArchiveInput {
  guqinNo: string;
  /** 成琴日期 ISO */
  completedAt: string;
  /** 验琴人 */
  inspector: string;
}

interface ArchiveState {
  archives: QinArchive[];
  hydrated: boolean;
}

/** 成琴验收档：四道工序齐备时把当次记录冻结成快照；重新归档生成新版本，旧档保留 */
export const useArchiveStore = defineStore('archive', {
  state: (): ArchiveState => ({ archives: [], hydrated: false }),

  getters: {
    /** 某琴的验收档（版本倒序，最新在前） */
    ofGuqin(state) {
      return (guqinNo: string): QinArchive[] =>
        state.archives.filter((a) => a.guqinNo === guqinNo).sort((a, b) => b.version - a.version);
    },
    /** 某琴最新一份验收档 */
    latestOf(state) {
      return (guqinNo: string): QinArchive | undefined =>
        state.archives.filter((a) => a.guqinNo === guqinNo).sort((a, b) => b.version - a.version)[0];
    },
  },

  actions: {
    async hydrate() {
      this.archives = await db.archives.orderBy('archivedAt').reverse().toArray();
      this.hydrated = true;
    },

    /**
     * 归档成琴：四道工序齐备才允许（缺项抛错并列清）；
     * 把当次四类记录冻结为快照，同一琴号重复归档时版本号 +1，旧档保留。
     */
    async archive(input: ArchiveInput): Promise<QinArchive> {
      const boardStore = useBoardStore();
      const chamberStore = useChamberStore();
      const lacquerStore = useLacquerStore();
      const stringingStore = useStringingStore();
      const guqinNo = input.guqinNo.trim();

      const built = buildSnapshot(guqinNo, boardStore.boards, chamberStore.chambers, lacquerStore.layers, stringingStore.stringings);
      if (!built.snapshot) {
        throw new Error(`缺项未齐，不能归档：${built.missing.join('、')}`);
      }
      const snapshot = toPlain(built.snapshot) as ArchiveSnapshot;
      const version = this.archives.filter((a) => a.guqinNo === guqinNo).reduce((max, a) => Math.max(max, a.version), 0) + 1;
      const archive: QinArchive = {
        id: uid('archive'),
        guqinNo,
        version,
        completedAt: input.completedAt,
        inspector: input.inspector.trim(),
        archivedAt: new Date().toISOString(),
        cumulativeMm: built.cumulativeMm,
        fingerprint: fingerprintOf(snapshot),
        snapshot,
      };
      await db.archives.put(toPlain(archive));
      this.archives = [archive, ...this.archives];
      return archive;
    },
  },
});
