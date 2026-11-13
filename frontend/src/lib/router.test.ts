import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { href, matchChatRoute, matchIdRoute, matchStepRoute, navigate, useHashRoute } from './router';

describe('router', () => {
  it('href оборачивает путь в hash', () => {
    expect(href('/onboarding')).toBe('#/onboarding');
  });

  it('navigate меняет location.hash', () => {
    navigate('/chat');
    expect(window.location.hash).toBe('#/chat');
  });

  it('useHashRoute: дефолт /onboarding и реакция на hashchange', () => {
    window.location.hash = '';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('/onboarding');

    act(() => {
      window.location.hash = '#/requests';
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(result.current).toBe('/requests');
  });

  it('matchStepRoute: валидный и невалидный путь', () => {
    expect(matchStepRoute('/onboarding/g1/steps/s1')).toEqual({ goalId: 'g1', stepId: 's1' });
    expect(matchStepRoute('/onboarding/g1')).toBeNull();
    expect(matchStepRoute('/requests')).toBeNull();
  });

  it('matchChatRoute: диалог шага и общий чат', () => {
    expect(matchChatRoute('/chat/goal-1/check_access')).toEqual({ goalId: 'goal-1', stepId: 'check_access' });
    expect(matchChatRoute('/chat')).toBeNull();
    expect(matchChatRoute('/onboarding/g1/steps/s1')).toBeNull();
  });

  it('matchIdRoute: извлекает id по базовому пути', () => {
    expect(matchIdRoute('/buddy/escalations/e1', '/buddy/escalations')).toBe('e1');
    expect(matchIdRoute('/buddy/escalations', '/buddy/escalations')).toBeNull();
    expect(matchIdRoute('/knowledge-gaps/k1', '/knowledge-gaps')).toBe('k1');
  });
});
