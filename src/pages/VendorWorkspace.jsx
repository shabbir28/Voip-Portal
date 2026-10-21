import React, { useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  Pencil,
  RotateCcw,
  Download,
  RefreshCw,
  Save,
  Search,
  Users,
} from 'lucide-react';
import { api, send } from '../services/api.js';
import DateRangePicker from '../components/DateRangePicker.jsx';
import VendorModal from '../components/VendorModal.jsx';
import { summarizeVendors, vendorIntervalLabel } from '../../shared/vendors.js';
import VendorSpendCards from '../components/VendorSpendCards.jsx';
import { money, prettyDate, clockLabel } from '../utils/format.js';
import { formatTimestamp } from '../../shared/time.js';
import { downloadVendors } from '../utils/vendorDownload.js';
export default function VendorWorkspace({
  page,
  range,
  onRange,
  onDirty,
  canViewActivity,
  isSuperAdmin,
}) {
  const directory = page === 'vendors';
  const [vendors, setVendors] = useState([]),
    [reports, setReports] = useState([]),
    [selected, setSelected] = useState(''),
    [report, setReport] = useState(null),
    [draft, setDraft] = useState({}),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [showDeleted, setShowDeleted] = useState(false),
    [search, setSearch] = useState(''),
    [revision, setRevision] = useState(0);
  const [adminUsers, setAdminUsers] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState('all');
  const dirty = Object.keys(draft).length > 0;
  useEffect(() => {
    if (isSuperAdmin) {
      api('/users?includeDeleted=false')
        .then((u) => {
          setAdminUsers(Array.isArray(u) ? u.filter((x) => !x.deleted_at) : []);
        })
        .catch(() => {});
    } else {
      setAdminUsers([]);
      setSelectedAdminId('all');
    }
  }, [isSuperAdmin]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    let live = true;
    api(`/vendors?includeDeleted=${showDeleted}`)
      .then((v) => {
        if (live) setVendors(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [showDeleted, revision]);
  useEffect(() => {
    if (directory) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError('');
    setReports([]);
    setReport(null);
    setDraft({});
    const adminParam = isSuperAdmin
      ? `&adminView=true${selectedAdminId !== 'all' ? '&userId=' + selectedAdminId : ''}`
      : '';
    api(`/vendor-reports?from=${range.from}&to=${range.to}${adminParam}`)
      .then((r) => {
        if (live) {
          setReports(r);
          setSelected((prev) =>
            r.some((s) => String(s.id) === String(prev)) ? String(prev) : String(r[0]?.id || ''),
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [directory, range.from, range.to, revision, isSuperAdmin, selectedAdminId]);
  useEffect(() => {
    if (directory || !selected || loading) {
      setReport(null);
      return;
    }
    let live = true;
    setReport(null);
    const adminParam = isSuperAdmin ? '?adminView=true' : '';
    api(`/vendor-reports/${selected}${adminParam}`)
      .then((r) => {
        if (live) setReport(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [selected, loading, directory, revision, isSuperAdmin]);
  async function refresh() {
    setRevision((v) => v + 1);
  }
  async function run(action, message) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(message);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function discard() {
    return !dirty || window.confirm('Discard unsaved vendor entries?');
  }
  async function save() {
    const entries = Object.entries(draft).map(([key, value]) => {
      const [vendor_id, slot] = key.split(':').map(Number);
      return { vendor_id, slot, amount: value === '' ? null : Number(value) };
    });
    if (
      entries.some(
        (e) =>
          e.amount !== null &&
          (!Number.isFinite(e.amount) ||
            e.amount < 0 ||
            e.amount > 9999999999.99 ||
            Math.abs(e.amount * 100 - Math.round(e.amount * 100)) > 0.0001),
      )
    )
      return setError('Enter non-negative USD amounts with at most two decimal places.');
    await run(async () => {
      await send(
        `/vendor-reports/${report.id}/entries`,
        { version: report.version, entries },
        'PUT',
      );
      setDraft({});
    }, 'Vendor entries saved. Totals updated.');
  }
  const entries = new Map((report?.entries || []).map((e) => [`${e.vendor_id}:${e.slot}`, e]));
  for (const [key, value] of Object.entries(draft)) {
    const [vendor_id, slot] = key.split(':').map(Number);
    if (value === '') entries.delete(key);
    else
      entries.set(key, {
        vendor_id,
        slot,
        amount: Number.isFinite(Number(value)) ? Number(value) : 0,
      });
  }
  const summary = report ? summarizeVendors({ ...report, entries: [...entries.values()] }) : null;
  const filtered = vendors.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice success" role="status">
          {notice}
        </div>
      )}
      {directory ? (
        <>
          <div className="vendor-toolbar">
            <div className="search">
              <Search size={15} />
              <input
                aria-label="Search vendors"
                placeholder="Search vendors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="secondary" onClick={() => setShowDeleted((v) => !v)}>
              {showDeleted ? 'Hide deleted' : 'Show deleted'}
            </button>
            <button className="primary" onClick={() => setModal({ kind: 'vendor' })}>
              <Plus size={16} /> Add vendor
            </button>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Vendor directory</h3>
                <p>Manage the providers used in your hourly vendor reports.</p>
              </div>
              <span className="tag">{vendors.filter((v) => !v.deleted_at).length} active</span>
            </div>
            <div className="table-scroll">
              <table className="data-table vendor-directory">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <span className="vendor-directory-name">
                          <Building2 size={16} />
                          {v.name}
                        </span>
                      </td>
                      <td>
                        <span className={`vendor-status ${v.deleted_at ? 'archived' : ''}`}>
                          {v.deleted_at ? 'Deleted' : 'Active'}
                        </span>
                      </td>
                      <td>
                        {v.deleted_at ? (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              run(() => send(`/vendors/${v.id}/restore`, {}), 'Vendor restored.')
                            }
                          >
                            <RotateCcw size={14} /> Restore
                          </button>
                        ) : (
                          <button
                            className="secondary"
                            onClick={() => setModal({ kind: 'vendor', item: v })}
                          >
                            <Pencil size={14} /> Edit {v.name}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <p className="vendor-message">No vendors found. Add a vendor to get started.</p>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="vendor-toolbar">
            <DateRangePicker
              value={range}
              disabled={busy}
              onChange={(next) => {
                if (discard()) {
                  setDraft({});
                  onRange(next);
                }
              }}
            />
            <span className="range-caption">
              {range.from} — {range.to}
            </span>
            <button
              className="secondary"
              disabled={busy || loading || dirty || !reports.length}
              onClick={() => downloadVendors(reports, `vendors-${range.from}-to-${range.to}`)}
            >
              <Download size={14} /> Download range
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                if (discard()) {
                  setDraft({});
                  setModal({ kind: 'report' });
                }
              }}
            >
              <Plus size={16} /> New vendor report
            </button>
          </div>
          <div className="vendor-toolbar">
            {isSuperAdmin && (
              <label className="vendor-report-selector vendor-admin-filter">
                Admin
                <select
                  aria-label="Filter vendor reports by admin"
                  disabled={busy || loading}
                  value={selectedAdminId}
                  onChange={(e) => {
                    if (discard()) {
                      setDraft({});
                      setSelectedAdminId(e.target.value);
                    }
                  }}
                >
                  <option value="all">👥 All Admins ({adminUsers.length})</option>
                  {adminUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      👤 {u.name} ({u.role === 'super_admin' ? 'Super Admin' : 'Admin'})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="vendor-report-selector">
              Report
              <select
                aria-label="Select vendor report"
                disabled={busy || loading}
                value={selected}
                onChange={(e) => {
                  if (discard()) {
                    setDraft({});
                    setSelected(e.target.value);
                  }
                }}
              >
                <option value="" disabled>
                  Select a vendor report
                </option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.creator_name ? `[${r.creator_name}] ` : ''}{prettyDate(r.report_date)} · {r.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="range-caption">6 PM–4 AM · Hourly · US Eastern</span>
            <button
              className="secondary"
              disabled={busy || loading}
              onClick={() => {
                if (discard()) {
                  setDraft({});
                  refresh();
                }
              }}
            >
              <RefreshCw size={14} /> Reload
            </button>
          </div>
          {loading ? (
            <p className="vendor-message">Loading vendor reports…</p>
          ) : !report ? (
            <div className="empty panel">
              <Building2 size={30} />
              <h2>{selected ? 'Loading vendor report…' : 'No vendor reports in this range.'}</h2>
              <p>
                {selected
                  ? 'Your saved entries will appear here.'
                  : 'Create a report and enter hourly spend for each vendor.'}
              </p>
            </div>
          ) : (
            <>
              <section className="vendor-report-kpis" aria-label="Vendor spend for selected report">
                <div className="section-caption">
                  <span>VENDOR SPEND · SELECTED REPORT</span>
                  <small>
                    {dirty
                      ? 'Live totals · Includes unsaved entries'
                      : `${prettyDate(report.report_date)} · Saved totals`}
                  </small>
                </div>
                <VendorSpendCards vendors={summary.vendors} total={summary.total} />
              </section>
              <section className="panel sheet-panel">
                <div className="panel-heading">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <h3>{report.name}</h3>
                      {report.creator_name && (
                        <span className="creator-badge" title={`Report created by ${report.creator_name}`}>
                          <Users size={12} /> {report.creator_name}
                        </span>
                      )}
                    </div>
                    <p>
                      {prettyDate(report.report_date)} · Enter interval spend in USD · Blank = not
                      reported
                    </p>
                  </div>
                  <div className="save-controls">
                    <span className={dirty ? 'unsaved' : 'saved'}>
                      {dirty ? `${Object.keys(draft).length} unsaved changes` : 'All changes saved'}
                    </span>
                    <button
                      className="secondary"
                      disabled={dirty || busy}
                      onClick={() =>
                        downloadVendors([report], `vendor-${report.report_date}-${report.id}`)
                      }
                    >
                      <Download size={14} /> Download report
                    </button>
                    <button className="primary" disabled={!dirty || busy} onClick={save}>
                      <Save size={14} />
                      {busy ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
                <div className="report-row-tools">
                  <button
                    className="secondary"
                    disabled={busy || dirty}
                    title={dirty ? 'Save entries before changing rows' : ''}
                    onClick={() => setModal({ kind: 'add-row' })}
                  >
                    <Plus size={14} /> Add vendor row
                  </button>
                  <span>
                    Current vendor total <b>{money(summary.total)}</b>
                  </span>
                </div>
                {dirty && (
                  <p className="vendor-hint">
                    Save your entries before adding, editing or restoring rows.
                  </p>
                )}
                {!!report.config.removedVendors?.length && (
                  <details className="removed-rows">
                    <summary>Restore removed rows ({report.config.removedVendors.length})</summary>
                    {report.config.removedVendors.map((v) => (
                      <div key={v.row.id}>
                        <span>{v.row.name}</span>
                        <button
                          className="secondary"
                          disabled={busy || dirty}
                          onClick={() =>
                            run(
                              () =>
                                send(
                                  `/vendor-reports/${report.id}/rows/${v.row.id}`,
                                  { version: report.version, action: 'restore' },
                                  'PATCH',
                                ),
                              'Vendor row restored with saved amounts.',
                            )
                          }
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                      </div>
                    ))}
                  </details>
                )}
                <div className="table-scroll">
                  <table className="entry-table vendor-entry-table">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        {report.config.slots.map((slot, i) => (
                          <th key={i}>{vendorIntervalLabel(slot)}</th>
                        ))}
                        <th>Total USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.vendors.map((v) => (
                        <tr key={v.id}>
                          <td>
                            <span className="row-label" title={v.name}>
                              {v.name}
                            </span>
                            <button
                              className="icon-btn row-edit"
                              aria-label={`Edit vendor row ${v.name}`}
                              disabled={dirty || busy}
                              onClick={() => setModal({ kind: 'row', item: v })}
                            >
                              <Pencil size={13} />
                            </button>
                          </td>
                          {report.config.slots.map((slot, i) => {
                            const key = `${v.id}:${i}`;
                            return (
                              <td key={i}>
                                <input
                                  type="number"
                                  min="0"
                                  max="9999999999.99"
                                  step="0.01"
                                  inputMode="decimal"
                                  aria-label={`${v.name} ${clockLabel(slot.start)} amount`}
                                  disabled={busy}
                                  className={Object.hasOwn(draft, key) ? 'cell-dirty' : ''}
                                  value={
                                    Object.hasOwn(draft, key)
                                      ? draft[key]
                                      : (entries.get(key)?.amount ?? '')
                                  }
                                  placeholder="—"
                                  onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                                  }
                                />
                              </td>
                            );
                          })}
                          <td className="row-total">{money(v.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Interval total</td>
                        {summary.intervals.map((s, i) => (
                          <td key={i}>{money(s.total)}</td>
                        ))}
                        <td>{money(summary.total)}</td>
                      </tr>
                      <tr>
                        <td>Running total</td>
                        {summary.intervals.map((s, i) => (
                          <td key={i}>{money(s.cumulative)}</td>
                        ))}
                        <td>{money(summary.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="vendor-hint">
                  {summary.entered} of {summary.expected} hourly entries recorded · Enter 0 for
                  confirmed zero spend · Totals update as you type
                </p>
              </section>
              {canViewActivity && (
                <details className="panel vendor-history">
                  <summary>Report activity · US Eastern</summary>
                  {report.activity?.map((a) => (
                    <div key={a.id}>
                      <b>{a.action}</b>
                      <span>
                        {a.detail.name || (a.detail.count ? `${a.detail.count} entries` : '')}
                        {a.detail.previousName && a.detail.previousName !== a.detail.name
                          ? ` (was ${a.detail.previousName})`
                          : ''}
                      </span>
                      <small>
                        {a.user_name} · {formatTimestamp(a.created_at)}
                      </small>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
        </>
      )}
      {modal && (
        <VendorModal
          {...modal}
          vendors={vendors}
          report={report}
          close={() => setModal(null)}
          onSaved={async (result) => {
            if (modal.kind === 'report') {
              const created = await api(`/vendor-reports/${result.id}`);
              setSelected(String(result.id));
              if (created.report_date < range.from || created.report_date > range.to)
                onRange({
                  label: 'Custom Range',
                  from: created.report_date,
                  to: created.report_date,
                });
            }
            setNotice('Saved successfully.');
            await refresh();
          }}
        />
      )}
    </>
  );
}
