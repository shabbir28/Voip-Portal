import React, { useEffect, useState } from 'react';
import {
  Pencil,
  RotateCcw,
  CheckCheck,
  LoaderCircle,
  Plus,
  Radio,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import { money, clockLabel } from '../utils/format.js';
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
  return (
    <section className="panel sheet-panel">
      <div className="panel-heading">
        <div>
          <h3>{sheet.name}</h3>
          <p>Enter USD amounts · Tab to move between cells · Blank means not reported</p>
        </div>
        <div className="save-controls">
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
        Scroll for the full shift.
      </div>
      <div className="sheet-scroll">
        <table className="entry-table">
          <thead>
            <tr>
              <th>Campaign / dialer</th>
              {sheet.config.slots.map((s, i) => (
                <th key={i}>
                  {clockLabel(s.start)}
                  <small>
                    to {clockLabel(s.end)}
                    {s.dayOffset ? ' · +1 day' : ''}
                  </small>
                </th>
              ))}
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
                      <span style={{ background: g.color }} />
                      {g.name}
                      <small>
                        {filteredDialers.filter((d) => d.campaign_id === g.id).length} dialers
                      </small>
                      <button
                        className="add-row-btn"
                        disabled={saving}
                        onClick={() => onAddDialer(g.id)}
                      >
                        <Plus size={13} /> Add dialer row
                      </button>
                    </td>
                  </tr>
                  {filteredDialers
                    .filter((d) => d.campaign_id === g.id)
                    .map((d) => (
                      <tr key={d.id}>
                        <td>
                          <Radio size={13} />
                          <span className="row-label">{d.name}</span>
                          <button
                            className="icon-btn row-edit"
                            aria-label={`Edit report row ${d.name}`}
                            disabled={saving}
                            onClick={() => onEditRow(d)}
                          >
                            <Pencil size={12} />
                          </button>
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
                    {summary.intervals.map((_, i) => (
                      <td key={i}>
                        {money(
                          liveEntries
                            .filter(
                              (e) =>
                                e.slot === i &&
                                filteredDialers.some(
                                  (d) => d.campaign_id === g.id && d.id === e.dialer_id,
                                ),
                            )
                            .reduce((n, e) => n + Number(e.amount), 0),
                        )}
                      </td>
                    ))}
                    <td>
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
            <tr>
              <td>Full report total</td>
              {summary.intervals.map((i) => (
                <td key={i.slot}>{money(i.total)}</td>
              ))}
              <td>{money(summary.total)}</td>
            </tr>
            <tr>
              <td>Running total</td>
              {summary.intervals.map((i) => (
                <td key={i.slot}>{money(i.cumulative)}</td>
              ))}
              <td>{money(summary.total)}</td>
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
    </section>
  );
}
