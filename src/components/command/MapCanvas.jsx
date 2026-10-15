import React from 'react';
import CompoundCard from './CompoundCard';
import OfficeNode from './OfficeNode';

const EAST = ['C', 'E'];

export default function MapCanvas() {
  return (
    <div className="map-canvas">
      <div className="spine-road" aria-hidden="true" />
      <div className="spine-label">
        <em>צפון</em>
        <strong>נוף כנרת</strong>
      </div>
      <div className="west-col">
        <CompoundCard compoundId="B" />
        <div className="west-lower">
          <CompoundCard compoundId="G" />
          <div className="west-mid">
            <CompoundCard compoundId="D" />
            <CompoundCard compoundId="F" />
            <OfficeNode />
          </div>
        </div>
      </div>
      <CompoundCard compoundId="A" />
      <div className="east-low">
        {EAST.map((id) => <CompoundCard key={id} compoundId={id} />)}
      </div>
    </div>
  );
}
