import { useState } from 'react';
import { z } from 'zod';
import { ContactPreview, ContactExport } from '../contracts/v3';
import { write3 } from '../lib/v3';
import { userMessage } from '../lib/api';
import { Button, Card } from './ui';

export function MentorContact({ context }: { context: { goal_id: string; step_id: string } | { assignment_id: string; section_id?: string } }) {
  const [preview, setPreview] = useState<z.infer<typeof ContactPreview> | null>(null);
  const [question, setQuestion] = useState('Нужна помощь с заданием.');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState<string | null>(null);
  async function prepare() {
    setBusy(true); setNotice(''); setPreview(null); setLink(null);
    try { setPreview(await write3('/mentor-contact-preview', { ...context, question }, ContactPreview)); }
    catch (e) { setNotice(userMessage(e, 'Контакт наставника недоступен. Свяжитесь с ним вручную.')); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!preview || busy) return;
    setBusy(true); setNotice(''); setLink(null);
    try {
      const exported = await write3('/mentor-contact-export', { preview_id: preview.id, content_hash: preview.content_hash, contact_revision: preview.contact_revision }, ContactExport);
      await navigator.clipboard.writeText(exported.text);
      setLink(exported.telegram_url); setNotice('Скопировано. Отправьте сообщение самостоятельно в Telegram.');
    } catch (e) { setPreview(null); setNotice(userMessage(e, 'Копирование недоступно. Проверьте разрешение браузера и подготовьте контекст заново.')); }
    finally { setBusy(false); }
  }
  return <Card>
    <h2 className="font-semibold">Связаться с наставником</h2>
    <p className="mt-1 text-sm text-text-secondary">Личный диалог в Telegram. Приложение не отправляет сообщения и не отслеживает ответы.</p>
    <label className="my-3 block text-sm">Вопрос наставнику<input className="mt-1 w-full rounded-xl border border-border p-3" value={question} maxLength={500} onChange={e => { setQuestion(e.target.value); setPreview(null); setLink(null); }} /></label>
    <Button variant="secondary" disabled={busy || !question.trim()} onClick={prepare}>Подготовить контекст</Button>
    {preview && <div className="mt-4 space-y-3"><h3 className="font-medium">Предпросмотр сообщения</h3><pre className="whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-3 text-sm">{preview.text}</pre><p className="text-xs text-text-secondary">При копировании доступ и актуальность проверяются повторно.</p><Button disabled={busy} onClick={copy}>Проверить и скопировать</Button></div>}
    {link && <a className="mt-3 block text-sm font-medium text-primary underline" href={link} target="_blank" rel="noopener noreferrer">Открыть Telegram наставника</a>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
  </Card>;
}
