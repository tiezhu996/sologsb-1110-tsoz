<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useArchiveStore } from '../../stores/archiveStore';
import { useStageProgress } from '../../hooks/useStageProgress';
import { todayStr } from '../../utils/layer';

const props = defineProps<{ guqinNo: string }>();
const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ (e: 'archived'): void }>();

const archiveStore = useArchiveStore();
const { progressList } = useStageProgress();

const progress = computed(() => progressList.value.find((p) => p.guqinNo === props.guqinNo));
const missing = computed(() => progress.value?.missing ?? []);
/** 四道工序齐备才允许归档；缺项时确认按钮禁用（挡住） */
const complete = computed(() => Boolean(progress.value) && missing.value.length === 0);

const versions = computed(() => archiveStore.versionsOf(props.guqinNo));
const nextVersion = computed(() => archiveStore.nextVersionOf(props.guqinNo));

const finishedAt = ref(todayStr());
const inspector = ref('');
const submitting = ref(false);

watch(visible, (open) => {
  if (open) {
    finishedAt.value = todayStr();
    inspector.value = archiveStore.latestOf(props.guqinNo)?.inspector ?? '';
  }
});

async function submit() {
  if (!complete.value) return;
  if (!inspector.value.trim()) {
    ElMessage.warning('请填写验琴人');
    return;
  }
  submitting.value = true;
  try {
    const archive = await archiveStore.archive({
      guqinNo: props.guqinNo,
      finishedAt: new Date(`${finishedAt.value}T00:00:00`).toISOString(),
      inspector: inspector.value,
    });
    ElMessage.success(`已生成 ${props.guqinNo} 成琴归档 v${archive.version}，四类记录快照已固定`);
    emit('archived');
    visible.value = false;
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog v-model="visible" :title="`${guqinNo} · 成琴归档`" width="560px">
    <el-alert
      v-if="versions.length"
      type="warning"
      :closable="false"
      class="block-alert"
      :title="`已有归档 v${versions[0].version}，重新归档将生成 v${nextVersion}；旧档保留并标为「已变更」`"
    />
    <el-alert
      v-else
      type="info"
      :closable="false"
      class="block-alert"
      title="归档把当时四类记录存成快照（不做四表实时拼），之后的工序修改不会改动本验收档"
    />

    <div class="stage-checks">
      <div v-for="stage in progress?.stages ?? []" :key="stage.key" class="stage-check">
        <el-tag :type="stage.done ? 'success' : 'danger'" effect="plain" size="small">
          {{ stage.done ? '✓' : '✗' }} {{ stage.label }}
        </el-tag>
        <span class="stage-detail">{{ stage.detail }}</span>
      </div>
    </div>

    <el-alert v-if="!complete" type="error" :closable="false" class="block-alert" title="缺项未齐，不能归档">
      <template #default>
        <div v-for="item in missing" :key="item" class="missing-item">· {{ item }}</div>
      </template>
    </el-alert>

    <el-form label-width="90px" class="archive-form">
      <el-form-item label="成琴日期" required>
        <el-date-picker v-model="finishedAt" type="date" value-format="YYYY-MM-DD" placeholder="选择成琴日期" :disabled="!complete" />
      </el-form-item>
      <el-form-item label="验琴人" required>
        <el-input v-model="inspector" placeholder="如：周砚秋" maxlength="16" style="width: 220px" :disabled="!complete" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!complete" :loading="submitting" @click="submit">
        {{ versions.length ? `重新归档（v${nextVersion}）` : '确认归档' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.block-alert {
  margin-bottom: 12px;
}
.stage-checks {
  margin-bottom: 12px;
}
.stage-check {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.stage-detail {
  font-size: 12px;
  color: #8a7a68;
}
.missing-item {
  color: #c62828;
  font-size: 13px;
}
.archive-form {
  margin-top: 4px;
}
</style>
