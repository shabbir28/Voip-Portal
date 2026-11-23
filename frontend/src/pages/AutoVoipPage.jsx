import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Download, RefreshCw } from 'lucide-react';
import { api } from '../services/api.js';
import DateRangePicker from '../components/DateRangePicker.jsx';
import ConnectivoSyncStatus, { syncTime } from '../components/ConnectivoSyncStatus.jsx';
import { getDatePresets } from '../utils/dateRanges.js';
import { money, prettyDate, clockLabel, clockParts } from '../utils/format.js';
import { downloadReports } from '../utils/download.js';
import { summarize } from '../../../shared/reporting.js';
import { REPORT_TIMEZONE } from '../../../shared/time.js';
import '../styles/auto-voip.css';

const easternClock = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

function intervalLabel(slot) {
  return `${clockLabel(slot.start)} to ${clockLabel(slot.end)} PKT${slot.dayOffset ? ' (+1 day)' : ''}`;
}

function scrollToInterval(scroller, slot) {
  const header = scroller.querySelector(`[data-interval="${slot}"]`);
  const dialerColumn = scroller.querySelector('thead th');
  const totalsColumn = scroller.querySelector('thead th:last-child');
  if (!header || !dialerColumn || !totalsColumn) return;
  const offset = header.getBoundingClientRect().left - dialerColumn.getBoundingClientRect().right;
  const space = scroller.clientWidth - dialerColumn.offsetWidth - totalsColumn.offsetWidth;
  scroller.scrollLeft += offset - Math.max(0, (space - header.offsetWidth) / 2);
}

function TotalsRow({ label, summary, entries, running = false }) {
  const recorded = new Set(entries.map((entry) => entry.slot));
  const first = Math.min(...recorded);
  const last = Math.max(...recorded);
  return (
    <tr className={running ? 'auto-voip-running-row' : 'auto-voip-total-row'}>
      <th scope="row">{label}</th>
      {summary.intervals.map(({ slot, total, cumulative }) => {
        const hasAmount = running ? slot >= first && slot <= last : recorded.has(slot);
        return (
          <td key={slot} className={hasAmount ? undefined : 'auto-voip-unreported'}>
            {hasAmount ? money(running ? cumulative : total) : '—'}
          </td>
        );
      })}
      <td>{summary.entered ? money(summary.total) : '—'}</td>
    </tr>
  );
}

