import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Drawer источника: документ открывается отдельным запросом через Go
// с повторной ACL-проверкой (пока — fixture). Ссылки наружу запрещены контрактом.

export function SourceDrawer({
  open,
  title,
  content,
  version,
  onClose,
}: {
  open: boolean;
  title: string;
  content: string;
  version: number;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Закрыть источник"
        onClick={onClose}
        className="absolute inset-0 bg-text-primary/20"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Источник: ${title}`}
        className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              версия {version} · синтетический документ · доступ перепроверен при открытии
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto text-sm leading-6">{content}</div>
      </div>
    </div>
  );
}
