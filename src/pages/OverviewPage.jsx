import React, { useState } from 'react';
import {
  DollarSign,
  Radio,
  FileSpreadsheet,
  CheckCheck,
  ArrowRight,
  BarChart3,
  LoaderCircle,
  Users,
  User,
  TrendingUp,
  Award,
} from 'lucide-react';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Kpi from '../components/Kpi.jsx';
import CampaignSpendCards from '../components/CampaignSpendCards.jsx';
import Filter from '../components/ReportFilters.jsx';
import { aggregateReports } from '../utils/reports.js';
import { money, prettyDate } from '../utils/format.js';
export default function OverviewPage({
  reports = [],
  allReports = [],
  isSuperAdmin = false,
  scope = 'all',
  onScopeChange,
  loading,
  range,
  onOpen,
  catalog,
  vendorOverview,
}) {
  const [campaign, setCampaign] = useState('all'),
    [search, setSearch] = useState('');
  if (loading)
    return (
      <div className="loading-line">
        <LoaderCircle className="spin" size={17} /> Loading date-range insights…
      </div>
    );
  const activeReports = isSuperAdmin && scope === 'all' ? allReports : reports;
  const s = aggregateReports(activeReports),
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

  const activeDays = s.days.length;
  const dailyAverage = activeDays > 0 ? s.total / activeDays : 0;
  const campaignTotals = groups
    .map((g) => {
      const amount =
        s.dialers
          .filter((d) => d.campaign_id === g.id)
          .reduce((n, d) => n + Math.round(d.total * 100), 0) / 100;
      return { ...g, amount };
    })
    .sort((a, b) => b.amount - a.amount);
  const topCampaign = campaignTotals[0];
  const topPercent =
    s.total && topCampaign?.amount ? Math.round((topCampaign.amount / s.total) * 100) : 0;

  return (
    <>
      {isSuperAdmin && (
        <div className="overview-scope-banner">
          <div className="scope-info">
            <span className="scope-badge">
              <Users size={14} /> SUPER ADMIN
            </span>
            <div>
              <h3>{scope === 'all' ? 'All Admins Overview (Combined)' : 'My Reports Overview'}</h3>
              <p>
                {scope === 'all'
                  ? 'Showing total VoIP spend, campaign breakdown, and vendor costs added by all admins'
                  : 'Showing only reports created by your account'}
              </p>
            </div>
          </div>
          <div className="scope-toggle">
            <button
              type="button"
              className={scope === 'all' ? 'active' : ''}
              onClick={() => onScopeChange?.('all')}
            >
              <Users size={14} /> All Admins ({allReports.length})
            </button>
            <button
              type="button"
              className={scope === 'mine' ? 'active' : ''}
              onClick={() => onScopeChange?.('mine')}
            >
              <User size={14} /> My Reports ({reports.length})
            </button>
          </div>
        </div>
      )}
      <div className="kpi-grid">
        <Kpi
          title={isSuperAdmin && scope === 'all' ? 'Overall VoIP spend' : 'VoIP spend'}
          value={money(s.total)}
          icon={DollarSign}
          color="purple"
          badge="USD"
          detail={
            isSuperAdmin && scope === 'all'
              ? `All admins · ${range.from} — ${range.to}`
              : `${range.from} — ${range.to}`
          }
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
          title="Daily average spend"
          value={money(dailyAverage)}
          icon={TrendingUp}
          color="blue"
          badge="DAILY AVG"
          detail={
            activeDays > 0
              ? `Across ${activeDays} reporting ${activeDays === 1 ? 'day' : 'days'}`
              : 'No reporting days'
          }
        />
        <Kpi
          title="Top campaign"
          value={topCampaign && topCampaign.amount > 0 ? topCampaign.name : '—'}
          icon={Award}
          color="amber"
          badge={topCampaign && topCampaign.amount > 0 ? `${topPercent}% SHARE` : 'CAMPAIGN'}
          detail={
            topCampaign && topCampaign.amount > 0
              ? `${money(topCampaign.amount)} VoIP spend`
              : 'No campaign spend yet'
          }
        />
      </div>
      <CampaignSpendCards groups={cardGroups} dialers={s.dialers} total={s.total} />
      {vendorOverview}
      {!activeReports.length ? (
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
                  <h3>
                    {isSuperAdmin && scope === 'all'
                      ? 'Overall daily VoIP spend'
                      : 'Daily VoIP spend'}
                  </h3>
                  <p>
                    {isSuperAdmin && scope === 'all'
                      ? 'Combined spend across all admins, grouped by date'
                      : 'All selected reports, grouped by shift start date'}
                  </p>
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
                <h3>
                  {isSuperAdmin && scope === 'all'
                    ? 'All reports in this range'
                    : 'Reports in this range'}
                </h3>
                <p>Open a report to edit entries or download its spreadsheet</p>
              </div>
              <span className="count-chip">{activeReports.length}</span>
            </div>
            {activeReports.map((r) => (
              <button className="report-list-row" key={r.id} onClick={() => onOpen(r.id)}>
                <span className="report-list-icon">
                  <FileSpreadsheet size={16} />
                </span>
                <span>
                  <b>{r.name}</b>
                  <small>
                    {prettyDate(r.report_date)} · {r.config.dialers.length} dialers
                    {r.creator_name && (
                      <span className="creator-badge"> · by {r.creator_name}</span>
                    )}
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
