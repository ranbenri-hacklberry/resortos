import { describe, expect, it } from 'vitest';
import {
  dirtyFieldLabel,
  shouldBlockLeave,
  unsavedLeaveCopy,
  UNSAVED_LEAVE_ACTIONS
} from './priorityUnsavedGuard.js';

describe('priorityUnsavedGuard', () => {
  it('blocks leave only when there are dirty changes', () => {
    expect(shouldBlockLeave(0)).toBe(false);
    expect(shouldBlockLeave(2)).toBe(true);
  });

  it('marks dirty field labels with an asterisk', () => {
    expect(dirtyFieldLabel('סטטוס', false)).toBe('סטטוס');
    expect(dirtyFieldLabel('סטטוס', true)).toBe('סטטוס *');
    expect(dirtyFieldLabel('סטטוס *', true)).toBe('סטטוס *');
  });

  it('exposes Priority-styled leave actions', () => {
    const copy = unsavedLeaveCopy();
    expect(copy.title).toMatch(/שינויים/);
    expect(UNSAVED_LEAVE_ACTIONS.SAVE).toBe('save');
    expect(UNSAVED_LEAVE_ACTIONS.DISCARD).toBe('discard');
    expect(UNSAVED_LEAVE_ACTIONS.STAY).toBe('stay');
  });
});
