import React, { useEffect, useState, useRef } from 'react';
import {
  Pencil,
  RotateCcw,
  CheckCheck,
  LoaderCircle,
  Plus,
  Radio,
  Save,
  SlidersHorizontal,
  Camera,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { money, clockLabel, clockParts } from '../utils/format.js';
import Filter from '../components/ReportFilters.jsx';

export default function DailyReportPage({
  sheet,
  summary,
  dirty,
  draft,
  saving,
  saveEntries,
  campaign,
  setCampaign,
  search,
  setSearch,
  groups,
  filteredDialers,
  setDraft,
  liveEntries,
  onAddDialer,
  onEditRow,
  onRestoreRow,
}) {
  const [capturing, setCapturing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const fullReportRef = useRef(null);

  async function captureFullSheet() {
    if (!fullReportRef.current || capturing) return;
    try {
      setCapturing(true);
      setToastMsg('');
      await new Promise((r) => setTimeout(r, 120));

      const canvas = await html2canvas(fullReportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#0f172a',
        windowWidth: 1560,
      });

      const dateStr = sheet.report_date || 'report';
      const fileName = `VoIP-Report-${dateStr}.png`;

      const link = document.createElement('a');
      link.download = fileName;
      link.href = canvas.toDataURL('image/png');
      link.click();

      if (navigator.clipboard && window.ClipboardItem) {
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
              ]);
              setToastMsg('Screenshot saved & copied to clipboard! Paste directly in group.');
            } catch {
              setToastMsg('Screenshot downloaded successfully!');
            }
          }
        });
      } else {
        setToastMsg('Screenshot downloaded successfully!');
      }
    } catch (err) {
      console.error('Failed to capture sheet:', err);
      setToastMsg('Failed to capture screenshot. Please try again.');
    } finally {
      setCapturing(false);
      setTimeout(() => setToastMsg(''), 5000);
    }
  }

  return (
    <section className="panel sheet-panel">
      <div className="panel-heading">
        <div>
          <h3>{sheet.name}</h3>
          <p>Enter USD amounts · Tab to move between cells · Blank means not reported</p>
        </div>
        <div className="save-controls">
          <button
            type="button"
            className="secondary ss-btn"
            disabled={capturing}
            onClick={captureFullSheet}
            title="Capture full report screenshot with all campaigns for WhatsApp/group sharing"
          >
            {capturing ? (
              <>
                <LoaderCircle size={15} className="spin" /> Capturing SS...
              </>
            ) : (
              <>
                <Camera size={15} /> Capture Sheet (SS)
              </>
            )}
          </button>
          <span className={dirty ? 'unsaved' : 'saved'}>
            {dirty ? (
              `${Object.keys(draft).length} unsaved changes`
            ) : (
              <>
                <CheckCheck size={14} /> All changes saved
              </>
            )}
          </span>
          <button className="primary" onClick={saveEntries} disabled={!dirty || saving}>
            {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Save changes
          </button>
        </div>
      </div>
      <div className="report-row-tools">
        <button className="secondary" disabled={saving} onClick={() => onAddDialer()}>
          <Plus size={14} /> Add dialer row
        </button>
        <span>
          Current total <b>{money(summary.total)}</b>
        </span>
      </div>
      {sheet.config.removedDialers?.length > 0 && (
        <details className="removed-rows">
          <summary>Restore removed rows ({sheet.config.removedDialers.length})</summary>
          {sheet.config.removedDialers.map(({ row }) => (
            <div key={row.id}>
              <span>{row.name}</span>
              <button className="text-btn" disabled={saving} onClick={() => onRestoreRow(row.id)}>
                <RotateCcw size={13} /> Restore saved row
              </button>
            </div>
          ))}
        </details>
      )}
      <Filter
        campaign={campaign}
        setCampaign={setCampaign}
        search={search}
        setSearch={setSearch}
        groups={groups}
      />
      <div className="sheet-hint">
        <SlidersHorizontal size={15} /> Totals update as you type. Save changes to store entries.
      </div>
      <div className="sheet-scroll">
        <table className="entry-table">
          <thead>
            <tr>
              <th>Campaign / dialer</th>
              {sheet.config.slots.map((s, i) => {
                const { time, period } = clockParts(s.start);
                return (
                  <th
                    key={i}
                    title={`${clockLabel(s.start)} to ${clockLabel(s.end)}${s.dayOffset ? ' (+1 day)' : ''}`}
                  >
                    <div className="th-slot-time">
                      <span className="th-time-val">{time}</span>
                      <span className="th-time-period">{period}</span>
                    </div>
                  </th>
                );
              })}
              <th>Total USD</th>
            </tr>
          </thead>
          <tbody>
            {groups
              .filter((g) => filteredDialers.some((d) => d.campaign_id === g.id))
              .map((g) => (
                <React.Fragment key={g.id}>
                  <tr className="campaign-row">
                    <td colSpan={sheet.config.slots.length + 2}>
                      <div className="campaign-row-content">
                        <div className="campaign-left">
                          <span className="campaign-dot" style={{ background: g.color || '#818cf8' }} />
                          <strong className="campaign-name">{g.name}</strong>
                          <span className="campaign-count">
                            {filteredDialers.filter((d) => d.campaign_id === g.id).length} dialers
                          </span>
                        </div>
                        <button
                          className="add-row-btn"
                          disabled={saving}
                          onClick={() => onAddDialer(g.id)}
                        >
                          <Plus size={12} /> Add dialer row
                        </button>
                      </div>
                    </td>
                  </tr>
                  {filteredDialers
                    .filter((d) => d.campaign_id === g.id)
                    .map((d) => (
                      <tr key={d.id}>
                        <td className="dialer-cell">
                          <div className="dialer-cell-wrap">
                            <Radio size={13} className="dialer-radio-icon" />
                            <span className="row-label" title={d.name}>
                              {d.name}
                            </span>
                            <button
                              className="icon-btn row-edit"
                              aria-label={`Edit report row ${d.name}`}
                              disabled={saving}
                              onClick={() => onEditRow(d)}
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        </td>
                        {sheet.config.slots.map((s, i) => {
                          const key = `${d.id}:${i}`;
                          const stored =
                            sheet.entries.find((e) => e.dialer_id === d.id && e.slot === i)
                              ?.amount ?? '';
                          const value = Object.hasOwn(draft, key) ? draft[key] : stored;
                          return (
                            <td key={i} className={Object.hasOwn(draft, key) ? 'dirty-cell' : ''}>
                              <input
                                aria-label={`${d.name} ${clockLabel(s.start)} amount`}
                                inputMode="decimal"
                                type="number"
                                min="0"
                                step="0.01"
                                max="9999999999.99"
                                placeholder="—"
                                disabled={saving}
                                value={value}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraft((current) => {
                                    const next = { ...current };
                                    if (
                                      (val === '' && stored === '') ||
                                      (val !== '' &&
                                        stored !== '' &&
                                        Number(val) === Number(stored))
                                    )
                                      delete next[key];
                                    else next[key] = val;
                                    return next;
                                  });
                                }}
                              />
                            </td>
                          );
                        })}
                        <td className="row-total">{money(d.total)}</td>
                      </tr>
                    ))}
                  <tr className="subtotal-row">
                    <td>{g.name} subtotal</td>
                    {summary.intervals.map((_, i) => {
                      const slotVal = liveEntries
                        .filter(
                          (e) =>
                            e.slot === i &&
                            filteredDialers.some(
                              (d) => d.campaign_id === g.id && d.id === e.dialer_id,
                            ),
                        )
                        .reduce((n, e) => n + Number(e.amount), 0);
                      return (
                        <td
                          key={i}
                          className={slotVal > 0 ? 'subtotal-val-active' : 'subtotal-val-muted'}
                          title={`${g.name} ${clockLabel(sheet.config.slots[i].start)}: ${money(slotVal)}`}
                        >
                          {slotVal > 0 ? money(slotVal) : '—'}
                        </td>
                      );
                    })}
                    <td className="subtotal-grand">
                      {money(
                        filteredDialers
                          .filter((d) => d.campaign_id === g.id)
                          .reduce((n, d) => n + d.total, 0),
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
          </tbody>
          <tfoot>
            <tr className="full-total-row">
              <td>Full report total</td>
              {summary.intervals.map((inv) => (
                <td
                  key={inv.slot}
                  className={inv.total > 0 ? 'foot-val-active' : 'foot-val-muted'}
                  title={`Total at ${clockLabel(inv.start)}: ${money(inv.total)}`}
                >
                  {inv.total > 0 ? money(inv.total) : '—'}
                </td>
              ))}
              <td className="foot-grand">{money(summary.total)}</td>
            </tr>
            <tr className="running-total-row">
              <td>Running total</td>
              {summary.intervals.map((inv) => {
                const lastActiveSlot = summary.intervals.reduce(
                  (max, item) => (item.total > 0 ? item.slot : max),
                  -1,
                );
                const isPastOrActive = inv.slot <= lastActiveSlot;
                const hasSpend = isPastOrActive && inv.cumulative > 0;
                return (
                  <td
                    key={inv.slot}
                    className={hasSpend ? 'running-val-active' : 'running-val-muted'}
                    title={`Running total through ${clockLabel(inv.end)}: ${money(inv.cumulative)}`}
                  >
                    {hasSpend ? money(inv.cumulative) : '—'}
                  </td>
                );
              })}
              <td className="running-grand">{money(summary.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="table-footer">
        <span>USD · {sheet.config.timezone} · Overnight dates handled automatically</span>
        <span>
          Version {sheet.version} · {summary.entered} saved entries
        </span>
      </div>

      {/* Hidden off-screen export container for 2x Retina complete report screenshot */}
      <div className="ss-export-container" aria-hidden="true">
        <div ref={fullReportRef} className="ss-export-card">
          <div className="ss-export-header">
            <div className="ss-header-left">
              <div className="ss-title-row">
                <h2>{sheet.name || 'Balitech · VoIP Shift Report'}</h2>
                <span className="ss-badge">FINAL REPORT</span>
              </div>
              <div className="ss-meta-row">
                <span>📅 {sheet.report_date}</span>
                <span>
                  🕒 {sheet.config.slots[0]?.start} – {sheet.config.slots[sheet.config.slots.length - 1]?.end} (
                  {sheet.config.timezone || 'America/New_York'})
                </span>
                <span>👥 {summary.dialers.length} Active Dialers</span>
              </div>
            </div>
            <div className="ss-header-right">
              <div className="ss-total-box">
                <span className="ss-total-label">TOTAL SHIFT SPEND</span>
                <strong className="ss-total-amount">{money(summary.total)}</strong>
              </div>
            </div>
          </div>

          <table className="ss-export-table">
            <thead>
              <tr>
                <th className="ss-th-dialer">Campaign / Dialer</th>
                {sheet.config.slots.map((s, i) => {
                  const { time, period } = clockParts(s.start);
                  return (
                    <th key={i} className="ss-th-slot">
                      <div className="ss-th-time">{time}</div>
                      <div className="ss-th-period">{period}</div>
                    </th>
                  );
                })}
                <th className="ss-th-total">Total USD</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const campaignDialers = summary.dialers.filter((d) => d.campaign_id === g.id);
                if (campaignDialers.length === 0) return null;
                const campaignSubtotal = campaignDialers.reduce((n, d) => n + d.total, 0);

                return (
                  <React.Fragment key={g.id}>
                    <tr className="ss-campaign-row">
                      <td colSpan={sheet.config.slots.length + 2}>
                        <div className="ss-campaign-title">
                          <span className="ss-campaign-dot" style={{ background: g.color || '#818cf8' }} />
                          <strong className="ss-campaign-name">{g.name}</strong>
                          <span className="ss-campaign-count">{campaignDialers.length} dialers</span>
                        </div>
                      </td>
                    </tr>
                    {campaignDialers.map((d) => (
                      <tr key={d.id} className="ss-dialer-row">
                        <td className="ss-td-dialer">
                          <div className="ss-dialer-wrap">
                            <span className="ss-dialer-bullet" style={{ background: g.color || '#818cf8' }} />
                            <span className="ss-dialer-name">{d.name}</span>
                          </div>
                        </td>
                        {sheet.config.slots.map((s, i) => {
                          const key = `${d.id}:${i}`;
                          const stored =
                            sheet.entries.find((e) => e.dialer_id === d.id && e.slot === i)?.amount ?? '';
                          const rawVal = Object.hasOwn(draft, key) ? draft[key] : stored;
                          const numVal = Number(rawVal);
                          const hasVal = rawVal !== '' && !Number.isNaN(numVal) && numVal > 0;
                          return (
                            <td key={i} className={`ss-td-cell ${hasVal ? 'ss-has-val' : 'ss-empty-cell'}`}>
                              {hasVal ? money(numVal) : '—'}
                            </td>
                          );
                        })}
                        <td className="ss-td-row-total">{money(d.total)}</td>
                      </tr>
                    ))}
                    <tr className="ss-subtotal-row">
                      <td className="ss-td-dialer">{g.name} Subtotal</td>
                      {sheet.config.slots.map((_, i) => {
                        const slotTotal = liveEntries
                          .filter((e) => e.slot === i && campaignDialers.some((d) => d.id === e.dialer_id))
                          .reduce((n, e) => n + Number(e.amount), 0);
                        return (
                          <td
                            key={i}
                            className={`ss-td-cell ${slotTotal > 0 ? 'ss-has-val' : 'ss-empty-cell'}`}
                          >
                            {slotTotal > 0 ? money(slotTotal) : '—'}
                          </td>
                        );
                      })}
                      <td className="ss-td-row-total ss-subtotal-grand">{money(campaignSubtotal)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="ss-tfoot-total">
                <td className="ss-td-dialer">Full Report Total</td>
                {summary.intervals.map((inv) => (
                  <td
                    key={inv.slot}
                    className={`ss-td-cell ${inv.total > 0 ? 'ss-foot-cell' : 'ss-empty-cell'}`}
                  >
                    {inv.total > 0 ? money(inv.total) : '—'}
                  </td>
                ))}
                <td className="ss-td-row-total ss-foot-grand">{money(summary.total)}</td>
              </tr>
              <tr className="ss-tfoot-running">
                <td className="ss-td-dialer">Running Total</td>
                {summary.intervals.map((inv) => {
                  const lastActiveSlot = summary.intervals.reduce(
                    (max, item) => (item.total > 0 ? item.slot : max),
                    -1,
                  );
                  const isPastOrActive = inv.slot <= lastActiveSlot;
                  const hasSpend = isPastOrActive && inv.cumulative > 0;
                  return (
                    <td
                      key={inv.slot}
                      className={`ss-td-cell ${hasSpend ? 'ss-running-cell' : 'ss-empty-cell'}`}
                    >
                      {hasSpend ? money(inv.cumulative) : '—'}
                    </td>
                  );
                })}
                <td className="ss-td-row-total ss-running-grand">{money(summary.total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="ss-export-footer">
            <span>
              VoIP Portal · High-precision reporting · Generated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span>
              Version {sheet.version} · {summary.entered} saved entries
            </span>
          </div>
        </div>
      </div>

      {toastMsg && (
        <div className="ss-toast">
          <CheckCheck size={16} />
          <span>{toastMsg}</span>
        </div>
      )}
    </section>
  );
}
