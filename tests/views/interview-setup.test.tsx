import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import InterviewSetup from '../../src/views/InterviewSetup';
vi.mock('../../src/hooks/useAuth',()=>({useAuth:()=>({handleLogout:vi.fn()})}));
vi.mock('../../src/components/GlobalNav',()=>({AppLayout:({children}:any)=><>{children}</>}));
vi.mock('../../src/views/shared',()=>({HeaderRightSlot:()=>null,useBottomNav:()=>({})}));
vi.mock('../../src/components/AdminPanel',()=>({default:()=>null}));
const passages=Array.from({length:12},(_,i)=>({id:i+1,question:`Question ${i+1}`,ideal_answer:'Read this short passage.',role:'Engineer',company:'',category:i===11?'Java':'Python'}));
function Destination(){const {state}=useLocation();return <p>Session contains {state.sessionQuestions.length}: {state.sessionQuestions[0].question}</p>;}
it('searches beyond the first page and starts the selected single passage',()=>{
  render(<MemoryRouter><Routes><Route path="/" element={<InterviewSetup uploadedInterviewRaw={passages} currentUser={null} onContentRefresh={()=>{}}/>}/><Route path="/interview/session" element={<Destination/>}/></Routes></MemoryRouter>);
  expect(screen.queryByText('Question 12')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Question 12'}});
  expect(screen.getByText('Question 12')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Continue to microphone check'}));
  expect(screen.getByText('Session contains 1: Question 12')).toBeInTheDocument();
});
it('limits a full session to ten matching passages and handles no matches',()=>{
  render(<MemoryRouter><Routes><Route path="/" element={<InterviewSetup uploadedInterviewRaw={passages} currentUser={null} onContentRefresh={()=>{}}/>}/><Route path="/interview/session" element={<Destination/>}/></Routes></MemoryRouter>);
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'missing'}});
  expect(screen.getByRole('button',{name:'Continue to microphone check'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));
  fireEvent.click(screen.getByRole('radio',{name:/Full session/}));
  fireEvent.click(screen.getByRole('button',{name:'Continue to microphone check'}));
  expect(screen.getByText('Session contains 10: Question 1')).toBeInTheDocument();
});
