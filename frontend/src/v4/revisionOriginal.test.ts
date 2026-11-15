import { expect, it } from 'vitest';
import type { TaskBriefT } from '../lib/v3';
import { revisionFieldLabel, revisionOriginal } from './revisionOriginal';

const brief = {
  latest_published_version: {
    version: 2,
    content: {
      goal: 'Цель',
      expected_result: 'Результат',
      sections: [{ id: 'format', title: 'Формат отчёта', text: 'Формат' }],
      acceptance_criteria: [{ id: 'check', text: 'Критерий' }],
    },
  },
} as TaskBriefT;
it('shows the exact permitted field and does not substitute a different version', () => {
  expect(revisionOriginal(brief, 2, 'goal')).toBe('Цель');
  expect(revisionOriginal(brief, 2, 'expected_result')).toBe('Результат');
  expect(revisionOriginal(brief, 2, 'sections.format.text')).toBe('Формат');
  expect(revisionOriginal(brief, 2, 'acceptance_criteria.check.text')).toBe('Критерий');
  expect(revisionOriginal(brief, 1, 'goal')).not.toBe('Цель');
  expect(revisionOriginal(null, 2, 'goal')).toContain('Сверьте');
  expect(revisionOriginal(brief, 2, 'sections.missing.text')).toBe('Раздел недоступен');
  expect(revisionOriginal(brief, 2, 'acceptance_criteria.missing.text')).toBe('Критерий недоступен');
  expect(revisionOriginal(brief, 2, 'sections.format.title')).toBe('Исходное поле недоступно');
  expect(revisionOriginal(brief, 2, 'permissions.x.text')).toBe('Исходное поле недоступно');
});

it('labels editable fields in product language', () => {
  expect(revisionFieldLabel(brief, 'goal')).toBe('Цель задания');
  expect(revisionFieldLabel(brief, 'expected_result')).toBe('Ожидаемый результат');
  expect(revisionFieldLabel(brief, 'acceptance_criteria.check.text')).toBe('Критерий приёмки');
  expect(revisionFieldLabel(brief, 'sections.format.text')).toBe('Формат отчёта');
  expect(revisionFieldLabel(null, 'sections.missing.text')).toBe('Раздел ТЗ');
});
