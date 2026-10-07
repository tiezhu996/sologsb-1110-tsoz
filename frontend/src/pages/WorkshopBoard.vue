<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatBadge from '../components/common/StatBadge.vue';
import ProcessTimeline from '../components/common/ProcessTimeline.vue';
import FilterBar from '../components/common/FilterBar.vue';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import { useStageProgress, STAGE_LABELS, type StageKey } from '../hooks/useStageProgress';
import { useBoardStore } from '../stores/boardStore';
import { useChamberStore } from '../stores/chamberStore';
import { useLacquerStore } from '../stores/lacquerStore';
import { useStringingStore } from '../stores/stringingStore';
import { useArchiveStore } from '../stores/archiveStore';
import { archiveStatus, buildSnapshot } from '../utils/archive';
import { formatDate, formatDateTime, todayStr } from '../utils/layer';
import { WOOD_SPECIES } from '../types/wood-board';
import type { ArchiveStatus, QinArchive } from '../types/archive';
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

/** 某琴验收档的当前状态：四表实时指纹与存档指纹比对，不一致即「已变更」 */
function statusOf(archive: QinArchive): ArchiveStatus {
  const built = buildSnapshot(archive.guqinNo, boardStore.boards, chamberStore.chambers, lacquerStore.layers, stringingStore.stringings);
  return archiveStatus(archive, built.snapshot);
}

