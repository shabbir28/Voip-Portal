import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { send } from '../services/api.js';
import { todayInZone } from '../../shared/time.js';
export default function VendorModal({ kind, item, vendors = [], report, close, onSaved }) {
  const [name, setName] = useState(item?.name || (kind === 'report' ? 'Vendor night shift' : '')),
    [date, setDate] = useState(todayInZone()),
    [ids, setIds] = useState(vendors.filter((v) => !v.deleted_at).map((v) => v.id)),
    [selected, setSelected] = useState(''),
    [action, setAction] = useState('rename'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const title =
    kind === 'report'
      ? 'New vendor report'
      : kind === 'add-row'
        ? 'Add vendor row'
        : kind === 'row'
          ? 'Edit vendor row'
          : item
            ? 'Edit vendor'
            : 'Add vendor';
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let result;
      if (kind === 'report')
        result = await send('/vendor-reports', { name, report_date: date, vendor_ids: ids });
      else if (kind === 'row' || kind === 'add-row')
        result = await send(
          `/vendor-reports/${report.id}/rows/${kind === 'row' ? item.id : selected}`,
          {
            version: report.version,
            action: kind === 'row' ? action : 'add',
            ...(action === 'rename' ? { name } : {}),
          },
          'PATCH',
        );
      else if (action === 'delete') result = await send(`/vendors/${item.id}`, {}, 'DELETE');
      else
        result = await send(
          `/vendors${item ? `/${item.id}` : ''}`,
          { name },
          item ? 'PATCH' : 'POST',
        );
      await onSaved(result);
      close();
    } catch (e) {
      setError(e.message);
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
          ? '10 hourly intervals · 6 PM–4 AM · US Eastern (EST/EDT)'
          : kind === 'row'
            ? 'Changes apply to this report only.'
            : 'Manage your vendor reporting workspace.'
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
                {a === 'rename' ? 'Rename' : a === 'clear' ? 'Clear entries' : 'Remove row'}
              </button>
            ))}
          </div>
        )}
        {action === 'delete' || action === 'remove' || action === 'clear' ? (
          <div className="delete-explanation">
            <b>
              {action === 'clear'
                ? 'Clear saved amounts'
                : action === 'remove'
                  ? 'Remove this row'
                  : 'Delete vendor'}
              : {item?.name}?
            </b>
            <p>
              {action === 'clear'
                ? 'All amounts in this row will become blank. The audit history retains the previous values.'
                : action === 'remove'
                  ? 'This row and its amounts will leave this report’s totals. You can restore them from Removed rows.'
                  : 'This vendor will be hidden from new reports. Existing reports stay unchanged, and you can restore the vendor from Show deleted.'}
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
                : 'All active vendors are already included. Add a new vendor in Vendors or restore a removed row.'}
            </small>
          </label>
        ) : (
          <label>
            {kind === 'report' ? 'Report name' : kind === 'row' ? 'Row name' : 'Vendor name'}
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
                        setIds(e.target.checked ? [...ids, v.id] : ids.filter((id) => id !== v.id))
                      }
                    />
                    {v.name}
                  </label>
                ))}
              {!vendors.some((v) => !v.deleted_at) && <p>Add an active vendor in Vendors first.</p>}
            </div>
          </>
        )}
        <div className="modal-actions">
          {kind === 'vendor' && item && action !== 'delete' && (
            <button
              className="danger-outline"
              type="button"
              disabled={busy}
              onClick={() => setAction('delete')}
            >
              Delete vendor
            </button>
          )}
          <button type="button" className="secondary" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            className={['delete', 'remove', 'clear'].includes(action) ? 'danger' : 'primary'}
            disabled={busy || (kind === 'report' && !ids.length)}
          >
            {busy
              ? 'Saving…'
              : action === 'delete'
                ? 'Confirm delete'
                : action === 'remove'
                  ? 'Confirm remove'
                  : action === 'clear'
                    ? 'Clear entries'
                    : kind === 'report'
                      ? 'Create report'
                      : kind === 'add-row'
                        ? 'Add row'
                        : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
