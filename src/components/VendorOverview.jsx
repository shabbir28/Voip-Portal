import React, { useEffect, useState } from 'react';
import { Building2, ArrowRight, Download, RefreshCw } from 'lucide-react';
import { api } from '../services/api.js';
import { aggregateVendors } from '../../shared/vendors.js';
import { money } from '../utils/format.js';
import VendorSpendCards from './VendorSpendCards.jsx';
import { downloadVendors } from '../utils/vendorDownload.js';
export default function VendorOverview({ range, onOpen }) {
  const [reports, setReports] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    api(`/vendor-reports?from=${range.from}&to=${range.to}`)
      .then((r) => {
        if (live) setReports(r);
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
  }, [range.from, range.to, retry]);
  const summary = aggregateVendors(reports);
  return (
    <section className="vendor-overview panel">
      <div className="panel-heading">
        <div>
          <h3>
            <Building2 size={17} /> Vendor spend
          </h3>
          <p>Hourly vendor reports · Separate from dialer spend</p>
        </div>
        <div className="save-controls">
          <button
            className="secondary"
            disabled={loading || !!error || !reports.length}
            onClick={() => downloadVendors(reports, `vendor-${range.from}-to-${range.to}`)}
          >
            <Download size={14} /> Download vendors
          </button>
          <button className="text-btn" onClick={onOpen}>
            View reports <ArrowRight size={14} />
          </button>
        </div>
      </div>
      {loading ? (
        <p className="vendor-message">Loading vendor totals…</p>
      ) : error ? (
        <div className="notice error" role="alert">
          {error}
          <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : (
        <>
          <div className="vendor-summary-strip">
            <div>
              <small>TOTAL VENDOR SPEND</small>
              <strong>{money(summary.total)}</strong>
            </div>
            <span>{summary.vendors.length} vendors</span>
            <span>{summary.reportCount} reports</span>
            <span>
              {summary.entered} / {summary.expected} entries
            </span>
          </div>
          {summary.vendors.length ? (
            <VendorSpendCards vendors={summary.vendors} total={summary.total} />
          ) : (
            <p className="vendor-message">
              No vendor reports in these dates. Create a vendor report to start tracking hourly
              spend.
            </p>
          )}
        </>
      )}
    </section>
  );
}
