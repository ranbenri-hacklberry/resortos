import React from 'react';
import { ArrowLeftRight, LogOut, Sparkles } from 'lucide-react';
import { lockboxCodeForUnit } from '../../lib/guestProfileSeed';
import { useCommand } from './commandStore';
import { CARD_STATUS } from './roomWorkflow';

const TASK_ICON = {
  turnover: ArrowLeftRight,
  clean: Sparkles,
  depart: LogOut,
};

export default function CabinNode({ cabin }) {
  const { selectedId, selectCabin } = useCommand();
  const code = lockboxCodeForUnit({ id: cabin.id });
  const TaskIcon = cabin.task ? TASK_ICON[cabin.task.kind] : null;
  const statusLabel = cabin.holdLabel || CARD_STATUS[cabin.status] || '';
  return (
    <button
      type="button"
      className={`cabin-node slot-${cabin.cabinNumber}${selectedId === cabin.id ? ' is-selected' : ''}`}
      data-status={cabin.status}
      data-task={cabin.task?.kind || ''}
      onClick={() => selectCabin(cabin.id)}
    >
      <strong>{cabin.cabinNumber}</strong>
      {code ? <em className="cabin-code">{code}</em> : null}
      {statusLabel ? <em className={cabin.holdLabel ? 'cabin-hold' : 'cabin-state'}>{statusLabel}</em> : null}
      {cabin.task && TaskIcon ? (
        <span className="cabin-task">
          <TaskIcon size={11} aria-hidden="true" />
          <span>
            {cabin.task.label}
            {cabin.task.deadline?.startsWith('מוכן עד ')
              ? ` · ${cabin.task.deadline.replace('מוכן עד ', '')}`
              : ''}
          </span>
        </span>
      ) : null}
    </button>
  );
}
