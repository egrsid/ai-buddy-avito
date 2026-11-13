import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormattedText } from './FormattedText';

describe('FormattedText', () => {
  it('renders readable headings, paragraphs, lists and code without raw markers', () => {
    render(<FormattedText text={'# Подключение\n\nВводный абзац.\n\n## До начала\n\n1. **Открой шаг**\n   и инструкцию\n2. Проверь `db_reader`\n\n- хост\n- порт\n\n```text\nssl=require\n```'} />);
    expect(screen.getByRole('heading', { name: 'Подключение' })).toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Открой шаг').tagName).toBe('STRONG');
    expect(screen.getByText('db_reader').tagName).toBe('CODE');
    expect(screen.getByText('ssl=require').closest('pre')).toBeInTheDocument();
  });

  it('only allows links matching validated citations and never executes HTML', () => {
    const onDocument = vi.fn();
    render(<FormattedText text={'[Инструкция](/api/v2/knowledge/doc-a)\n\n[Чужая](/api/v2/knowledge/doc-b) [Внешняя](https://example.org) [Опасная](javascript:alert)\n\n<img src=x onerror=alert(1)>'} documents={[{ document_id: 'doc-a', url: '/api/v2/knowledge/doc-a' }]} onDocument={onDocument} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    fireEvent.click(screen.getByRole('link', { name: 'Инструкция' }));
    expect(onDocument).toHaveBeenCalledWith('doc-a');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('handles plain text, incomplete streamed code and links without an opener', () => {
    render(<FormattedText text={'Обычный текст\nещё строка\n\n[Документ](/api/v2/knowledge/doc)\n\n```\nчасть'} />);
    expect(screen.getByText(/Обычный текст/)).toBeInTheDocument();
    expect(screen.getByText('часть')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
