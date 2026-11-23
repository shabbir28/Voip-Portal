import React from 'react';
import { Radio } from 'lucide-react';
import { money } from '../utils/format.js';
export default function CampaignSpendCards({ groups, dialers, total }) {
  return (
    <section className="campaign-kpis">
      <div className="section-caption">
        <span>CAMPAIGN SPEND</span>
        <small>Selected date range · USD</small>
      </div>
      <div className="campaign-kpi-grid">
        {groups.map((g) => {
          const rows = dialers.filter((d) => d.campaign_id === g.id),
            amount = rows.reduce((n, d) => n + Math.round(d.total * 100), 0) / 100;
          return (
            <article className="campaign-kpi" key={g.id} style={{ '--accent': g.color }}>
              <div className="campaign-kpi-heading">
                <span className="campaign-kpi-icon">
                  <Radio size={15} />
                </span>
                <h3>{g.name}</h3>
                <small>{total ? ((amount / total) * 100).toFixed(1) : 0}%</small>
              </div>
              <strong>{money(amount)}</strong>
              <div className="campaign-kpi-foot">
                <span>{rows.length} reporting dialers</span>
                <div>
                  <i style={{ width: `${total ? (amount / total) * 100 : 0}%` }} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
