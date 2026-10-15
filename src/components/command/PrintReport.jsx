import React from 'react';
import { COMPOUNDS, STATUS_LABEL, cabinsForPrint } from './model';
import { useCommand } from './commandStore';

export default function PrintReport() {
  const { cabins } = useCommand();
  const rows = cabinsForPrint(cabins);
  const today = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });

  return (
    <section className="print-only" dir="rtl">
      <h1>ResortOS - דוח תפעול יומי למתחם רמות</h1>
      <p>{today} · 28 יחידות · לתיק של צוקי</p>
      <table>
        <thead>
          <tr>
            <th>מתחם</th>
            <th>מספר בקתה</th>
            <th>סטטוס</th>
            <th>שעת פינוי</th>
            <th>נוקה ע״י</th>
            <th>נבדק ע״י</th>
            <th className="sign">חתימה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((cabin) => {
            const compound = COMPOUNDS[cabin.compoundId];
            return (
              <tr key={cabin.id}>
                <td>{compound.id} · {compound.name}</td>
                <td>{cabin.displayName}</td>
                <td>{cabin.holdLabel || STATUS_LABEL[cabin.status]}</td>
                <td>{cabin.vacatedAt || ''}</td>
                <td>{cabin.cleanedBy || cabin.cleanerName || ''}</td>
                <td>{cabin.inspectedBy || ''}</td>
                <td className="sign" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
