import React, { useEffect, useState } from 'react';
import { LoaderCircle, Plus, Save } from 'lucide-react';
import Modal from './Modal.jsx';
import { send } from '../services/api.js';
import { today } from '../utils/format.js';
export default function WorkspaceModal({ modal, close, catalog, onCreated, dirty }) {
  const type = typeof modal === 'string' ? modal : modal.type;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(catalog.dialers.map((d) => d.id));
  async function submit(e) {
    e.preventDefault();
    if (
      type === 'sheet' &&
      dirty &&
      !window.confirm('Discard unsaved changes and create a new report?')
    )
      return;
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (type === 'sheet') data.dialer_ids = selected;
    try {
      const result = await send(
        type === 'sheet' ? '/sheets' : type === 'campaign' ? '/campaigns' : '/dialers',
        data,
      );
      await onCreated(type, result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (type === 'help')
    return (
      <Modal
        title="Your reporting workspace"
        subtitle="A quick guide to daily operations."
        close={close}
      >
        <div className="guide">
          {[
            [
              '01',
              'Choose dates',
              'Use the date picker to view today, this week, this month, or a custom range. Overview totals include every report in that range.',
            ],
            [
              '02',
              'Record your spend',
              'Open a daily report and enter each interval amount. Totals update immediately. Blank means not reported; zero is a confirmed zero. Save changes to store the entries.',
            ],
            [
              '03',
              'Add rows and download',
              'Add a new or existing dialer directly to a campaign in the report. Download report exports the spreadsheet; Download range exports all interval records for the selected dates.',
            ],
          ].map(([n, title, body]) => (
            <div key={n}>
              <span>{n}</span>
              <section>
                <b>{title}</b>
                <p>{body}</p>
              </section>
            </div>
          ))}
        </div>
      </Modal>
    );
  return (
    <Modal
      title={
        type === 'sheet' ? 'New daily report' : type === 'campaign' ? 'New campaign' : 'New dialer'
      }
      subtitle={
        type === 'sheet'
          ? 'Select the shift and dialers for this report.'
          : 'Organize your reporting directory.'
      }
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        {type === 'sheet' ? (
          <>
            <label>
              Report name
              <input name="name" defaultValue="Balitech · VoIP report" required maxLength={100} />
            </label>
            <div className="form-row">
              <label>
                Shift start date
                <input type="date" name="report_date" defaultValue={today()} required />
              </label>
              <label>
                Timezone
                <input value="US Eastern (EST / EDT)" readOnly />
              </label>
            </div>
            <div className="form-row">
              <label>
                Shift starts
                <input type="time" name="start" defaultValue="18:30" step="1800" required />
              </label>
              <label>
                Shift ends
                <input type="time" name="end" defaultValue="04:30" step="1800" required />
              </label>
            </div>
            <p className="field-hint">An earlier end time continues into the next day.</p>
            <div className="dialer-select-title">
              <b>
                Include dialers <span className="count-chip">{selected.length}</span>
              </b>
              <button
                className="text-btn"
                type="button"
                onClick={() =>
                  setSelected(
                    selected.length === catalog.dialers.length
                      ? []
                      : catalog.dialers.map((d) => d.id),
                  )
                }
              >
                {selected.length === catalog.dialers.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="dialer-picker">
              {catalog.campaigns.map((c) => (
                <div key={c.id}>
                  <b>{c.name}</b>
                  {catalog.dialers
                    .filter((d) => d.campaign_id === c.id)
                    .map((d) => (
                      <label className="checkbox-label" key={d.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(d.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id),
                            )
                          }
                        />
                        {d.name}
                      </label>
                    ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <label>
              {type === 'campaign' ? 'Campaign name' : 'Dialer name'}
              <input
                name="name"
                required
                maxLength={100}
                placeholder={type === 'campaign' ? 'e.g. ACA Outbound' : 'e.g. ACA_Balitech_i7'}
              />
            </label>
            {type === 'campaign' ? (
              <label>
                Campaign color
                <input type="color" name="color" defaultValue="#7557de" />
              </label>
            ) : (
              <label>
                Campaign
                <select
                  name="campaign_id"
                  defaultValue={modal.campaignId || catalog.campaigns[0]?.id}
                  required
                >
                  {catalog.campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
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
          <button className="primary" disabled={busy || (type === 'sheet' && !selected.length)}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}{' '}
            {type === 'sheet'
              ? 'Create report'
              : type === 'campaign'
                ? 'Create campaign'
                : 'Add dialer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
