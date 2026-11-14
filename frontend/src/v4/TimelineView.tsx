import { Card, EmptyState } from '../components/ui';
import type { Timeline } from './models';
const sources={workflow:'Процесс заявки',approver:'Решение согласующего',iam:'Проверка IAM',check:'Техническая проверка',user:'Слова пользователя',ai:'Гипотеза AI'};
export function TimelineView({timeline}:{timeline:Timeline}) {
 return <Card><h2 className="text-lg font-semibold">Почему такой статус?</h2><p className="my-3">Текущее состояние: {timeline.currentState}</p><p className="text-xs text-text-secondary">Данные на {timeline.asOf}</p>{!timeline.historyComplete&&<p role="status" className="my-3 text-sm">История неполная. Отсутствующие события не подтверждают выполнение.</p>}
 {!timeline.entries.length&&<EmptyState title="Сведения о проверках недоступны" message="Запустите разрешённую проверку на странице шага."/>}
 <ol className="mt-4 space-y-4">{timeline.entries.map(e=><li key={e.id} className="border-l-2 border-primary pl-4"><p className="font-medium">{e.label}</p><p className="text-sm text-text-secondary">{sources[e.source]} · {e.observedAt}</p><p className="text-xs">{e.validity==='invalidated'?'Подтверждение отозвано':e.trusted&&['workflow','approver','iam','check'].includes(e.source)?'Доверенное событие':'Не является техническим доказательством'}</p></li>)}</ol></Card>;
}
