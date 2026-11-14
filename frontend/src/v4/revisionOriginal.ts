import type { TaskBriefT } from '../lib/v3';

// Never label a newer published text as the original of an older proposal.
export function revisionOriginal(brief: TaskBriefT | null, version: number, field: string): string {
  const published = brief?.latest_published_version;
  if (!published || published.version !== version) {
    return `Исходная версия ${version} отличается от текущей. Сверьте её перед применением.`;
  }
  const content = published.content;
  if (field === 'goal') return content.goal;
  if (field === 'expected_result') return content.expected_result;
  const [area, id, property] = field.split('.');
  if (property !== 'text') return 'Исходное поле недоступно';
  if (area === 'sections') return content.sections.find((s) => s.id === id)?.text ?? 'Раздел недоступен';
  if (area === 'acceptance_criteria')
    return content.acceptance_criteria.find((c) => c.id === id)?.text ?? 'Критерий недоступен';
  return 'Исходное поле недоступно';
}

export function revisionFieldLabel(brief: TaskBriefT | null, field: string): string {
  if (field === 'goal') return 'Цель задания';
  if (field === 'expected_result') return 'Ожидаемый результат';
  const [area, id] = field.split('.');
  if (area === 'acceptance_criteria') return 'Критерий приёмки';
  return brief?.latest_published_version?.content.sections.find((s) => s.id === id)?.title ?? 'Раздел ТЗ';
}
