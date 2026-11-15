import { describe, expect, it } from 'vitest';
import { localTime, methodLabel, sourceLabel, stepTitle } from './labels';

describe('labels', () => {
  it('names known technical values in Russian and keeps unknown ones', () => {
    expect(stepTitle('check_access')).toBe('Проверить доступ');
    expect(methodLabel('iam_permission_present')).toBe('роль найдена в IAM');
    expect(sourceLabel('mock_iam_adapter')).toBe('учебный IAM');
    expect(stepTitle('future_step')).toBe('future_step');
    expect(methodLabel('future_method')).toBe('future_method');
    expect(sourceLabel('future_source')).toBe('future_source');
  });

  it('shows local time instead of raw ISO and keeps garbage as is', () => {
    const shown = localTime('2026-11-15T11:47:20Z');
    expect(shown).not.toContain('T11:47');
    expect(shown).toMatch(/15\.11\.2026/);
    expect(localTime('не дата')).toBe('не дата');
  });
});
