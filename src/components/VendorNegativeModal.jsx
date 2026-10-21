import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { send } from '../services/api.js';
import { todayInZone } from '../../shared/time.js';

export default function VendorNegativeModal({
  kind,
  item,
  vendors = [],
  report,
  close,
  onSaved,
}) {
  const [name, setName] = useState(
    item?.name || (kind === 'report' ? 'Vendor negative shift' : ''),
  );
  const [date, setDate] = useState(todayInZone());
  const [ids, setIds] = useState(
    vendors.filter((v) => !v.deleted_at).map((v) => v.id),
  );
  const [selected, setSelected] = useState('');
  const [action, setAction] = useState('rename');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const title =
    kind === 'report'
      ? 'New vendor negative report'
      : kind === 'add-row'
        ? 'Add vendor row'
        : 'Edit vendor row';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let result;
      if (kind === 'report') {
        result = await send('/vendor-negative-reports', {
          name,
          report_date: date,
          vendor_ids: ids,
        });
      } else if (kind === 'row' || kind === 'add-row') {
        result = await send(
          `/vendor-negative-reports/${report.id}/rows/${kind === 'row' ? item.id : selected}`,
          {
            version: report.version,
            action: kind === 'row' ? action : 'add',
            ...(action === 'rename' ? { name } : {}),
          },
          'PATCH',
        );
      }
      await onSaved(result);
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const available = vendors.filter(
    (v) =>
      !v.deleted_at &&
      !report?.config.vendors.some((r) => r.id === v.id) &&
      !report?.config.removedVendors?.some((r) => r.row.id === v.id),
  );

  return (
    <Modal
      title={title}
      subtitle={
        kind === 'report'
          ? 'Record vendor deductions and negative adjustments'
          : kind === 'row'
            ? 'Changes apply to this report only.'
            : 'Manage your vendor negative workspace.'
      }
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {kind === 'row' && (
          <div className="vendor-modal-tabs">
            {['rename', 'clear', 'remove'].map((a) => (
              <button
                type="button"
                className={action === a ? 'primary' : 'secondary'}
                key={a}
                disabled={busy}
                onClick={() => setAction(a)}
              >
                {a === 'rename' ? 'Rename' : a === 'clear' ? 'Clear amount' : 'Remove row'}
              </button>
            ))}
          </div>
        )}

        {action === 'remove' || action === 'clear' ? (
          <div className="delete-explanation">
            <b>
              {action === 'clear'
                ? 'Clear saved negative amount'
                : 'Remove this row'}
              : {item?.name}?
            </b>
            <p>
              {action === 'clear'
                ? 'The negative amount in this row will be cleared to zero.'
                : 'This row will leave this report’s totals. You can restore it from Removed rows at any time.'}
            </p>
          </div>
        ) : kind === 'add-row' ? (
          <label>
            Vendor
            <select
              required
              value={selected}
              disabled={busy}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a vendor</option>
              {available.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <small>
              {available.length
                ? 'Choose an existing vendor.'
                : 'All active vendors are already included. Restore a removed row if needed.'}
            </small>
          </label>
        ) : (
          <label>
            {kind === 'report' ? 'Report name' : 'Row name'}
            <input
              required
              maxLength={100}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}

        {kind === 'report' && (
          <>
            <label>
              Report start date (US Eastern)
              <input
                type="date"
                required
                value={date}
                disabled={busy}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <div className="vendor-select-list">
              <b>Include vendors</b>
              {vendors
                .filter((v) => !v.deleted_at)
                .map((v) => (
                  <label key={v.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(v.id)}
                      disabled={busy}
                      onChange={(e) =>
                        setIds(
                          e.target.checked
                            ? [...ids, v.id]
                            : ids.filter((id) => id !== v.id),
                        )
                      }
                    />
                    {v.name}
                  </label>
                ))}
              {!vendors.some((v) => !v.deleted_at) && (
                <p>Add an active vendor in Vendors first.</p>
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            className={['remove', 'clear'].includes(action) ? 'danger' : 'primary'}
            disabled={busy || (kind === 'report' && !ids.length) || (kind === 'add-row' && !selected)}
          >
            {busy
              ? 'Saving…'
              : action === 'remove'
                ? 'Remove row'
                : action === 'clear'
                  ? 'Clear amount'
                  : kind === 'report'
                    ? 'Create report'
                    : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
