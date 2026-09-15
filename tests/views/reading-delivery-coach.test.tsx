import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ReadingDeliveryCoach from '../../src/components/ReadingDeliveryCoach';
import { buildDeliveryCoaching } from '../../src/lib/readingCoaching';

it('keeps suggested exercises distinct from evidence and plays unchanged reference text', () => {
  const sentence = 'Partitioning groups data, so queries scan fewer rows and finish sooner.';
  const listen = vi.fn();
  render(<ReadingDeliveryCoach reference={sentence} feedback={{improvements:['Try a slower finish.']}} onListen={listen} />);
  expect(screen.getByText(/not a claim that this sentence was spoken incorrectly/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Hear an example sentence'}));
  expect(listen).toHaveBeenCalledWith(sentence);
  fireEvent.click(screen.getByRole('button', {name:'Emphasise Partitioning'}));
  expect(screen.getByRole('button', {name:'Emphasise Partitioning'})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button', {name:'Hide reading guidance'}));
  expect(screen.getByText(sentence)).toBeInTheDocument();
  expect(screen.queryByRole('button', {name:'Emphasise Partitioning'})).not.toBeInTheDocument();
});
it('supports legacy reports without inventing a reference from the transcript', () => {
  render(<ReadingDeliveryCoach feedback={{transcript:'Unverified sentence'}} />);
  expect(screen.queryByText('Unverified sentence')).not.toBeInTheDocument();
  expect(screen.getByText(/next report/)).toBeInTheDocument();
  expect(buildDeliveryCoaching('')).toBeUndefined();
});
it('uses the saved reference exercise and requires an explicit full passage retry', () => {
  const repeat=vi.fn();
  render(<ReadingDeliveryCoach feedback={{delivery_coaching:buildDeliveryCoaching('Saved reference.')}} reference="Changed reference." onRepeat={repeat} />);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(repeat).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Record the full passage again'}));
  expect(repeat).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/not separately recorded or scored/)).toBeInTheDocument();
});
