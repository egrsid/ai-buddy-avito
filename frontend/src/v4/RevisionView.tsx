import { useRef, useState } from 'react';
import { Button, Card } from '../components/ui';
import type { ApplySelection, Proposal } from './models';
import { userMessage } from '../lib/api';
export function RevisionView({proposal:p,onApply,onDiscard,now=Date.now}:{proposal:Proposal;onApply:(body:ApplySelection)=>Promise<void>;onDiscard:()=>Promise<void>;now?:()=>number}) {
 const [selected,setSelected]=useState<string[]>([]);const [busy,setBusy]=useState(false);const lock=useRef(false);const [notice,setNotice]=useState('');const [done,setDone]=useState(false);
 const expired=Date.parse(p.expiresAt)<=now();
 const ready=p.status==='ready'&&!expired&&!done;
 async function mutate(discard=false) {
  if(lock.current)return;
  if(!discard&&(!ready||!selected.length||Date.parse(p.expiresAt)<=now())){setNotice('Предложение устарело. Получите новый preview.');return;}
  lock.current=true;setBusy(true);setNotice('');
  try {if(discard)await onDiscard();else await onApply({proposalId:p.id,proposalRevision:p.revision,expectedDraftRevision:p.draftRevision,selectedChangeIds:selected});setDone(true);setNotice(discard?'Предложение отклонено.':'Изменения сохранены только в черновик. Проверьте его и опубликуйте отдельно.');}
  catch(e){setNotice(userMessage(e,'Изменения не сохранены. Обновите предложение: версия или права могли измениться.'));}
  finally{lock.current=false;setBusy(false);}
 }
 return <Card><h2 className="text-lg font-semibold">Уточнение ТЗ · версия {p.baseVersion}</h2><p className="my-2 text-sm">Основание: {p.reportTitle}</p><p className="text-xs text-text-secondary">{p.origin==='primary'?'Основная модель':p.origin==='secondary'?'Резервная модель':p.origin==='offline'?'Шаблон без LLM':'Источник не подтверждён'}</p>
 <p role="status" className="my-3 text-sm">{expired?'Предложение устарело':p.status==='needs_input'?'Нужны уточнения автора':p.status==='generating'?'Предложение готовится':p.status==='unavailable'?'Предложение недоступно. Используйте ручной редактор.':p.status==='applied_to_draft'?'Уже применено к черновику':p.status==='discarded'?'Отклонено':'Выберите правки после проверки'}</p>
 <ul className="my-3 list-disc pl-5">{p.questions.map((q,i)=><li key={i}>{q}</li>)}</ul>
 <div className="space-y-4">{p.changes.map(c=><fieldset key={c.id} className="rounded-xl border border-border p-3"><legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(c.id)} disabled={!ready||busy} onChange={()=>setSelected(ids=>ids.includes(c.id)?ids.filter(id=>id!==c.id):[...ids,c.id])}/>{c.label}</label></legend><div className="grid gap-3 sm:grid-cols-2"><div><h3 className="text-xs text-text-secondary">Было</h3><p className="whitespace-pre-wrap break-words text-sm">{c.before}</p></div><div><h3 className="text-xs text-text-secondary">Предлагается</h3><p className="whitespace-pre-wrap break-words text-sm">{c.after}</p></div></div><p className="mt-2 text-xs text-text-secondary">Обоснование: {c.rationale}</p></fieldset>)}</div>
 <p className="my-3 text-xs text-text-secondary">Применение не публикует ТЗ и не меняет права, проверки или закреплённые версии стажёров.</p><div className="flex flex-wrap gap-2"><Button disabled={!ready||!selected.length||busy} onClick={()=>mutate()}>Применить в черновик</Button><Button variant="ghost" disabled={busy||done||['applied_to_draft','discarded'].includes(p.status)} onClick={()=>mutate(true)}>Отклонить предложение</Button></div>{notice&&<p role="alert" className="mt-3 text-sm">{notice}</p>}</Card>;
}
