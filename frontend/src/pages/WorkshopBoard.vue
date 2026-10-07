<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatBadge from '../components/common/StatBadge.vue';
import ProcessTimeline from '../components/common/ProcessTimeline.vue';
import FilterBar from '../components/common/FilterBar.vue';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import ArchiveDialog from '../components/archive/ArchiveDialog.vue';
import ArchiveSnapshotDialog from '../components/archive/ArchiveSnapshotDialog.vue';
import { useStageProgress, STAGE_LABELS, type StageKey } from '../hooks/useStageProgress';
import { useBoardStore } from '../stores/boardStore';
import { useChamberStore } from '../stores/chamberStore';
import { useLacquerStore } from '../stores/lacquerStore';
import { useStringingStore } from '../stores/stringingStore';
import { useArchiveStore } from '../stores/archiveStore';
import { formatDate, todayStr } from '../utils/layer';
import { downloadCsv } from '../utils/export';
import { WOOD_SPECIES } from '../types/wood-board';
import { ARCHIVE_STATUS_LABELS, type ArchiveStatus, type QinArchive } from '../types/archive';
import type { TimelineEvent } from '../types/ui';

const route = useRoute();
const boardStore = useBoardStore();
const chamberStore = useChamberStore();
const lacquerStore = useLacquerStore();
const stringingStore = useStringingStore();
const archiveStore = useArchiveStore();
const { progressList, summary } = useStageProgress();

const stageParam = computed(() => (typeof route.query.stage === 'string' ? route.query.stage : ''));
const speciesParam = computed(() => (typeof route.query.species === 'string' ? route.query.species : ''));

const visible = computed(() =>
  progressList.value.filter((item) => {
    if (speciesParam.value && item.species !== speciesParam.value) return false;
    if (stageParam.value) {
      const stage = item.stages.find((s) => s.label === stageParam.value);
      if (!stage || !stage.done) return false;
    }
    return true;
  }),
);

const stageBadges = computed(() =>
  (Object.keys(STAGE_LABELS) as StageKey[]).map((key) => ({
    key,
    label: STAGE_LABELS[key],
    count: summary.value.counts[key],
  })),
);

const pendingString = computed(() => progressList.value.filter((item) => !item.stages.find((s) => s.key === 'string')?.done).length);

/** 琴号 → 最新归档徽标（版本 + 派生状态），供明细表逐行展示 */
const archiveBadges = computed(() => {
  const map = new Map<string, { version: number; status: ArchiveStatus }>();
  archiveStore.rows.forEach((row) => {
    if (row.isLatest) map.set(row.archive.guqinNo, { version: row.archive.version, status: row.status });
  });
  return map;
});

const archiveDialogVisible = ref(false);
const snapshotDialogVisible = ref(false);
const activeGuqinNo = ref('');
const activeArchive = ref<QinArchive | null>(null);

function openArchive(guqinNo: string) {
  activeGuqinNo.value = guqinNo;
  archiveDialogVisible.value = true;
}

function openSnapshot(archive: QinArchive) {
  activeArchive.value = archive;
  snapshotDialogVisible.value = true;
}

function snapshotSummary(archive: QinArchive): string {
  const panel = archive.snapshot.boards.find((b) => b.part === '面板');
  const base = archive.snapshot.boards.find((b) => b.part === '底板');
  const mm = archive.snapshot.lacquers.reduce((sum, l) => sum + (Number(l.layerThickness) || 0), 0).toFixed(2);
  return `${panel?.boardNo ?? '—'}+${base?.boardNo ?? '—'} · 槽腹${archive.snapshot.chamber.chamberDepth}mm · 灰胎${archive.snapshot.lacquers.length}遍/${mm}mm · ${archive.snapshot.stringing.stringType}`;
}

function statusLabel(status: ArchiveStatus): string {
  return ARCHIVE_STATUS_LABELS[status];
}

