import React from 'react';
import { countsOf } from './model';
import { CommandProvider, useCommand } from './commandStore';
import HeaderBar from './HeaderBar';
import MapCanvas from './MapCanvas';
import DetailDrawer from './DetailDrawer';
import PrintReport from './PrintReport';
import './command.css';

function AlertBar() {
  const { cabins } = useCommand();
  const alerts = cabins.filter((cabin) => cabin.status === 'alert');
  if (!alerts.length) return null;
  const label = alerts.map((cabin) => `${cabin.displayName}`).join(', ');
  return <div className="noc-alert-bar">התראת עשן / VOC · בקתות מאיה · {label}</div>;
}

function DemoCorner() {
  const { isDemoActive, toggleDemo } = useCommand();
  if (isDemoActive) {
    return <button type="button" className="demo-badge" onClick={toggleDemo}>DEMO ACTIVE</button>;
  }
  return <button type="button" className="demo-toggle" onClick={toggleDemo} title="מקש D">הדגמה</button>;
}

function Screen({ theme = 'dark' }) {
  const { isDemoActive, cabins, turnoverOnly } = useCommand();
  const hot = countsOf(cabins).alert > 0;
  const light = theme === 'light';
  return (
    <div className={`noc-root${isDemoActive ? ' is-demo' : ''}${light ? ' is-light' : ''}${turnoverOnly ? ' is-turnover-filter' : ''}`} dir="rtl">
      <div className="noc-live no-print">
        <HeaderBar />
        {hot ? <AlertBar /> : null}
        <MapCanvas />
        <DetailDrawer />
        <DemoCorner />
      </div>
      <PrintReport />
    </div>
  );
}

export default function CommandCenter({ operatorName = 'צוות', theme = 'dark', tenantId = '' }) {
  return (
    <CommandProvider operatorName={operatorName} theme={theme} tenantId={tenantId}>
      <Screen theme={theme} />
    </CommandProvider>
  );
}
