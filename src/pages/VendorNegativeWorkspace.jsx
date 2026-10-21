import React, { useEffect, useState } from 'react';
import {
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
import VendorSpendCards from '../components/VendorSpendCards.jsx';
import { money } from '../utils/format.js';
import { downloadVendorNegative } from '../utils/vendorNegativeDownload.js';

export default function VendorNegativeWorkspace({
  onDirty,
}) {
  const [vendors, setVendors] = useState([]);
  const [report, setReport] = useState(null);
  const [draft, setDraft] = useState({});
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
      const rawAmount = Object.hasOwn(draft, v.id)
        ? draft[v.id]
        : (savedMap.get(v.id)?.amount ?? '');

      const numAmount = rawAmount !== '' && !Number.isNaN(Number(rawAmount))
        ? Math.max(0, Number(rawAmount))
        : 0;

      return {
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
        const rawAmount = Object.hasOwn(draft, v.id)
          ? draft[v.id]
          : (savedMap.get(v.id)?.amount ?? '');

        const numAmount = rawAmount === '' || Number.isNaN(Number(rawAmount))
          ? null
          : Math.max(0, Number(rawAmount));

        return {
          vendor_id: v.id,
          amount: numAmount,
        };
      });

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

  function handleAmountChange(vendorId, val) {
    setDraft((prev) => ({
      ...prev,
      [vendorId]: val,
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
        <span className="range-caption">
          Standing Vendor Negative Adjustments · Permanent Balance
        </span>
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
          {/* Vendor Spend Cards Section */}
          <section className="vendor-report-kpis" aria-label="Vendor negative spend">
            <div className="section-caption">
              <span>VENDOR NEGATIVE · STANDING ADJUSTMENTS</span>
              <small>
                {dirty
                  ? 'Live totals · Includes unsaved entries'
                  : 'Current saved totals'}
              </small>
            </div>
            <VendorSpendCards vendors={liveSummary.vendors} total={liveSummary.total} />
          </section>

          {/* Table Panel */}
          <section className="panel sheet-panel">
            <div className="panel-heading">
              <div>
                <h3>Vendor negative adjustments</h3>
                <p>
                  Enter negative spend in USD · Blank = not reported · Changes persist permanently
                </p>
              </div>
              <div className="save-controls">
                <span className={dirty ? 'unsaved' : 'saved'}>
                  {dirty
                    ? `${Object.keys(draft).length} unsaved changes`
                    : 'All changes saved'}
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
                <button
                  className="primary"
                  disabled={!dirty || busy}
                  onClick={save}
                >
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
                Current vendor negative total <b>{money(liveSummary.total)}</b>
              </span>
            </div>

            {dirty && (
              <p className="vendor-hint">
                Save your entries before adding, editing or restoring rows.
              </p>
            )}

            {!!report.config?.removedVendors?.length && (
              <details className="removed-rows">
                <summary>
                  Restore removed rows ({report.config.removedVendors.length})
                </summary>
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
                    <th className="vn-th-amount">Vendor Negative ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {liveSummary.vendors.map((v) => {
                    const isDirty = Object.hasOwn(draft, v.id);
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
                            aria-label={`${v.name} negative amount`}
                            disabled={busy}
                            className={isDirty ? 'cell-dirty vn-amount-input' : 'vn-amount-input'}
                            value={v.rawAmount ?? ''}
                            placeholder="—"
                            onChange={(e) => handleAmountChange(v.id, e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="vn-total-row">
                    <td className="vn-total-label">Total Vendor Negative</td>
                    <td className="vn-total-amount">{money(liveSummary.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
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
