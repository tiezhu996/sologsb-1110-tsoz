/** 四道工序阶段 key */
export type StageKey = 'select' | 'carve' | 'lacquer' | 'string';

/** 工序阶段中文标签（进度判定与成琴归档共用） */
export const STAGE_LABELS: Record<StageKey, string> = {
  select: '选材',
  carve: '掏膛',
  lacquer: '灰胎',
  string: '上弦',
};

/** 通用筛选字段描述（FilterBar 使用） */
export interface FilterField {
  key: string;
  label: string;
  options: string[];
  width?: number;
}

/** 工序时间线条目（ProcessTimeline 使用） */
export interface TimelineEvent {
  label: string;
  at: string;
  text: string;
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}