export function AutomaticReport({ report }) {
  const { config, entries, readings = [] } = report;
  const summary = summarize(config, entries);
  const amounts = new Map(
    entries.map((entry) => [`${entry.dialer_id}:${entry.slot}`, entry.amount]),
  );
  const groups = [...new Set(config.dialers.map((dialer) => dialer.campaign))];
  const billedAt = new Map(
    readings.map((reading) => [Date.parse(reading.periodEnd), reading.billedTotal]),
  );
  const lastReading = Date.parse(readings.at(-1)?.periodEnd);
  const latestSlot = config.slots.findLastIndex((slot) => Date.parse(slot.utcStart) <= lastReading);
  const lastRecorded = entries.reduce((last, entry) => Math.max(last, entry.slot), -1);
  const lastVisible = Math.max(latestSlot, lastRecorded);
  const scroller = useRef(null);
  const positioned = useRef(false);

  useEffect(() => {
    if (lastVisible < 0 || positioned.current) return;
    scrollToInterval(scroller.current, lastVisible);
    positioned.current = true;
  }, [lastVisible]);

  return (
    <section className="auto-voip-sheet" aria-label="Automatic VoIP report">
      <div className="auto-voip-sheet-heading">
        <div>
          <h2>{prettyDate(report.report_date)}</h2>
          <p className="auto-voip-meta">
            {report.name} · Pakistan slots with US Eastern time below
          </p>
        </div>
        <div className="auto-voip-report-total">
          <span>Recorded spend</span>
          <strong>{summary.entered ? money(summary.total) : '—'}</strong>
        </div>
      </div>
      <div className="auto-voip-grid-bar">
        <p>
          Half-hour spend{' '}
          <span>
            · {summary.entered} of {summary.expected} recorded
          </span>
        </p>
        {lastVisible >= 0 && (
          <button
            className="auto-voip-jump"
            type="button"
            onClick={() => scrollToInterval(scroller.current, lastVisible)}
          >
            Latest reading <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        className="auto-voip-scroll"
        role="region"
        aria-label="Half-hour spend grid"
        tabIndex={0}
        ref={scroller}
      >
        <table
          className="auto-voip-table"
          style={{ '--interval-columns': config.slots.length }}
          aria-label="Half-hour VoIP spend in USD"
        >
          <colgroup>
            <col className="auto-voip-dialer-column" />
            {config.slots.map((_, index) => (
              <col key={index} />
            ))}
            <col className="auto-voip-total-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Campaign / dialer</th>
              {config.slots.map((slot, index) => {
                const { time, period } = clockParts(slot.start);
                const latest = index === lastVisible;
                return (
                  <th
                    scope="col"
                    key={index}
                    data-interval={index}
                    className={latest ? 'auto-voip-latest' : undefined}
                    title={intervalLabel(slot)}
                  >
                    {time} {period}
                    <small>{easternClock.format(new Date(slot.utcStart))}</small>
                  </th>
                );
              })}
              <th scope="col">Total USD</th>
            </tr>
          </thead>
          <tbody>
            <tr className="auto-voip-billed-row">
              <th scope="row">Vendor billed at start</th>
              {config.slots.map((slot, index) => {
                const billed = billedAt.get(Date.parse(slot.utcStart));
                return (
                  <td key={index} className={billed == null ? 'auto-voip-unreported' : undefined}>
                    {billed == null ? '—' : money(billed)}
                  </td>
                );
              })}
              <td title="Most recent vendor reading in this shift">
                {readings.length ? (
                  <>
                    <small>Latest</small> {money(readings.at(-1).billedTotal)}
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          </tbody>
          {groups.map((campaign) => {
            const dialers = summary.dialers.filter((dialer) => dialer.campaign === campaign);
            const ids = new Set(dialers.map((dialer) => dialer.id));
            const campaignEntries = entries.filter((entry) => ids.has(entry.dialer_id));
            const campaignSummary = summarize({ ...config, dialers }, campaignEntries);
            return (
              <tbody key={campaign}>
                <tr className="auto-voip-campaign-row">
                  <th scope="rowgroup">{campaign}</th>
                  <td colSpan={config.slots.length + 1} />
                </tr>
                {dialers.map((dialer) => (
                  <tr key={dialer.id} className="auto-voip-dialer-row">
                    <th scope="row">{dialer.name}</th>
                    {config.slots.map((slot, index) => {
                      const amount = amounts.get(`${dialer.id}:${index}`);
                      const recorded = amount !== undefined;
                      const classes = recorded
                        ? index === lastRecorded
                          ? 'auto-voip-latest'
                          : ''
                        : 'auto-voip-unreported';
                      return (
                        <td
                          key={index}
                          className={classes || undefined}
                          title={intervalLabel(slot)}
                        >
                          {recorded ? money(amount) : '—'}
                        </td>
                      );
                    })}
                    <td>{dialer.completed ? money(dialer.total) : '—'}</td>
                  </tr>
                ))}
                <TotalsRow
                  label={`${campaign} subtotal`}
                  summary={campaignSummary}
                  entries={campaignEntries}
                />
                <TotalsRow
                  label={`${campaign} running`}
                  summary={campaignSummary}
                  entries={campaignEntries}
                  running
                />
              </tbody>
            );
          })}
          <tfoot>
            <TotalsRow label="Interval total" summary={summary} entries={entries} />
            <TotalsRow label="Running total" summary={summary} entries={entries} running />
          </tfoot>
        </table>
      </div>
      <div className="auto-voip-sheet-footer">
        <span>Vendor billed is cumulative. Spend is the change by the end of each half-hour.</span>
        <span>Updated {syncTime(report.updated_at)}</span>
      </div>
    </section>
  );
}

export default function AutoVoipPage() {
  const [range, setRange] = useState(() => getDatePresets()[0]);
  const [status, setStatus] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [revision, setRevision] = useState(0);
  const visibleReports = reports.filter(
    ({ report_date }) => report_date >= range.from && report_date <= range.to,
  );
  const activeId = (visibleReports.find((item) => item.id === selectedId) ?? visibleReports[0])?.id;
  const shownReport = report?.id === activeId ? report : null;
  const error = listError || detailError;
  const loading = busy || loadingReport || Boolean(activeId && !shownReport && !error);

  useEffect(() => {
    let cancelled = false;
    let timer;
    async function refresh() {
      setBusy(true);
      try {
        const nextStatus = await api('/auto-voip/status');
        if (cancelled) return;
        setStatus(nextStatus);
        if (nextStatus.available === false) {
          setReports([]);
        } else {
          const nextReports = await api(`/auto-voip/reports?from=${range.from}&to=${range.to}`);
          if (cancelled) return;
          setReports(nextReports);
        }
        setListError('');
      } catch (err) {
        if (!cancelled) {
          if (err.status === 403 || err.status === 404) {
            setStatus({ available: false });
            setReports([]);
          } else setListError(err.message);
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          timer = setTimeout(refresh, 30_000);
        }
      }
    }
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [range.from, range.to, revision]);

  useEffect(() => {
    if (!activeId) {
      setReport(null);
      setLoadingReport(false);
      setDetailError('');
      return;
    }
    let cancelled = false;
    setLoadingReport(true);
    api(`/auto-voip/reports/${activeId}`)
      .then((nextReport) => {
        if (!cancelled) {
          setReport(nextReport);
          setDetailError('');
        }
      })
      .catch((err) => {
        if (!cancelled) setDetailError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingReport(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, reports, revision]);

  useEffect(() => {
    const timer = setInterval(() => {
      const today = getDatePresets()[0];
      setRange((current) =>
        current.label === today.label && current.from !== today.from ? today : current,
      );
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="auto-voip-workspace">
      {error && (
        <p className="auto-voip-error" role="alert">
          {error}
        </p>
      )}
      {status?.available === false ? (
        <div className="auto-voip-empty">
          <h2>Auto VoIP is unavailable for this account</h2>
          <p>Sign in to the account connected to Go Connectivo to view its reports</p>
        </div>
      ) : (
        <>
          <ConnectivoSyncStatus status={status} />
          <div className="auto-voip-toolbar">
            <div className="auto-voip-controls">
              <DateRangePicker value={range} onChange={setRange} />
              <div className="auto-voip-report-select">
                <select
                  aria-label="Select automatic report"
                  value={activeId || ''}
                  disabled={!visibleReports.length}
                  onChange={(event) => setSelectedId(Number(event.target.value))}
                >
                  <option value="" disabled>
                    Report date
                  </option>
                  {visibleReports.map((item) => (
                    <option key={item.id} value={item.id}>
                      {prettyDate(item.report_date)}
                      {visibleReports.some(
                        (other) => other.id !== item.id && other.report_date === item.report_date,
                      )
                        ? ` · ${item.name}`
                        : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </div>
            </div>
            <div className="auto-voip-controls">
              <button
                className="auto-voip-button auto-voip-refresh"
                aria-label="Refresh automatic billing reports"
                title="Refresh automatic billing reports"
                disabled={loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                <RefreshCw aria-hidden="true" />
              </button>
              <button
                className="auto-voip-button"
                disabled={!shownReport || loadingReport}
                onClick={() =>
                  downloadReports(
                    [shownReport],
                    `auto-voip-${shownReport.report_date}-${shownReport.id}`,
                    true,
                  )
                }
              >
                <Download aria-hidden="true" /> Download CSV
              </button>
            </div>
          </div>
          {shownReport ? (
            <AutomaticReport key={shownReport.id} report={shownReport} />
          ) : (
            <div className="auto-voip-empty" role="status">
              <h2>
                {loading
                  ? 'Loading reports…'
                  : error
                    ? 'Report unavailable'
                    : 'No reports for these dates'}
              </h2>
              {!loading && !error && (
                <p>Pick another date range or wait for the first billing reading</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
