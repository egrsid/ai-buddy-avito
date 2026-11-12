import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-border bg-surface p-5 shadow-[0_4px_16px_#17172208] ${className}`}
    >
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  disabled,
  onClick,
  type = 'button',
  ariaLabel,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}) {
  const styles: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary-hover',
    secondary: 'bg-surface text-text-primary border border-border hover:bg-surface-muted',
    ghost: 'text-primary hover:bg-primary-light',
    danger: 'bg-surface text-error border border-error hover:bg-red-50',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" aria-label="Загрузка" className="animate-pulse space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-surface-muted" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function LoadingState({ label = 'Загружаем данные…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-secondary" role="status">
      <Loader2 size={18} className="animate-spin text-primary" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({
  title = 'Не удалось загрузить данные',
  message = 'Сервис временно недоступен. Попробуйте обновить — данные не потеряются.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-error/40 bg-red-50/50 p-5">
      <div className="flex items-center gap-2 text-error">
        <AlertCircle size={20} aria-hidden />
        <p className="font-medium">{title}</p>
      </div>
      <p className="text-sm text-text-secondary">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface-muted/50 p-8 text-center">
      <Inbox size={28} className="text-text-secondary" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-text-secondary">{message}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
    </header>
  );
}
