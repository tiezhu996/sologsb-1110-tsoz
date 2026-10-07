<script setup lang="ts">
import { computed } from 'vue';
import { useArchiveStore } from '../../stores/archiveStore';
import { formatDate } from '../../utils/layer';
import { ARCHIVE_STATUS_LABELS, type QinArchive } from '../../types/archive';

const props = defineProps<{ archive: QinArchive | null }>();
const visible = defineModel<boolean>({ required: true });

const archiveStore = useArchiveStore();

const status = computed(() => (props.archive ? archiveStore.statusOf(props.archive) : 'active'));
const panel = computed(() => props.archive?.snapshot.boards.find((b) => b.part === '面板'));
const base = computed(() => props.archive?.snapshot.boards.find((b) => b.part === '底板'));
const cumulativeMm = computed(() =>
  (props.archive?.snapshot.lacquers ?? []).reduce((sum, layer) => sum + (Number(layer.layerThickness) || 0), 0).toFixed(2),
);
</script>

<template>
  <el-dialog v-model="visible" :title="archive ? `${archive.guqinNo} · 成琴归档 v${archive.version}` : '成琴归档'" width="760px">
    <template v-if="archive">
      <div class="doc-head">
        <el-tag :type="status === 'active' ? 'success' : 'warning'" effect="dark">
          {{ ARCHIVE_STATUS_LABELS[status] }}
        </el-tag>
        <span v-if="status === 'stale'" class="stale-hint">归档后工序记录有改动，本档保留当时快照；以最新归档为准</span>
      </div>

      <el-descriptions :column="3" border size="small" class="block">
        <el-descriptions-item label="琴号">{{ archive.guqinNo }}</el-descriptions-item>
        <el-descriptions-item label="归档版本">v{{ archive.version }}</el-descriptions-item>
        <el-descriptions-item label="成琴日期">{{ formatDate(archive.finishedAt) }}</el-descriptions-item>
        <el-descriptions-item label="验琴人">{{ archive.inspector }}</el-descriptions-item>
        <el-descriptions-item label="归档时间" :span="2">{{ formatDate(archive.archivedAt) }}</el-descriptions-item>
      </el-descriptions>

      <h4 class="snap-title">板材配对（快照）</h4>
      <el-descriptions :column="2" border size="small" class="block">
        <el-descriptions-item label="面板">
          {{ panel ? `${panel.boardNo} · ${panel.species} · 阴干${panel.dryYears}年 · ${panel.thicknessMm}mm · ${panel.grain} · ${panel.defect}` : '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="底板">
          {{ base ? `${base.boardNo} · ${base.species} · 阴干${base.dryYears}年 · ${base.thicknessMm}mm · ${base.grain} · ${base.defect}` : '—' }}
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="snap-title">槽腹尺寸（快照）</h4>
      <el-descriptions :column="3" border size="small" class="block">
        <el-descriptions-item label="纳音">{{ archive.snapshot.chamber.nayinThickness }}mm</el-descriptions-item>
        <el-descriptions-item label="龙池">{{ archive.snapshot.chamber.longchiThickness }}mm</el-descriptions-item>
        <el-descriptions-item label="凤沼">{{ archive.snapshot.chamber.fengzhaoThickness }}mm</el-descriptions-item>
        <el-descriptions-item label="槽腹深度">{{ archive.snapshot.chamber.chamberDepth }}mm</el-descriptions-item>
        <el-descriptions-item label="天地柱">{{ archive.snapshot.chamber.postPos }}</el-descriptions-item>
        <el-descriptions-item label="池沼尺寸">{{ archive.snapshot.chamber.poolSize }}</el-descriptions-item>
        <el-descriptions-item label="掏膛人">{{ archive.snapshot.chamber.carver }}</el-descriptions-item>
        <el-descriptions-item label="掏膛日期" :span="2">{{ formatDate(archive.snapshot.chamber.carvedAt) }}</el-descriptions-item>
      </el-descriptions>

      <h4 class="snap-title">灰胎遍次（快照，累计 {{ cumulativeMm }}mm）</h4>
      <el-table :data="archive.snapshot.lacquers" size="small" border class="block">
        <el-table-column prop="seq" label="遍次" width="60" />
        <el-table-column prop="mixRatio" label="配比" width="90" />
        <el-table-column label="本遍(mm)" width="90">
          <template #default="scope">{{ scope.row.layerThickness.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="累计(mm)" width="90">
          <template #default="scope">{{ scope.row.totalThickness.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="荫房" width="130">
          <template #default="scope">{{ scope.row.curingTemp }}℃ / {{ scope.row.curingHumidity }}%</template>
        </el-table-column>
        <el-table-column label="打磨" width="80">
          <template #default="scope">{{ scope.row.polishGrit }}目</template>
        </el-table-column>
        <el-table-column label="施工日期" width="100">
          <template #default="scope">{{ formatDate(scope.row.appliedAt) }}</template>
        </el-table-column>
        <el-table-column prop="operator" label="髹漆人" min-width="80" />
      </el-table>

      <h4 class="snap-title">上弦与音色评价（快照）</h4>
      <el-descriptions :column="2" border size="small" class="block">
        <el-descriptions-item label="弦材质">{{ archive.snapshot.stringing.stringType }}</el-descriptions-item>
        <el-descriptions-item label="雁足与绒扣">{{ archive.snapshot.stringing.nut }}</el-descriptions-item>
        <el-descriptions-item label="弦距">{{ archive.snapshot.stringing.stringGap }}mm</el-descriptions-item>
        <el-descriptions-item label="缺陷">{{ archive.snapshot.stringing.defects.join('、') }}</el-descriptions-item>
        <el-descriptions-item label="散音" :span="2">{{ archive.snapshot.stringing.sanNote }}</el-descriptions-item>
        <el-descriptions-item label="按音" :span="2">{{ archive.snapshot.stringing.anNote }}</el-descriptions-item>
        <el-descriptions-item label="泛音" :span="2">{{ archive.snapshot.stringing.fanNote }}</el-descriptions-item>
        <el-descriptions-item label="九德" :span="2">{{ archive.snapshot.stringing.nineVirtues }}</el-descriptions-item>
        <el-descriptions-item label="上弦人">{{ archive.snapshot.stringing.operator }}</el-descriptions-item>
        <el-descriptions-item label="上弦日期">{{ formatDate(archive.snapshot.stringing.strungAt) }}</el-descriptions-item>
      </el-descriptions>
    </template>
  </el-dialog>
</template>

<style scoped>
.doc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.stale-hint {
  font-size: 12px;
  color: #c77700;
}
.block {
  margin-bottom: 14px;
}
.snap-title {
  margin: 0 0 8px;
  font-size: 13px;
  color: #4a3728;
}
</style>
