import React from 'react';
export default function Kpi({ title, value, icon: Icon, color, detail, badge }) {
  return (
    <section className="kpi">
      <div className="kpi-top">
        <span className={`kpi-icon ${color}`}>
          <Icon size={20} />
        </span>
        <span className="kpi-badge">{badge}</span>
      </div>
      <p>{title}</p>
      <strong>{value}</strong>
      <div className="kpi-detail">{detail}</div>
    </section>
  );
}
