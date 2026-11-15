import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WorkspaceView } from './WorkspaceView';
import { TimelineView } from './TimelineView';
import { RevisionView } from './RevisionView';
import { ImpactView } from './ImpactView';
import { V4PreviewPage } from './PreviewPage';
import { workspaces, timeline, proposal, impact } from './samples';
it('workspace expands independently, never combines brief acceptance with technical progress',()=>{
 render(<WorkspaceView items={workspaces}/>);
 const buttons=screen.getAllByRole('button');fireEvent.click(buttons[0]);fireEvent.click(buttons[1]);
 expect(buttons[0]).toHaveAttribute('aria-expanded','true');expect(buttons[1]).toHaveAttribute('aria-expanded','true');
 fireEvent.click(buttons[0]);expect(buttons[1]).toHaveAttribute('aria-expanded','true');
 expect(screen.getAllByText(/Приёмка результата автоматически/)).toHaveLength(2);
});
it('empty and revoked workspace avoid closed metadata and actions',()=>{
 const {rerender}=render(<WorkspaceView items={[]}/>);expect(screen.getByText('Рабочих результатов пока нет')).toBeVisible();
 rerender(<WorkspaceView items={[{...workspaces[0],state:'unavailable',blocker:null,nextAction:null,steps:[]}]}/>);expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
 rerender(<WorkspaceView items={[{...workspaces[0],state:'verified',progress:100,nextAction:{label:'Открыть шаг',href:'#/onboarding/demo/steps/check'}}]}/>);
 expect(screen.getByText(/Все технические цели проверены/)).toBeVisible();expect(screen.getByRole('link')).toHaveAttribute('href','#/onboarding/demo/steps/check');
});
it('timeline distinguishes trusted verification, claims and invalidated evidence',()=>{
 const {rerender}=render(<TimelineView timeline={{...timeline,historyComplete:false,entries:[...timeline.entries,{...timeline.entries[0],id:'claim',source:'user',trusted:false},{...timeline.entries[0],id:'invalid',validity:'invalidated'}]}}/>);
 expect(screen.getByText(/История неполная/)).toBeVisible();expect(screen.getByText('Не является техническим доказательством')).toBeVisible();expect(screen.getByText('Подтверждение отозвано')).toBeVisible();
 rerender(<TimelineView timeline={{...timeline,entries:[]}}/>);expect(screen.getByText('Сведения о проверках недоступны')).toBeVisible();
});
it('impact uses provided aggregates, hides both sides/delta when suppressed and explains limitations',()=>{
 const {rerender}=render(<ImpactView comparison={impact}/>);expect(screen.getByText('60.0%')).toBeVisible();expect(screen.getByText('Разница: -40.0 п.п.')).toBeVisible();expect(screen.getByText(/причинный эффект не доказан/)).toBeVisible();
 rerender(<ImpactView comparison={{...impact,before:{version:1,eligible:null,affected:null,rate:null,suppressed:true},deltaPp:null}}/>);
 expect(screen.queryByText('20.0%')).not.toBeInTheDocument();expect(screen.queryByText(/Разница:/)).not.toBeInTheDocument();
 rerender(<ImpactView comparison={{...impact,synthetic:false,status:'insufficient_data',before:null,after:null,deltaPp:null}}/>);
 expect(screen.getByText('Недостаточно данных')).toBeVisible();expect(screen.queryByText(/Синтетические данные/)).not.toBeInTheDocument();
});
it('revision applies only selected changes and locks while request pending',async()=>{
 let finish!:()=>void;const apply=vi.fn(()=>new Promise<void>(r=>{finish=r;}));
 render(<RevisionView proposal={{...proposal,changes:[...proposal.changes,{...proposal.changes[0],id:'other',label:'Второе уточнение'}]}} onApply={apply} onDiscard={vi.fn()}/>);
 const button=screen.getByRole('button',{name:'Применить в черновик'});expect(button).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:proposal.changes[0].label}));fireEvent.click(button);expect(button).toBeDisabled();fireEvent.click(button);expect(apply).toHaveBeenCalledTimes(1);
 expect(apply).toHaveBeenCalledWith({proposalId:proposal.id,proposalRevision:1,expectedDraftRevision:null,selectedChangeIds:['format']});
 await act(async()=>{finish();});expect(screen.getByRole('alert')).toHaveTextContent('только в черновик');expect(button).toBeDisabled();
});
it('revision conflict preserves no success claim and allows explicit discard',async()=>{
 const discard=vi.fn().mockResolvedValue(undefined);const apply=vi.fn().mockRejectedValue(new Error('stale'));
 render(<RevisionView proposal={proposal} onApply={apply} onDiscard={discard}/>);
 const checkbox=screen.getByRole('checkbox');fireEvent.click(checkbox);fireEvent.click(checkbox);expect(screen.getByRole('button',{name:'Применить в черновик'})).toBeDisabled();fireEvent.click(checkbox);
 fireEvent.click(screen.getByRole('button',{name:'Применить в черновик'}));expect(await screen.findByRole('alert')).toHaveTextContent('Изменения не сохранены');
 fireEvent.click(screen.getByRole('button',{name:'Отклонить предложение'}));expect(await screen.findByText('Предложение отклонено.')).toBeVisible();expect(discard).toHaveBeenCalledTimes(1);
});
it.each(['needs_input','unavailable','generating','expired','applied_to_draft','discarded'] as const)('revision %s cannot apply',status=>{
 render(<RevisionView proposal={{...proposal,status,expiresAt:status==='expired'?'2000-01-01T00:00:00Z':proposal.expiresAt,questions:['Какой срок?'],origin:'unknown'}} onApply={vi.fn()} onDiscard={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'Применить в черновик'})).toBeDisabled();expect(screen.getByText('Какой срок?')).toBeVisible();
});
it('expiry between preview and click is checked again',async()=>{
 let now=Date.parse('2026-01-01T00:00:00Z');const apply=vi.fn();render(<RevisionView proposal={proposal} now={()=>now} onApply={apply} onDiscard={vi.fn()}/>);
 fireEvent.click(screen.getByRole('checkbox'));now=Date.parse('2100-01-01T00:00:00Z');fireEvent.click(screen.getByRole('button',{name:'Применить в черновик'}));expect(apply).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('устарело');
});
it('preview clearly labels examples and never writes to API',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch');render(<V4PreviewPage/>);
 expect(screen.getByText(/Синтетические примеры/)).toBeVisible();
 for(const name of ['Доказательства','Уточнение ТЗ','Наблюдения по версиям','Рабочий результат'])fireEvent.click(screen.getByRole('tab',{name}));
 fireEvent.change(screen.getByLabelText('Пример состояния'),{target:{value:'empty'}});expect(screen.getByText('Рабочих результатов пока нет')).toBeVisible();
 fireEvent.change(screen.getByLabelText('Пример состояния'),{target:{value:'unavailable'}});expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Уточнение ТЗ'}));fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Применить в черновик'}));expect(await screen.findByRole('alert')).toHaveTextContent('не сохранены');
 fireEvent.change(screen.getByLabelText('Пример состояния'),{target:{value:'needs_input'}});expect(screen.getByText('Какой точный срок сдачи?')).toBeVisible();
 fireEvent.click(screen.getByRole('tab',{name:'Наблюдения по версиям'}));fireEvent.change(screen.getByLabelText('Пример состояния'),{target:{value:'suppressed'}});expect(screen.queryByText('20.0%')).not.toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});
