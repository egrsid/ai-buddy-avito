import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StatisticsPage } from './V3Statistics';
const read = vi.hoisted(() => vi.fn());
vi.mock('../lib/v3', () => ({read3:read}));
const response={as_of:'2026-11-14T12:00:00Z',timezone:'Europe/Moscow',summary:{affected_interns:null,observations:null,open_items:null,suppressed:true},rows:[{label:'Критерий задания',metrics:{affected_interns:null,observations:null,open_items:null},related_reports:[{id:'r',kind:'task_clarity_report'}]}],daily:[{date:'2026-11-14',affected_interns:null,observations:null}],next_cursor:null};
beforeEach(()=>read.mockReset());
it('renders suppression, no invented percentage, report navigation and source filters',async()=>{
 read.mockResolvedValue(response); render(<StatisticsPage />);
 expect(await screen.findByText('Критерий задания')).toBeVisible();
 expect(screen.getAllByText('Недостаточно данных').length).toBeGreaterThan(2);
 expect(screen.getByRole('link')).toHaveAttribute('href','#/mentor/reports/r');
 fireEvent.change(screen.getByLabelText('Источник'),{target:{value:'task_clarity'}});
 expect(await screen.findByText('Критерий задания')).toBeVisible();
 expect(read.mock.calls.at(-1)![0]).toContain('source=task_clarity');
 fireEvent.change(screen.getByLabelText('Период'),{target:{value:'7'}});
 expect(await screen.findByText('Критерий задания')).toBeVisible();
 expect(read.mock.calls.at(-1)![0]).toContain('days=7');
});
it('documentation uses its own scope, shows errors and retry empty',async()=>{
 read.mockRejectedValueOnce(new Error('down')).mockResolvedValue({...response,rows:[]});
 render(<StatisticsPage documentation />);
 fireEvent.click(await screen.findByRole('button',{name:'Повторить'}));
 expect(await screen.findByText('Нет наблюдений за период')).toBeVisible();
 expect(read.mock.calls.at(-1)![0]).toContain('/documentation');
 expect(screen.queryByLabelText('Источник')).not.toBeInTheDocument();
});
