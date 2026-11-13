import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MentorContact } from './MentorContact';
const write = vi.hoisted(() => vi.fn());
vi.mock('../lib/v3', () => ({ write3: write }));
const preview = {id:'preview',text:'Разрешённый контекст',content_hash:'hash',contact_revision:1,telegram_url:'https://t.me/demo_mentor',expires_at:'2099-01-01T00:00:00Z'};
beforeEach(() => { write.mockReset(); Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}}); });
it('re-authorizes export before copying and only then offers Telegram, no send', async () => {
 write.mockResolvedValueOnce(preview).mockResolvedValueOnce({text:preview.text,telegram_url:preview.telegram_url});
 render(<MentorContact context={{assignment_id:'assignment'}} />);
 fireEvent.click(screen.getByRole('button',{name:'Подготовить контекст'}));
 expect(await screen.findByText(preview.text)).toBeVisible();
 expect(screen.queryByRole('link')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Проверить и скопировать'}));
 expect(await screen.findByRole('link')).toHaveAttribute('rel','noopener noreferrer');
 expect(navigator.clipboard.writeText).toHaveBeenCalledWith(preview.text);
 expect(write).toHaveBeenLastCalledWith('/mentor-contact-export',expect.objectContaining({preview_id:'preview',contact_revision:1}),expect.anything());
 fireEvent.change(screen.getByLabelText('Вопрос наставнику'),{target:{value:'Новый вопрос'}});
 expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('revoked or expired preview never reaches clipboard', async () => {
 write.mockResolvedValueOnce(preview).mockRejectedValueOnce(new Error('revoked'));
 render(<MentorContact context={{goal_id:'goal',step_id:'step'}} />);
 fireEvent.click(screen.getByRole('button',{name:'Подготовить контекст'}));
 fireEvent.click(await screen.findByRole('button',{name:'Проверить и скопировать'}));
 await waitFor(() => expect(screen.queryByText(preview.text)).not.toBeInTheDocument());
 expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
 expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('missing contact shows an error and permits retry', async () => {
 write.mockRejectedValue(new Error('missing'));
 render(<MentorContact context={{assignment_id:'assignment'}} />);
 fireEvent.click(screen.getByRole('button',{name:'Подготовить контекст'}));
 expect(await screen.findByRole('status')).toHaveTextContent('Контакт наставника недоступен');
 expect(screen.getByRole('button',{name:'Подготовить контекст'})).toBeEnabled();
});
