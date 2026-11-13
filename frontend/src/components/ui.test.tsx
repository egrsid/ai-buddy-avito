import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Skeleton } from './ui';

describe('ui/Card', () => {
  it('рендерит детей и объединяет className', () => {
    const { container } = render(<Card className="extra">Содержимое карточки</Card>);
    expect(screen.getByText('Содержимое карточки')).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveClass('extra');
  });
});

describe('ui/Button', () => {
  it('вызывает onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Нажми</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Нажми' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled блокирует клик', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Нажми</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Нажми' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('вариант %s рендерится', (variant) => {
    render(<Button variant={variant}>Кнопка</Button>);
    expect(screen.getByRole('button', { name: 'Кнопка' })).toBeInTheDocument();
  });

  it('поддерживает type=submit', () => {
    render(<Button type="submit">Отправить</Button>);
    expect(screen.getByRole('button', { name: 'Отправить' })).toHaveAttribute('type', 'submit');
  });
});

describe('ui/Skeleton', () => {
  it('рисует заданное число строк', () => {
    const { container } = render(<Skeleton lines={5} />);
    expect(screen.getByRole('status', { name: 'Загрузка' })).toBeInTheDocument();
    expect(container.querySelectorAll('.h-4')).toHaveLength(5);
  });
});

describe('ui/LoadingState', () => {
  it('показывает подпись по умолчанию и кастомную', () => {
    const { unmount } = render(<LoadingState />);
    expect(screen.getByText('Загружаем данные…')).toBeInTheDocument();
    unmount();
    render(<LoadingState label="Подождите" />);
    expect(screen.getByText('Подождите')).toBeInTheDocument();
  });
});

describe('ui/ErrorState', () => {
  it('с retry показывает кнопку и вызывает обработчик', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('без retry кнопки нет, заголовок кастомный', () => {
    render(<ErrorState title="Сломалось" message="Детали" />);
    expect(screen.getByText('Сломалось')).toBeInTheDocument();
    expect(screen.getByText('Детали')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ui/EmptyState', () => {
  it('показывает заголовок и сообщение', () => {
    render(<EmptyState title="Пусто" message="Ничего нет" />);
    expect(screen.getByText('Пусто')).toBeInTheDocument();
    expect(screen.getByText('Ничего нет')).toBeInTheDocument();
  });
});

describe('ui/PageHeader', () => {
  it('рендерит заголовок и необязательный подзаголовок', () => {
    const { unmount } = render(<PageHeader title="Заголовок" subtitle="Подзаголовок" />);
    expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeInTheDocument();
    expect(screen.getByText('Подзаголовок')).toBeInTheDocument();
    unmount();
    render(<PageHeader title="Только заголовок" />);
    expect(screen.queryByText('Подзаголовок')).not.toBeInTheDocument();
  });
});
