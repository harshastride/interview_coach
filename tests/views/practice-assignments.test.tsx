import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,expect,it,vi} from 'vitest';
import PracticeAssignments from '../../src/components/PracticeAssignments';
import {apiGet,apiPost} from '../../src/lib/api';
vi.mock('../../src/lib/api',()=>({apiGet:vi.fn(),apiPost:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
const assignment={id:1,content_id:2,question:'Read queues',note:'Pause between sentences.',status:'pending',available:true,created_at:'2026-09-15T00:00:00Z',assigned_by_name:'Coach',completed_attempt_id:null};
it('shows an available assignment and links completed practice to its report',async()=>{
 vi.mocked(apiGet).mockImplementation(async (url) => ({total:1,pageSize:5,assignments:url.includes('status=completed')?[{...assignment,id:2,status:'completed',completed_attempt_id:9}]:[assignment]}) as any);
 render(<MemoryRouter><PracticeAssignments passages={[{id:2,question:'Read queues',ideal_answer:'Queues buffer events.',role:'Engineer',category:'Python',company:''}]}/></MemoryRouter>);
 expect(await screen.findByRole('link',{name:'Start assigned practice'})).toHaveAttribute('href','/interview/session');
 expect(screen.getByText('Pause between sentences.')).toBeInTheDocument();
 fireEvent.change(screen.getByRole('combobox',{name:'Assignment status'}),{target:{value:'completed'}});
 expect(await screen.findByRole('link',{name:'View completed reading'})).toHaveAttribute('href','/reading/reports/9');
});
it('offers recovery on load error and does not start an unavailable assignment',async()=>{
 vi.mocked(apiGet).mockRejectedValueOnce(Error('Unavailable')).mockResolvedValue({assignments:[{...assignment,available:false}]});
 render(<MemoryRouter><PracticeAssignments/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Try again'}));
 await screen.findByText('Pending · unavailable');
 expect(screen.queryByRole('link',{name:'Start assigned practice'})).not.toBeInTheDocument();
});

it('home shows one assignment without management filters',async()=>{
 vi.mocked(apiGet).mockResolvedValue({assignments:[assignment],total:40,pageSize:1});
 render(<MemoryRouter><PracticeAssignments compact/></MemoryRouter>);
 await screen.findByText('Read queues');
 expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
 expect(screen.getByRole('link',{name:'View all assignments →'})).toHaveAttribute('href','/reading/assignments');
 expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('pageSize=1'));
});
it('retries the failed mutation rather than just reloading',async()=>{
 vi.mocked(apiGet).mockResolvedValue({assignments:[assignment],total:1,pageSize:5,passages:[],candidate:{domain_name:'Python'}});
 vi.mocked(apiPost).mockRejectedValueOnce(Error('Network error')).mockResolvedValue({ok:true});
 render(<MemoryRouter><PracticeAssignments staffCandidateId={42}/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Cancel assignment'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retry failed action'}));
 await screen.findByText('Assignment updated.');
 expect(apiPost).toHaveBeenNthCalledWith(1,'/api/staff/assignments/1/cancel',{});
 expect(apiPost).toHaveBeenNthCalledWith(2,'/api/staff/assignments/1/cancel',{});
});
