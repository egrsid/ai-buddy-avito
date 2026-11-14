import { useState } from 'react';
import { Card, PageHeader } from '../components/ui';
import { WorkspaceView } from './WorkspaceView';
import { TimelineView } from './TimelineView';
import { RevisionView } from './RevisionView';
import { ImpactView } from './ImpactView';
import { workspaces, timeline, proposal, impact } from './samples';
export function V4PreviewPage() {
 const [tab,setTab]=useState('workspace');const [state,setState]=useState('data');
 return <><PageHeader title="V4 · прототип интерфейса" subtitle="Синтетические примеры. Сервер v4 и контрактный gate пока не готовы. Действия здесь не меняют данные проекта."/><Card><div className="flex flex-wrap gap-2" role="tablist" aria-label="Экраны v4">{[['workspace','Рабочий результат'],['proof','Доказательства'],['editor','Уточнение ТЗ'],['impact','Наблюдения по версиям']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} className={`rounded-xl px-3 py-2 text-sm ${tab===id?'bg-primary text-white':'bg-surface-muted'}`} onClick={()=>{setTab(id);setState('data');}}>{label}</button>)}</div><label className="mt-3 block text-sm">Пример состояния<select className="ml-2 rounded-xl border border-border p-2" value={state} onChange={e=>setState(e.target.value)}>{['data','empty','unavailable','needs_input','suppressed','expired'].map(x=><option key={x}>{x}</option>)}</select></label></Card><div className="mt-4" key={`${tab}:${state}`}>
 {tab==='workspace'&&<WorkspaceView items={state==='empty'?[]:state==='unavailable'?workspaces.map(w=>({...w,state:'unavailable',blocker:null,steps:[],nextAction:null})):workspaces}/>}
 {tab==='proof'&&<TimelineView timeline={state==='empty'?{...timeline,entries:[],historyComplete:false}:timeline}/>}
 {tab==='editor'&&<RevisionView proposal={{...proposal,status:state==='needs_input'?'needs_input':state==='unavailable'?'unavailable':'ready',questions:state==='needs_input'?['Какой точный срок сдачи?']:[],expiresAt:state==='expired'?'2000-01-01T00:00:00Z':proposal.expiresAt}} onApply={async()=>{throw Error('preview-only');}} onDiscard={async()=>{throw Error('preview-only');}}/>}
 {tab==='impact'&&<ImpactView comparison={state==='empty'?{...impact,status:'collecting',before:null,after:null,deltaPp:null}:state==='suppressed'?{...impact,before:{version:1,eligible:null,affected:null,rate:null,suppressed:true},deltaPp:null}:impact}/>}
 </div><p className="mt-4 text-xs text-text-secondary">Live v3 продолжает работать в обычных разделах. Этот прототип не выполняет API-вызовы и не подтверждает ACL сервера.</p></>;
}
