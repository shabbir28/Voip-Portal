import React, { useState } from 'react';
import { Plus, LoaderCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { send } from '../services/api.js';
export default function AddReportDialerModal({
  sheet,
  catalog,
  campaignId,
  close,
  onAdded,
  dirty,
}) {
  const [campaign, setCampaign] = useState(campaignId || catalog.campaigns[0]?.id || ''),
    [mode, setMode] = useState('new'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const available = catalog.dialers.filter(
    (d) =>
      d.campaign_id === Number(campaign) && !sheet.config.dialers.some((row) => row.id === d.id),
  );
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      await send(`/sheets/${sheet.id}/dialers`, {
        version: sheet.version,
        campaign_id: Number(campaign),
        ...(mode === 'new'
          ? { name: form.get('name') }
          : { dialer_id: Number(form.get('dialer_id')) }),
      });
      await onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add a dialer row"
      subtitle={`Add to ${sheet.name}. Existing amounts stay in place.`}
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <label>
          Campaign
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)} required>
            {catalog.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mode-switch">
          <button
            type="button"
            className={mode === 'new' ? 'selected' : ''}
            onClick={() => setMode('new')}
          >
            New dialer
          </button>
          <button
            type="button"
            className={mode === 'existing' ? 'selected' : ''}
            onClick={() => setMode('existing')}
          >
            Existing dialer
          </button>
        </div>
        {mode === 'new' ? (
          <label>
            Dialer name
            <input name="name" placeholder="e.g. ACA_Balitech_i7" maxLength={100} required />
          </label>
        ) : (
          <label>
            Select dialer
            <select name="dialer_id" required key={campaign}>
              <option value="">Choose an available dialer</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {!available.length && (
              <small>No other dialers in this campaign. Create a new one.</small>
            )}
          </label>
        )}
        {dirty && (
          <p className="field-hint">
            Your unsaved price entries will be kept while adding this row.
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy || (mode === 'existing' && !available.length)}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />} Add row
          </button>
        </div>
      </form>
    </Modal>
  );
}