/** 导出归档 CSV：交琴验收台账，含派生状态 */
function exportArchives() {
  const rows = archiveStore.rows.map((row) => ({
    guqinNo: row.archive.guqinNo,
    version: `v${row.archive.version}`,
    finishedAt: formatDate(row.archive.finishedAt),
    inspector: row.archive.inspector,
    archivedAt: formatDate(row.archive.archivedAt),
    status: ARCHIVE_STATUS_LABELS[row.status],
    panel: row.archive.snapshot.boards.find((b) => b.part === '面板')?.boardNo ?? '',
    base: row.archive.snapshot.boards.find((b) => b.part === '底板')?.boardNo ?? '',
    stringType: row.archive.snapshot.stringing.stringType,
    lacquerMm: row.archive.snapshot.lacquers.reduce((sum, l) => sum + (Number(l.layerThickness) || 0), 0).toFixed(2),
  }));
  downloadCsv(`gbguqin-archives-${todayStr()}.csv`, rows, [
    { key: 'guqinNo', title: '琴号' },
    { key: 'version', title: '归档版本' },
    { key: 'finishedAt', title: '成琴日期' },
    { key: 'inspector', title: '验琴人' },
    { key: 'archivedAt', title: '归档时间' },
    { key: 'status', title: '状态' },
    { key: 'panel', title: '面板板号' },
    { key: 'base', title: '底板板号' },
    { key: 'stringType', title: '弦材质' },
    { key: 'lacquerMm', title: '灰胎累计(mm)' },
  ]);
  ElMessage.success(`已导出 ${rows.length} 份成琴归档（含有效/已变更状态）`);
}

const events = computed<TimelineEvent[]>(() => {
  const list: TimelineEvent[] = [];
  chamberStore.chambers.forEach((chamber) => {
    list.push({
      label: `掏膛完成 · ${chamber.guqinNo}`,
      at: formatDate(chamber.carvedAt),
      text: `槽腹深度 ${chamber.chamberDepth}mm，纳音 ${chamber.nayinThickness}mm，天地柱 ${chamber.postPos}，掏膛人 ${chamber.carver}`,
      type: 'primary',
    });
  });
  lacquerStore.layers.forEach((layer) => {
    list.push({
      label: `髹漆第 ${layer.seq} 遍 · ${layer.guqinNo}`,
      at: formatDate(layer.appliedAt),
      text: `配比 ${layer.mixRatio}，本遍 ${layer.layerThickness}mm，累计 ${layer.totalThickness}mm，荫房 ${layer.curingTemp}℃ / ${layer.curingHumidity}%，${layer.polishGrit} 目`,
      type: 'warning',
    });
  });
  stringingStore.stringings.forEach((stringing) => {
    list.push({
      label: `上弦 · ${stringing.guqinNo}`,
      at: formatDate(stringing.strungAt),
      text: `${stringing.stringType}，弦距 ${stringing.stringGap}mm，缺陷 ${stringing.defects.join('/')}，九德：${stringing.nineVirtues}`,
      type: 'success',
    });
  });
  return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
});
</script>

