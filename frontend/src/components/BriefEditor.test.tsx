import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as fx from '../test/v3fixtures';
import { BriefEditor, briefProblems, cleanBrief, emptyBrief, nextId } from './BriefEditor';

describe('BriefEditor', () => {
  it('новые id стабильны и не повторяются', () => {
    expect(nextId('section', ['section-1', 'section-2'])).toBe('section-3');
    expect(nextId('section', ['section-3'])).toBe('section-2');
    expect(nextId('criterion', ['criterion-2', 'criterion-1'])).toBe('criterion-3');
  });

  it('пустой бриф не проходит проверку, пустые критерии отбрасываются', () => {
    expect(briefProblems(emptyBrief())).toHaveLength(4);
    const cleaned = cleanBrief({ ...fx.content, acceptance_criteria: [{ id: 'a', text: '  ' }], title: '  T  ' });
    expect(cleaned.acceptance_criteria).toEqual([]);
    expect(cleaned.title).toBe('T');
    expect(briefProblems(fx.content)).toEqual([]);
  });

  it('заполнение формы, разделы и критерии, отправка очищенного текста', () => {
    const onSubmit = vi.fn();
    render(<BriefEditor initial={emptyBrief()} submitLabel="Сохранить" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Укажите название');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'ТЗ' } });
    fireEvent.change(screen.getByLabelText('Цель задания'), { target: { value: 'Цель' } });
    fireEvent.change(screen.getByLabelText('Заголовок раздела'), { target: { value: 'Формат' } });
    fireEvent.change(screen.getByLabelText('Текст раздела'), { target: { value: 'Описание' } });
    fireEvent.change(screen.getByLabelText('Ожидаемый результат'), { target: { value: 'Отчёт' } });
    fireEvent.change(screen.getByLabelText('Критерий 1'), { target: { value: 'Есть шаги' } });
    fireEvent.click(screen.getByRole('button', { name: /Добавить раздел/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить раздел 2' }));
    fireEvent.click(screen.getByRole('button', { name: /Добавить критерий/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить критерий 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'ТЗ',
      goal: 'Цель',
      sections: [{ id: 'section-1', title: 'Формат', text: 'Описание' }],
      expected_result: 'Отчёт',
      acceptance_criteria: [{ id: 'criterion-1', text: 'Есть шаги' }],
      refs: [],
    });
  });

  it('ссылки на инструкции сохраняются, отмена вызывает onCancel', () => {
    const onCancel = vi.fn();
    render(<BriefEditor initial={fx.content} submitLabel="Сохранить" onSubmit={() => {}} onCancel={onCancel} />);
    expect(screen.getByText(/Связанные инструкции \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
