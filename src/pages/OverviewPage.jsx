import React, { useState } from 'react';
import {
  DollarSign,
  Radio,
  FileSpreadsheet,
  CheckCheck,
  ArrowRight,
  BarChart3,
  LoaderCircle,
} from 'lucide-react';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Kpi from '../components/Kpi.jsx';
import CampaignSpendCards from '../components/CampaignSpendCards.jsx';
import Filter from '../components/ReportFilters.jsx';
import { aggregateReports } from '../utils/reports.js';
import { money, prettyDate } from '../utils/format.js';
export default function OverviewPage({ reports, loading, range, onOpen, catalog, vendorOverview }) {
  const [campaign, setCampaign] = useState('all'),
    [search, setSearch] = useState('');
  if (loading)
    return (
      <div className="loading-line">
        <LoaderCircle className="spin" size={17} /> Loading date-range insights…
      </div>
    );
  const s = aggregateReports(reports),
    groups = [
      ...new Map(
        s.dialers.map((d) => [
          d.campaign_id,
          { id: d.campaign_id, name: d.campaign, color: d.color },
        ]),
      ).values(),
    ];
  const cardGroups = [
    ...new Map([...(catalog?.campaigns || []), ...groups].map((g) => [g.id, g])).values(),
  ];
  const filtered = s.dialers.filter(
    (d) =>
      (campaign === 'all' || String(d.campaign_id) === campaign) &&
      d.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="kpi-grid">
        <Kpi
          title="VoIP spend"
          value={money(s.total)}
          icon={DollarSign}
          color="purple"
          badge="USD"
          detail={`${range.from} — ${range.to}`}
        />
        <Kpi
          title="Reporting dialers"
          value={s.dialers.length}
          icon={Radio}
          color="teal"
          badge="DIALERS"
          detail={`${groups.length} campaigns in this range`}
        />
        <Kpi
          title="Daily reports"
          value={s.reportCount}
          icon={FileSpreadsheet}
          color="blue"
          badge="REPORTS"
          detail="All reports in selected dates"
        />
        <Kpi
          title="Entries completed"
          value={`${s.expected ? Math.round((s.entered / s.expected) * 100) : 0}%`}
          icon={CheckCheck}
          color="amber"
          badge="PROGRESS"
          detail={`${s.entered} of ${s.expected} interval entries`}
        />
      </div>
      <CampaignSpendCards groups={cardGroups} dialers={s.dialers} total={s.total} />
      {vendorOverview}
      {!reports.length ? (
        <section className="panel range-empty">
          <CalendarEmpty />
          <h3>No reports for these dates</h3>
          <p>Choose another range or create a new daily report.</p>
        </section>
      ) : (
        <>
          <div className="charts-grid">
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h3>Daily VoIP spend</h3>
                  <p>All selected reports, grouped by shift start date</p>
                </div>
                <span className="chart-legend">
                  <i /> USD
                </span>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.days} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="rangeSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7655df" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#7655df" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#dbe1eb" strokeDasharray="3 5" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => d.slice(5)}
                      tick={{ fontSize: 10, fill: '#63718a' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fontSize: 10, fill: '#63718a' }}
                      width={55}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v) => [money(v), 'Spend']}
                      labelFormatter={prettyDate}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="#8063d6" maxBarSize={48} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-footer">
                <span>Saved entries · US Eastern (EST/EDT)</span>
                <span>{s.days.length} reporting days</span>
              </div>
            </section>
            <section className="panel campaign-panel">
              <div className="panel-heading">
                <div>
                  <h3>Campaign breakdown</h3>
                  <p>Spend within selected dates</p>
                </div>
                <BarChart3 size={17} />
              </div>
              <div className="campaign-list">
                {groups.map((g) => {
                  const total =
                    s.dialers
                      .filter((d) => d.campaign_id === g.id)
                      .reduce((n, d) => n + Math.round(d.total * 100), 0) / 100;
                  const percent = s.total ? (total / s.total) * 100 : 0;
                  return (
                    <div className="campaign-meter" key={g.id}>
                      <div>
                        <span>
                          <i style={{ background: g.color }} />
                          {g.name}
                        </span>
                        <b>
                          {money(total)} <small>{Math.round(percent)}%</small>
                        </b>
                      </div>
                      <div className="meter-track">
                        <i style={{ width: `${percent}%`, background: g.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="campaign-total">
                <span>Total spend</span>
                <b>{money(s.total)}</b>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>
                  Dialer performance <span className="count-chip">{s.dialers.length}</span>
                </h3>
                <p>Combined across the selected date range</p>
              </div>
            </div>
            <Filter {...{ campaign, setCampaign, search, setSearch, groups }} />
            <div className="table-wrap">
              <table className="performance-table">
                <thead>
                  <tr>
                    <th>Dialer</th>
                    <th>Campaign</th>
                    <th>VoIP spend</th>
                    <th>Spend share</th>
                    <th>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span className="dialer-cell">
                          <span className="dialer-icon">
                            <Radio size={14} />
                          </span>
                          <b>{d.name}</b>
                        </span>
                      </td>
                      <td>
                        <span className="campaign-badge" style={{ '--campaign-color': d.color }}>
                          {d.campaign}
                        </span>
                      </td>
                      <td className="amount">{money(d.total)}</td>
                      <td>
                        <div className="share-cell">
                          <div className="meter-track">
                            <i style={{ width: `${s.total ? (d.total / s.total) * 100 : 0}%` }} />
                          </div>
                          <span>{s.total ? ((d.total / s.total) * 100).toFixed(1) : 0}%</span>
                        </div>
                      </td>
                      <td>
                        {d.completed}
                        <span className="muted"> / {d.expected}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <div className="small-empty">No dialers match these filters.</div>
              )}
            </div>
          </section>
          <section className="panel range-reports">
            <div className="panel-heading">
              <div>
                <h3>Reports in this range</h3>
                <p>Open a report to edit entries or download its spreadsheet</p>
              </div>
              <span className="count-chip">{reports.length}</span>
            </div>
            {reports.map((r) => (
              <button className="report-list-row" key={r.id} onClick={() => onOpen(r.id)}>
                <span className="report-list-icon">
                  <FileSpreadsheet size={16} />
                </span>
                <span>
                  <b>{r.name}</b>
                  <small>
                    {prettyDate(r.report_date)} · {r.config.dialers.length} dialers
                  </small>
                </span>
                <span className="report-list-total">
                  {money(
                    r.entries.reduce((n, e) => n + Math.round(Number(e.amount) * 100), 0) / 100,
                  )}
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </section>
        </>
      )}
    </>
  );
}
function CalendarEmpty() {
  return <FileSpreadsheet size={28} />;
}
