import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Plus,
  Pencil,
  RotateCcw,
  Download,
  RefreshCw,
  Save,
} from 'lucide-react';
import { api, send } from '../services/api.js';
import VendorNegativeModal from '../components/VendorNegativeModal.jsx';
import VendorCreditAlert from '../components/VendorCreditAlert.jsx';
import VendorSpendCards from '../components/VendorSpendCards.jsx';
import { vendorCredit } from '../../shared/vendorCredit.js';
import { money } from '../utils/format.js';
import { downloadVendorNegative } from '../utils/vendorNegativeDownload.js';

export default function VendorNegativeWorkspace({ onDirty }) {
  const [vendors, setVendors] = useState([]);
  const [report, setReport] = useState(null);
  const [draft, setDraft] = useState({});
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dismissedCreditAlert, setDismissedCreditAlert] = useState(null);
  const savedLowCredit = (report?.summary?.vendors || []).filter((v) => v.lowCredit);
  const creditAlertKey = savedLowCredit.map((v) => `${v.id}:${v.remainingCredit}`).join('|');

  useEffect(() => {
    if (!creditAlertKey) setDismissedCreditAlert(null);
  }, [creditAlertKey]);

  const dirty = Object.keys(draft).length > 0;

  useEffect(() => {
    if (onDirty) onDirty(dirty);
    return () => {
      if (onDirty) onDirty(false);
    };
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
    api('/vendors?includeDeleted=false')
      .then((v) => {
        if (live) setVendors(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);

  function loadSheet() {
    let live = true;
    setLoading(true);
    setError('');

    api('/vendor-negative/sheet')
      .then((r) => {
        if (!live) return;
        setReport(r);
        setDraft({});
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
  }

  useEffect(() => {
    return loadSheet();
  }, []);

  function discard() {
    if (!dirty) return true;
    return window.confirm('Discard unsaved entries?');
  }

  // Calculate live summary based on draft merged with report entries
  const liveSummary = (() => {
    if (!report) return { total: 0, vendors: [] };
    const savedMap = new Map((report.entries || []).map((e) => [e.vendor_id, e]));

    const computedVendors = (report.config.vendors || []).map((v) => {
      const rawAmount = Object.hasOwn(draft[v.id] || {}, 'amount')
        ? draft[v.id].amount
        : (savedMap.get(v.id)?.amount ?? '');

      const numAmount =
        rawAmount !== '' && !Number.isNaN(Number(rawAmount)) ? Math.max(0, Number(rawAmount)) : 0;

      const rawCredit = Object.hasOwn(draft[v.id] || {}, 'total_credit')
        ? draft[v.id].total_credit
        : (savedMap.get(v.id)?.total_credit ?? '');
      return {
        ...vendorCredit(rawCredit, numAmount),
        rawCredit,
        id: v.id,
        name: v.name,
        amount: numAmount,
        rawAmount,
        total: numAmount,
      };
    });

    const total = computedVendors.reduce((acc, v) => acc + v.amount, 0);

    return {
      total,
      vendors: computedVendors,
    };
  })();

  async function save() {
    if (!report || !dirty) return;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const savedMap = new Map((report.entries || []).map((e) => [e.vendor_id, e]));
      const entriesToSave = report.config.vendors.map((v) => {
        const rawAmount = Object.hasOwn(draft[v.id] || {}, 'amount')
          ? draft[v.id].amount
          : (savedMap.get(v.id)?.amount ?? '');

        const numAmount =
          rawAmount === '' || Number.isNaN(Number(rawAmount)) ? null : Number(rawAmount);

        return {
          vendor_id: v.id,
          amount: numAmount,
          note: savedMap.get(v.id)?.note || '',
          total_credit: (() => {
            const raw = Object.hasOwn(draft[v.id] || {}, 'total_credit')
              ? draft[v.id].total_credit
              : (savedMap.get(v.id)?.total_credit ?? '');
            return raw === '' ? null : Number(raw);
          })(),
        };
      });

      if (
        entriesToSave.some((e) =>
          [e.amount, e.total_credit].some(
            (n) =>
              n !== null &&
              (!Number.isFinite(n) ||
                n < 0 ||
                n > 9999999999.99 ||
                Math.abs(n * 100 - Math.round(n * 100)) >= 0.0001),
          ),
        )
      ) {
        throw new Error('Enter non-negative USD amounts with at most two decimal places.');
      }
      const res = await send(
        '/vendor-negative/sheet',
        {
          version: report.version,
          entries: entriesToSave,
        },
        'PUT',
      );

      setReport(res);
      setDraft({});
      setNotice('Vendor negative entries saved successfully.');
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleAmountChange(vendorId, val, field = 'amount') {
    setDraft((prev) => ({
      ...prev,
      [vendorId]: { ...prev[vendorId], [field]: val },
    }));
  }

  return (
    <div className="workspace-wrap vendor-negative-workspace">
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

      {/* Standing Toolbar: Refresh & Status */}
      <div className="vendor-toolbar">
        <span className="range-caption">Vendor balances · Permanent ledger</span>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => {
            if (discard()) {
              setDraft({});
              loadSheet();
            }
          }}
          title="Reload latest saved entries"
        >
          <RefreshCw size={14} /> Reload
        </button>
      </div>

      {loading ? (
        <p className="vendor-message">Loading vendor negative balance…</p>
      ) : !report ? (
        <div className="empty panel">
          <Building2 size={32} />
          <h2>Unable to load vendor negative adjustments.</h2>
          <p>Please click Reload or ensure the database is running.</p>
        </div>
      ) : (
        <>
          <section className="vn-summary" aria-label="Vendor balance summary">
            <div>
              <span>Total credit</span>
              <strong>
                {money(liveSummary.vendors.reduce((n, v) => n + (v.totalCredit ?? 0), 0))}
              </strong>
            </div>
            <div>
              <span>Vendor negative</span>
              <strong>{money(liveSummary.total)}</strong>
            </div>
            <div>
              <span>Remaining credit</span>
              <strong>
                {money(liveSummary.vendors.reduce((n, v) => n + (v.remainingCredit ?? 0), 0))}
              </strong>
            </div>
            <div className={savedLowCredit.length ? 'vn-summary-warning' : ''}>
              <span>Credit status · {liveSummary.vendors.length} vendors</span>
              {savedLowCredit.length ? (
                <button className="vn-alert-link" onClick={() => setDismissedCreditAlert(null)}>
                  <AlertTriangle size={16} /> {savedLowCredit.length} low credit · View alert
                </button>
              ) : (
                <strong className="vn-status-text">No low-credit alerts</strong>
              )}
            </div>
          </section>
          <div className="vn-summary-note">
            {dirty ? 'Live preview · Unsaved changes' : 'Saved balances'} · Blank credit is not
            included in credit totals
          </div>

          <section className="vendor-report-kpis" aria-label="Vendor negative spend by vendor">
            <div className="section-caption">
              <span>VENDOR NEGATIVE · BY VENDOR</span>
              <small>{dirty ? 'Live totals · Unsaved changes' : 'Saved totals'}</small>
            </div>
            <VendorSpendCards vendors={liveSummary.vendors} total={liveSummary.total} />
          </section>

          {/* Table Panel */}
          <section className="panel sheet-panel">
            <div className="panel-heading">
              <div>
                <h3>Vendor negative adjustments</h3>
                <p>USD · Remaining = total credit − vendor negative</p>
              </div>
              <div className="save-controls">
                <span className={dirty ? 'unsaved' : 'saved'}>
                  {dirty ? `${Object.keys(draft).length} unsaved changes` : 'All changes saved'}
                </span>
                <button
                  className="secondary"
                  disabled={dirty || busy}
                  onClick={() =>
                    downloadVendorNegative(
                      [report],
                      `vendor-negative-${new Date().toISOString().slice(0, 10)}`,
                    )
                  }
                  title="Download standing vendor negative report to CSV"
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
              <span>{liveSummary.vendors.length} vendors · Blank = not reported</span>
            </div>

            {dirty && (
              <p className="vendor-hint">
                Save your entries before adding, editing or restoring rows.
              </p>
            )}

            {!!report.config?.removedVendors?.length && (
              <details className="removed-rows">
                <summary>Restore removed rows ({report.config.removedVendors.length})</summary>
                {report.config.removedVendors.map((v) => (
                  <div key={v.row.id}>
                    <span>{v.row.name}</span>
                    <button
                      className="secondary"
                      disabled={busy || dirty}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await send(
                            `/vendor-negative-reports/${report.id}/rows/${v.row.id}`,
                            { version: report.version, action: 'restore' },
                            'PATCH',
                          );
                          loadSheet();
                        } catch (err) {
                          setError(err.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                  </div>
                ))}
              </details>
            )}

            <div className="table-scroll">
              <table className="entry-table vendor-negative-table">
                <thead>
                  <tr>
                    <th className="vn-th-vendor">Vendor</th>
                    <th className="vn-th-amount">Total Credit ($)</th>
                    <th className="vn-th-amount">Vendor Negative ($)</th>
                    <th className="vn-th-amount">Remaining Credit ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {liveSummary.vendors.map((v) => {
                    const isDirty = Object.hasOwn(draft[v.id] || {}, 'amount');
                    return (
                      <tr key={v.id}>
                        <td className="vn-vendor-cell">
                          <div className="vn-vendor-wrap">
                            <Building2 size={14} className="vn-vendor-icon" />
                            <span className="vn-vendor-name" title={v.name}>
                              {v.name}
                            </span>
                            <button
                              className="icon-btn row-edit vn-row-edit"
                              aria-label={`Edit vendor row ${v.name}`}
                              disabled={dirty || busy}
                              onClick={() => setModal({ kind: 'row', item: v })}
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="vn-amount-cell">
                          <input
                            type="number"
                            min="0"
                            max="9999999999.99"
                            step="0.01"
                            inputMode="decimal"
                            id={'vendor-credit-' + v.id}
                            aria-label={v.name + ' total credit'}
                            disabled={busy}
                            className={
                              Object.hasOwn(draft[v.id] || {}, 'total_credit')
                                ? 'cell-dirty vn-amount-input'
                                : 'vn-amount-input'
                            }
                            value={v.rawCredit}
                            placeholder="—"
                            onChange={(e) =>
                              handleAmountChange(v.id, e.target.value, 'total_credit')
                            }
                          />
                        </td>
                        <td className="vn-amount-cell">
                          <input
                            type="number"
                            min="0"
                            max="9999999999.99"
                            step="0.01"
                            inputMode="decimal"
                            aria-label={`${v.name} negative amount`}
                            disabled={busy}
                            className={isDirty ? 'cell-dirty vn-amount-input' : 'vn-amount-input'}
                            value={v.rawAmount ?? ''}
                            placeholder="—"
                            onChange={(e) => handleAmountChange(v.id, e.target.value)}
                          />
                        </td>
                        <td className={'vn-credit-balance' + (v.lowCredit ? ' is-low' : '')}>
                          <strong>
                            {v.remainingCredit === null ? '—' : money(v.remainingCredit)}
                          </strong>
                          {v.lowCredit && <small>Low credit · Recharge</small>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="vn-total-row">
                    <td className="vn-total-label">Totals</td>
                    <td className="vn-total-amount">
                      {money(liveSummary.vendors.reduce((n, v) => n + (v.totalCredit ?? 0), 0))}
                    </td>
                    <td className="vn-total-amount">{money(liveSummary.total)}</td>
                    <td className="vn-total-amount">
                      {money(liveSummary.vendors.reduce((n, v) => n + (v.remainingCredit ?? 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      {!!creditAlertKey && dismissedCreditAlert !== creditAlertKey && !modal && !loading && (
        <VendorCreditAlert
          vendors={savedLowCredit}
          close={() => setDismissedCreditAlert(creditAlertKey)}
          review={() => {
            setDismissedCreditAlert(creditAlertKey);
            document.getElementById('vendor-credit-' + savedLowCredit[0].id)?.focus();
          }}
        />
      )}
      {modal && (
        <VendorNegativeModal
          kind={modal.kind}
          item={modal.item}
          vendors={vendors}
          report={report}
          close={() => setModal(null)}
          onSaved={async () => {
            loadSheet();
          }}
        />
      )}
    </div>
  );
}