<template>
  <div>
    <h2 class="page-title">琴坯进度</h2>
    <p class="page-desc">
      按选材 / 掏膛 / 灰胎 / 上弦四阶段统计在制琴坯；音色只用文字评语记录，不做音频文件与波形处理。四道齐备后可「成琴归档」：
      把当时四类记录连同成琴日期、验琴人存成快照验收档，缺项会列清并挡住。数据保存在浏览器 IndexedDB（gbguqin-db）。
    </p>

    <el-row :gutter="12" class="stat-row">
      <el-col :xs="12" :md="6">
        <StatBadge label="在制琴坯" :value="progressList.length" unit="张" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="四阶段完成" :value="summary.completed" unit="张" status="success" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="平均推进比" :value="summary.averageRatio" unit="%" status="warning" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="待上弦" :value="pendingString" unit="张" :status="pendingString ? 'danger' : 'success'" />
      </el-col>
    </el-row>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>阶段统计（已完成琴坯数）</span>
          <span class="card-note">板材 {{ boardStore.boards.length }} 块（可用 {{ boardStore.usableCount }} 块）· 髹漆 {{ lacquerStore.layers.length }} 遍 · 荫房异常 {{ lacquerStore.outOfRangeCount }} 遍</span>
        </div>
      </template>
      <el-row :gutter="12">
        <el-col v-for="badge in stageBadges" :key="badge.key" :xs="12" :md="6">
          <StatBadge :label="`${badge.label} 完成`" :value="badge.count" unit="张" />
        </el-col>
      </el-row>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>琴坯阶段明细</span>
          <span class="card-note">缺项会在「缺失项」列标出</span>
        </div>
      </template>
      <FilterBar
        :fields="[
          { key: 'stage', label: '工序阶段', options: ['选材', '掏膛', '灰胎', '上弦'], width: 120 },
          { key: 'species', label: '树种', options: WOOD_SPECIES, width: 110 },
        ]"
        keyword-placeholder="搜索琴号（本页按阶段/树种筛选）"
        :result-count="visible.length"
        :total-count="progressList.length"
      />
      <el-table :data="visible" size="small" border>
        <el-table-column prop="guqinNo" label="琴号" width="110" />
        <el-table-column prop="species" label="树种" width="90" />
        <el-table-column label="四阶段" min-width="300">
          <template #default="scope">
            <el-tag
              v-for="stage in scope.row.stages"
              :key="stage.key"
              class="stage-tag"
              :type="stage.done ? 'success' : 'info'"
              effect="plain"
            >
              {{ stage.label }}{{ stage.done ? '✓' : '…' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="推进比" width="180">
          <template #default="scope">
            <el-progress :percentage="scope.row.ratio" :status="scope.row.ratio === 100 ? 'success' : undefined" />
          </template>
        </el-table-column>
        <el-table-column label="缺失项" min-width="160">
          <template #default="scope">
            <span v-if="scope.row.missing.length" class="missing">{{ scope.row.missing.join('、') }}</span>
            <el-tag v-else type="success" size="small">齐备</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="累计灰胎(mm)" width="120">
          <template #default="scope">{{ scope.row.cumulativeMm.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="成琴归档" width="170" fixed="right">
          <template #default="scope">
            <div class="archive-cell">
              <template v-if="archiveBadges.get(scope.row.guqinNo)">
                <el-tag :type="archiveBadges.get(scope.row.guqinNo)!.status === 'active' ? 'success' : 'warning'" size="small">
                  v{{ archiveBadges.get(scope.row.guqinNo)!.version }} · {{ ARCHIVE_STATUS_LABELS[archiveBadges.get(scope.row.guqinNo)!.status] }}
                </el-tag>
                <el-button link type="primary" @click="openArchive(scope.row.guqinNo)">重新归档</el-button>
              </template>
              <template v-else>
                <el-tag type="info" size="small" effect="plain">未归档</el-tag>
                <el-button link type="primary" @click="openArchive(scope.row.guqinNo)">归档</el-button>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>成琴归档（交琴验收档）</span>
          <span class="card-note">
            快照式归档 {{ archiveStore.rows.length }} 份 / {{ archiveStore.archivedCount }} 张琴，工序再改旧档不变、仅标「已变更」
            <el-button link type="primary" :disabled="!archiveStore.rows.length" @click="exportArchives">导出归档 CSV</el-button>
          </span>
        </div>
      </template>
      <EmptyPanel
        v-if="archiveStore.rows.length === 0"
        description="还没有成琴归档：四道工序齐备后，在上方明细表点「归档」生成固定验收档"
      />
      <el-table v-else :data="archiveStore.rows" size="small" border>
        <el-table-column label="琴号" width="100">
          <template #default="scope">{{ scope.row.archive.guqinNo }}</template>
        </el-table-column>
        <el-table-column label="版本" width="70">
          <template #default="scope">v{{ scope.row.archive.version }}</template>
        </el-table-column>
        <el-table-column label="成琴日期" width="105">
          <template #default="scope">{{ formatDate(scope.row.archive.finishedAt) }}</template>
        </el-table-column>
        <el-table-column label="验琴人" width="90">
          <template #default="scope">{{ scope.row.archive.inspector }}</template>
        </el-table-column>
        <el-table-column label="归档时间" width="105">
          <template #default="scope">{{ formatDate(scope.row.archive.archivedAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'active' ? 'success' : 'warning'" size="small">
              {{ statusLabel(scope.row.status) }}
            </el-tag>
            <el-tag v-if="scope.row.isLatest" type="info" size="small" effect="plain" class="latest-tag">最新</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="快照摘要" min-width="240" show-overflow-tooltip>
          <template #default="scope">{{ snapshotSummary(scope.row.archive) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="openSnapshot(scope.row.archive)">查看快照</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>最近工序动态</template>
      <ProcessTimeline :events="events" />
    </el-card>

    <ArchiveDialog v-model="archiveDialogVisible" :guqin-no="activeGuqinNo" />
    <ArchiveSnapshotDialog v-model="snapshotDialogVisible" :archive="activeArchive" />
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  color: #4a3728;
}
.page-desc {
  margin: 0 0 14px;
  color: #8a7a68;
  font-size: 13px;
}
.stat-row {
  margin-bottom: 12px;
}
.stat-row .el-col {
  margin-bottom: 12px;
}
.block {
  margin-bottom: 16px;
  border-radius: 8px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-note {
  font-size: 12px;
  color: #8a7a68;
}
.stage-tag {
  margin-right: 6px;
}
.missing {
  color: #c62828;
  font-size: 13px;
}
.archive-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.latest-tag {
  margin-left: 4px;
}
</style>
