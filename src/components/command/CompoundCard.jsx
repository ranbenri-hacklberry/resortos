import React from 'react';
import { COMPOUNDS } from './model';
import CabinNode from './CabinNode';
import { useCommand } from './commandStore';

function PoolTile({ className = '' }) {
  return <div className={`pool-tile ${className}`.trim()} aria-hidden="true" />;
}

export default function CompoundCard({ compoundId }) {
  const compound = COMPOUNDS[compoundId];
  const { cabins } = useCommand();
  const rows = cabins.filter((cabin) => cabin.compoundId === compoundId);
  const ordered = compoundId === 'A' || compoundId === 'B'
    ? [...rows].sort((a, b) => b.cabinNumber - a.cabinNumber)
    : rows;

  return (
    <section className={`compound-card place-${compoundId} layout-${compoundId}`}>
      <div className="compound-head">
        <h2>
          <span className="compound-letter">{compound.id}</span>
          {compound.name}
        </h2>
        <p>{compound.street}</p>
      </div>
      <div className="cabin-stage">
        {compoundId === 'B' ? (
          <div className="pool-stack">
            <PoolTile />
            <PoolTile />
          </div>
        ) : null}
        {compoundId === 'F' ? (
          <div className="maya-stack">
            {[3, 2, 1].map((number) => {
              const cabin = ordered.find((row) => row.cabinNumber === number);
              if (!cabin) return null;
              const pool = number === 1 || number === 3;
              return (
                <div key={cabin.id} className={`maya-line${pool ? '' : ' solo'}`}>
                  {pool ? <PoolTile /> : null}
                  <CabinNode cabin={cabin} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cabin-stack">
            {ordered.map((cabin) => <CabinNode key={cabin.id} cabin={cabin} />)}
          </div>
        )}
      </div>
    </section>
  );
}
