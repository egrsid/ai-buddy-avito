import { useState } from 'react';
import { Button, Card, EmptyState } from '../components/ui';
import type { Workspace } from './models';
export function WorkspaceView({items}:{items:Workspace[]}) {
 const [expanded,setExpanded]=useState<string[]>([]);
 if(!items.length) return <EmptyState title="Рабочих результатов пока нет" message="Назначенные ТЗ и разрешённые цели появятся здесь."/>;
 return <div className="space-y-4">{items.every(x=>x.state==='verified')&&<Card>Все технические цели проверены. Поздравляем! Приёмка результата ТЗ ведётся отдельно.</Card>}{items.map(w=><Card key={w.id}>
 <h2 className="text-lg font-semibold">{w.title}</h2><p className="my-2 text-sm">Техническая готовность: {w.state==='unavailable'?'Сведения недоступны':w.state==='verified'?'Проверено':w.state==='blocked'?'Есть препятствие':'Требуется проверка'}</p>
 <p className="text-sm text-text-secondary">{w.briefVersion?`ТЗ: закреплена версия ${w.briefVersion}`:'ТЗ не связано с целью'} · Приёмка результата автоматически не выполняется</p>
 {w.state!=='unavailable'&&<div className="my-3 h-2 rounded bg-surface-muted" role="progressbar" aria-label={`Технический прогресс: ${w.title}`} aria-valuenow={w.progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded bg-primary" style={{width:`${w.progress}%`}}/></div>}
 {w.blocker&&<p className="my-3 rounded-xl bg-red-50 p-3 text-sm">{w.blocker}</p>}
 <Button variant="secondary" ariaExpanded={expanded.includes(w.id)} ariaControls={`work-${w.id}`} onClick={()=>setExpanded(ids=>ids.includes(w.id)?ids.filter(id=>id!==w.id):[...ids,w.id])}>Подзадачи: {w.title}</Button>
 {expanded.includes(w.id)&&<ul id={`work-${w.id}`} className="my-3 space-y-2">{w.steps.map(s=><li key={s.id} className="text-sm">{s.title} · {s.state}</li>)}</ul>}
 {w.state!=='unavailable'&&w.nextAction&&<a className="mt-3 block text-sm font-medium text-primary underline" href={w.nextAction.href}>{w.nextAction.label}</a>}
 </Card>)}</div>;
}
