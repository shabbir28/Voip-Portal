import React from 'react';
import { money } from '../utils/format.js';
export default function VendorSpendCards({ vendors, total }) {
  return (
    <div className="vendor-card-grid">
      {vendors.map((v) => (
        <div className="vendor-card" key={v.id}>
          <span className="vendor-monogram">{v.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <h4>{v.name}</h4>
            <strong>{money(v.total)}</strong>
          </div>
          <small>{total ? ((v.total / total) * 100).toFixed(1) : '0'}% of vendor spend</small>
          <div className="vendor-meter">
            <i style={{ width: `${total ? (v.total / total) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