const visible = computed(() =>
  progressList.value
    .filter((item) => {
      if (speciesParam.value && item.species !== speciesParam.value) return false;
      if (stageParam.value) {
        const stage = item.stages.find((s) => s.label === stageParam.value);
        if (!stage || !stage.done) return false;
      }
      return true;
    })
    .map((item) => {
      const archive = archiveStore.latestOf(item.guqinNo);
      return { ...item, archive, archiveState: archive ? statusOf(archive) : '' };
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

/** 全部验收档（归档时间倒序），状态实时比对得出 */
const archiveRows = computed(() =>
  archiveStore.archives
    .map((archive) => ({ ...archive, status: statusOf(archive) }))
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),
);

const changedCount = computed(() => archiveRows.value.filter((row) => row.status === '已变更').length);

// ---- 归档对话框 ----
const archiveDialogVisible = ref(false);
const archiveGuqinNo = ref('');
const archiveForm = ref({ completedAt: todayStr(), inspector: '' });

function openArchive(guqinNo: string) {
  archiveGuqinNo.value = guqinNo;
  archiveForm.value = {
    completedAt: todayStr(),
    inspector: archiveStore.latestOf(guqinNo)?.inspector ?? '',
  };
  archiveDialogVisible.value = true;
}

async function submitArchive() {
  if (!archiveForm.value.completedAt) {
    ElMessage.warning('请选择成琴日期');
    return;
  }
  if (!archiveForm.value.inspector.trim()) {
    ElMessage.warning('请填写验琴人');
    return;
  }
  try {
    const archive = await archiveStore.archive({
      guqinNo: archiveGuqinNo.value,
      completedAt: new Date(`${archiveForm.value.completedAt}T12:00:00`).toISOString(),
      inspector: archiveForm.value.inspector,
    });
    ElMessage.success(`已生成 ${archive.guqinNo} 第 ${archive.version} 版验收档（当次快照已冻结）`);
    archiveDialogVisible.value = false;
  } catch (error) {
    ElMessage.warning((error as Error).message);
  }
}

// ---- 快照查看 ----
const snapshotDialogVisible = ref(false);
const viewing = ref<(QinArchive & { status: ArchiveStatus }) | null>(null);

function openSnapshot(row: QinArchive & { status: ArchiveStatus }) {
  viewing.value = row;
  snapshotDialogVisible.value = true;
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
  archiveStore.archives.forEach((archive) => {
    list.push({
      label: `成琴归档 v${archive.version} · ${archive.guqinNo}`,
      at: formatDate(archive.archivedAt),
      text: `成琴日期 ${formatDate(archive.completedAt)}，验琴人 ${archive.inspector}，累计灰胎 ${archive.cumulativeMm.toFixed(2)}mm`,
      type: 'info',
    });
  });
  return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
});
</script>

<template>
  <div>
    <h2 class="page-title">琴坯进度</h2>
    <p class="page-desc">
      按选材 / 掏膛 / 灰胎 / 上弦四阶段统计在制琴坯；四道工序齐备后归档成琴，把当次四类记录连同成琴日期、验琴人冻结为验收档快照。数据保存在浏览器
      IndexedDB（gbguqin-db）。
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
          <span class="card-note">缺项会在「缺失项」列标出；缺项未齐时归档按钮被挡住</span>
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
        <el-table-column label="成琴归档" width="200" fixed="right">
          <template #default="scope">
            <template v-if="scope.row.archive">
              <el-tag :type="scope.row.archiveState === '有效' ? 'success' : 'warning'" size="small" effect="plain">
                v{{ scope.row.archive.version }} · {{ scope.row.archiveState }}
              </el-tag>
              <el-button
                v-if="scope.row.archiveState === '已变更' && scope.row.missing.length === 0"
                link
                type="primary"
                @click="openArchive(scope.row.guqinNo)"
              >
                重新归档
              </el-button>
            </template>
            <el-button v-else-if="scope.row.missing.length === 0" link type="primary" @click="openArchive(scope.row.guqinNo)">
              归档成琴
            </el-button>
            <el-tooltip v-else :content="`缺项未齐，不能归档：${scope.row.missing.join('、')}`" placement="top">
              <span>
                <el-button link type="info" disabled>归档成琴</el-button>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>成琴验收档</span>
          <span class="card-note">
            归档即冻结当次快照（不随四表实时拼接变化）；归档后再改工序，旧档标「已变更」，重新归档生成新版本
            <el-tag v-if="changedCount" type="warning" size="small" effect="plain" class="archive-tag">已变更 {{ changedCount }} 份</el-tag>
          </span>
        </div>
      </template>
      <EmptyPanel v-if="archiveRows.length === 0" description="尚无验收档：四道工序齐备后，在上方明细表点「归档成琴」" />
      <el-table v-else :data="archiveRows" size="small" border>
        <el-table-column prop="guqinNo" label="琴号" width="100" />
        <el-table-column label="版本" width="70">
          <template #default="scope">v{{ scope.row.version }}</template>
        </el-table-column>
        <el-table-column label="成琴日期" width="110">
          <template #default="scope">{{ formatDate(scope.row.completedAt) }}</template>
        </el-table-column>
        <el-table-column prop="inspector" label="验琴人" width="100" />
        <el-table-column label="归档时间" width="150">
          <template #default="scope">{{ formatDateTime(scope.row.archivedAt) }}</template>
        </el-table-column>
        <el-table-column label="累计灰胎(mm)" width="110">
          <template #default="scope">{{ scope.row.cumulativeMm.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === '有效' ? 'success' : 'warning'" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="openSnapshot(scope.row)">查看快照</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>最近工序动态</template>
      <ProcessTimeline :events="events" />
    </el-card>

    <el-dialog v-model="archiveDialogVisible" :title="`归档成琴 · ${archiveGuqinNo}`" width="480px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="archive-tip"
        title="归档把当前板材配对、槽腹、灰胎、上弦四类记录冻结为快照存档；之后再改任一工序，本档自动标为「已变更」，可重新归档生成新版本。"
      />
      <el-form label-width="90px">
        <el-form-item label="琴号">
          <el-input :model-value="archiveGuqinNo" disabled style="width: 200px" />
        </el-form-item>
        <el-form-item label="成琴日期" required>
          <el-date-picker v-model="archiveForm.completedAt" type="date" value-format="YYYY-MM-DD" placeholder="选择成琴日期" />
        </el-form-item>
        <el-form-item label="验琴人" required>
          <el-input v-model="archiveForm.inspector" placeholder="如：周砚秋" maxlength="16" style="width: 200px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="archiveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitArchive">确认归档</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="snapshotDialogVisible" :title="viewing ? `验收档快照 · ${viewing.guqinNo} v${viewing.version}` : '验收档快照'" width="880px">
      <template v-if="viewing">
        <el-descriptions :column="3" border size="small" class="snap-block">
          <el-descriptions-item label="琴号">{{ viewing.guqinNo }}</el-descriptions-item>
          <el-descriptions-item label="版本">v{{ viewing.version }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="viewing.status === '有效' ? 'success' : 'warning'" size="small">{{ viewing.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="成琴日期">{{ formatDate(viewing.completedAt) }}</el-descriptions-item>
          <el-descriptions-item label="验琴人">{{ viewing.inspector }}</el-descriptions-item>
          <el-descriptions-item label="归档时间">{{ formatDateTime(viewing.archivedAt) }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="snap-title">板材配对（{{ viewing.snapshot.boards.length }} 块）</h4>
        <el-table :data="viewing.snapshot.boards" size="small" border class="snap-block">
          <el-table-column prop="boardNo" label="板材号" width="110" />
          <el-table-column prop="part" label="部位" width="70" />
          <el-table-column prop="species" label="树种" width="80" />
          <el-table-column prop="dryYears" label="阴干(年)" width="80" />
          <el-table-column prop="thicknessMm" label="厚度(mm)" width="80" />
          <el-table-column prop="grain" label="木纹" width="90" />
          <el-table-column prop="defect" label="缺陷" width="70" />
          <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        </el-table>

        <h4 class="snap-title">槽腹尺寸</h4>
        <el-descriptions :column="3" border size="small" class="snap-block">
          <el-descriptions-item label="纳音厚度">{{ viewing.snapshot.chamber.nayinThickness }} mm</el-descriptions-item>
          <el-descriptions-item label="龙池厚度">{{ viewing.snapshot.chamber.longchiThickness }} mm</el-descriptions-item>
          <el-descriptions-item label="凤沼厚度">{{ viewing.snapshot.chamber.fengzhaoThickness }} mm</el-descriptions-item>
          <el-descriptions-item label="槽腹深度">{{ viewing.snapshot.chamber.chamberDepth }} mm</el-descriptions-item>
          <el-descriptions-item label="天地柱">{{ viewing.snapshot.chamber.postPos }}</el-descriptions-item>
          <el-descriptions-item label="龙池凤沼">{{ viewing.snapshot.chamber.poolSize }}</el-descriptions-item>
          <el-descriptions-item label="掏膛人">{{ viewing.snapshot.chamber.carver }}</el-descriptions-item>
          <el-descriptions-item label="掏膛日期">{{ formatDate(viewing.snapshot.chamber.carvedAt) }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ viewing.snapshot.chamber.remark ?? '—' }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="snap-title">灰胎遍次（{{ viewing.snapshot.layers.length }} 遍，累计 {{ viewing.cumulativeMm.toFixed(2) }}mm）</h4>
        <el-table :data="viewing.snapshot.layers" size="small" border class="snap-block">
          <el-table-column prop="seq" label="遍次" width="60" />
          <el-table-column prop="mixRatio" label="配比" width="90" />
          <el-table-column prop="layerThickness" label="本遍(mm)" width="80" />
          <el-table-column prop="totalThickness" label="累计(mm)" width="80" />
          <el-table-column label="荫房" width="120">
            <template #default="scope">{{ scope.row.curingTemp }}℃ / {{ scope.row.curingHumidity }}%</template>
          </el-table-column>
          <el-table-column prop="polishGrit" label="目数" width="70" />
          <el-table-column label="施工日期" width="100">
            <template #default="scope">{{ formatDate(scope.row.appliedAt) }}</template>
          </el-table-column>
          <el-table-column prop="operator" label="髹漆人" width="90" />
        </el-table>

        <h4 class="snap-title">上弦与音色评价</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="弦材质">{{ viewing.snapshot.stringing.stringType }}</el-descriptions-item>
          <el-descriptions-item label="雁足与绒扣">{{ viewing.snapshot.stringing.nut }}</el-descriptions-item>
          <el-descriptions-item label="弦距">{{ viewing.snapshot.stringing.stringGap }} mm</el-descriptions-item>
          <el-descriptions-item label="缺陷">{{ viewing.snapshot.stringing.defects.join('、') }}</el-descriptions-item>
          <el-descriptions-item label="上弦人">{{ viewing.snapshot.stringing.operator }}</el-descriptions-item>
          <el-descriptions-item label="上弦日期">{{ formatDate(viewing.snapshot.stringing.strungAt) }}</el-descriptions-item>
          <el-descriptions-item label="散音" :span="2">{{ viewing.snapshot.stringing.sanNote }}</el-descriptions-item>
          <el-descriptions-item label="按音" :span="2">{{ viewing.snapshot.stringing.anNote }}</el-descriptions-item>
          <el-descriptions-item label="泛音" :span="2">{{ viewing.snapshot.stringing.fanNote }}</el-descriptions-item>
          <el-descriptions-item label="九德" :span="2">{{ viewing.snapshot.stringing.nineVirtues }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-dialog>
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
.archive-tag {
  margin-left: 6px;
}
.archive-tip {
  margin-bottom: 14px;
}
.snap-title {
  margin: 16px 0 8px;
  font-size: 14px;
  color: #4a3728;
}
.snap-block {
  margin-bottom: 4px;
}
</style>
