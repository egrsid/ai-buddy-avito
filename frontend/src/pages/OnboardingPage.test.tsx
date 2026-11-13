import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingPage } from './OnboardingPage';

describe('OnboardingPage', () => {
  it('data: маршрут цели, прогресс, следующий шаг и список шагов', async () => {
    render(<OnboardingPage view="data" />);
    expect(await screen.findByText('Получить доступ к БД и проверить подключение')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Прогресс цели' })).toBeInTheDocument();
    expect(screen.getByText('Следующий шаг')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Шаги цели' })).toBeInTheDocument();
    // блокерный сценарий по умолчанию: виден код ошибки блокера
    expect(screen.getAllByText('DB_SSL_REQUIRED').length).toBeGreaterThan(0);
  });

  it('переключение сценария: «Цель проверена» убирает следующий шаг', async () => {
    render(<OnboardingPage view="data" />);
    await screen.findByText('Следующий шаг');
    const btn = screen.getByRole('button', { name: 'Цель проверена' });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.queryByText('Следующий шаг')).not.toBeInTheDocument());
    // после повторной имитации загрузки показывается проверенная цель
    expect((await screen.findAllByText('Проверено')).length).toBeGreaterThan(0);
  });

  it('сценарий «Начало пути»: шаги с замком зависимости', async () => {
    render(<OnboardingPage view="data" />);
    await screen.findByText('Получить доступ к БД и проверить подключение');
    fireEvent.click(screen.getByRole('button', { name: 'Начало пути' }));
    expect((await screen.findAllByLabelText('Зависит от предыдущего шага')).length).toBeGreaterThan(0);
  });

  it('loading: индикатор загрузки', () => {
    render(<OnboardingPage view="loading" />);
    expect(screen.getByText('Загружаем данные…')).toBeInTheDocument();
  });

  it('error: состояние ошибки', async () => {
    render(<OnboardingPage view="error" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить данные');
  });

  it('empty: цель не выбрана', async () => {
    render(<OnboardingPage view="empty" />);
    expect(await screen.findByText('Цель пока не выбрана')).toBeInTheDocument();
  });
});
