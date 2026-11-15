import { Card } from '../components/ui';
import type { Impact } from './models';
const labels={collecting:'Наблюдения собираются',available:'Наблюдения по версиям',insufficient_data:'Недостаточно данных',not_comparable:'Версии нельзя сопоставить'};
export function ImpactView({comparison:c}:{comparison:Impact}) {
 const available=c.status==='available';
 const visible=available&&c.before&&!c.before.suppressed&&c.after&&!c.after.suppressed;
 return <Card><h2 className="text-lg font-semibold">{labels[c.status]}</h2>{c.synthetic&&<p className="my-2 font-medium text-primary">Синтетические данные · тестовые часы</p>}<p className="my-2 text-xs text-text-secondary">Окно наблюдения: {c.windowDays} суток · политика {c.policyRevision} · данные на {c.asOf}</p>
 {available&&<div className="my-4 grid gap-3 sm:grid-cols-2">{[c.before,c.after].map((cell,i)=><div key={i} className="rounded-xl bg-surface-muted p-4"><h3 className="font-medium">{i===0?'До':'После'} · версия {cell?.version??'—'}</h3>{!visible?<p>Недостаточно данных для раскрытия чисел</p>:<><p>Участников: {cell!.eligible}; отметили неясность: {cell!.affected}</p><p className="text-xl font-semibold text-primary">{((cell!.rate??0)*100).toFixed(1)}%</p></>}</div>)}</div>}
 {visible&&c.deltaPp!==null&&<p className="my-3 font-medium">Разница: {c.deltaPp.toFixed(1)} п.п.</p>}
 <p className="text-sm">Описательное сравнение. Различия групп могли повлиять на результат; причинный эффект не доказан.</p><ul className="mt-3 list-disc pl-5 text-xs text-text-secondary">{c.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul></Card>;
}
