import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { buildRevisionQueue } from '../../src/lib/readingRevision';
import ReadingRevisionQueue from '../../src/components/ReadingRevisionQueue';
const passages=Array.from({length:12},(_,i)=>({id:i+1,question:`Passage ${i+1}`,ideal_answer:'Queue workers process messages.',category:'Python',role:'Engineer',company:''}));
const attempt=(id:number,content_id:number,words:string[])=>({id,content_id,created_at:`2026-09-${String(id).padStart(2,'0')}T12:00:00Z`,feedback:{missed_words:words},question_ref:'Saved question'} as any);
it('uses only latest feedback per stable accessible passage and deduplicates flags',()=>{
  const items=buildRevisionQueue([attempt(1,1,['Queue']),attempt(2,1,[]),attempt(3,2,['Queue','queue','obsolete']),attempt(4,99,['workers']),attempt(5,0,['messages'])],passages);
  expect(items[0].passage.id).toBe(2);
  expect(items[0].words).toEqual(['Queue']);
  expect(items.find(i=>i.passage.id===1)?.kind).toBe('refresh');
  expect(items).toHaveLength(12);
  expect(items.some(i=>i.passage.id===99)).toBe(false);
  expect(buildRevisionQueue([],[])).toEqual([]);
});
it('prioritises feedback and older readings without comparing scores across providers',()=>{
  const items=buildRevisionQueue([attempt(3,1,['Queue']),attempt(1,2,['workers'])],passages);
  expect(items.slice(0,2).map(i=>i.passage.id)).toEqual([2,1]);
});
it('searches every queue item, resets pagination and links to the correct report',()=>{
  render(<MemoryRouter><ReadingRevisionQueue attempts={[attempt(1,12,['messages'])]} passages={passages}/></MemoryRouter>);
  expect(screen.getByRole('link',{name:'View source report'})).toHaveAttribute('href','/reading/reports/1');
  fireEvent.click(screen.getByRole('button',{name:'Next'}));
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'messages'}});
  expect(screen.getByText('Passage 12')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1–1 of 1 exercises');
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'notfound'}});
  expect(screen.getByText('No matching exercises. Clear your filters to see your queue.')).toBeInTheDocument();
});
