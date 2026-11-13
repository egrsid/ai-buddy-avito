import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { knowledgeDoc } from '../fixtures/all-states';
import { SourceDrawer } from './SourceDrawer';

const props = {
  title: knowledgeDoc.title,
  content: knowledgeDoc.content,
  version: knowledgeDoc.version,
};

describe('SourceDrawer', () => {
  it('закрытый drawer ничего не рендерит', () => {
    const { container } = render(<SourceDrawer open={false} {...props} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('открытый: диалог с заголовком, версией и содержимым', () => {
    render(<SourceDrawer open {...props} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: `Источник: ${knowledgeDoc.title}` })).toBeInTheDocument();
    expect(screen.getByText(/версия 1 · синтетический документ/)).toBeInTheDocument();
    expect(screen.getByText(/Запросите роль db_reader/)).toBeInTheDocument();
  });

  it('Escape закрывает', () => {
    const onClose = vi.fn();
    render(<SourceDrawer open {...props} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('кнопка закрытия закрывает', () => {
    const onClose = vi.fn();
    render(<SourceDrawer open {...props} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('клик по подложке закрывает', () => {
    const onClose = vi.fn();
    render(<SourceDrawer open {...props} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть источник' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('фокус на кнопке закрытия при открытии', () => {
    render(<SourceDrawer open {...props} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
  });
});
