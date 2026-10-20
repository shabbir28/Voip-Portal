import React, { useState } from 'react';
import { Save, Trash2, Eraser, LoaderCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { send } from '../services/api.js';
export default function ReportRowModal({ row, sheet, close, onChanged }) {
  const [action, setAction] = useState('rename'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await send(
        `/sheets/${sheet.id}/dialers/${row.id}`,
        {
          version: sheet.version,
          action,
          name: new FormData(e.currentTarget).get('name') || undefined,
        },
        'PATCH',
      );
      await onChanged(action, row.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Edit report row"
      subtitle={`${row.campaign} · ${row.name}`}
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <div className="mode-switch">
          <button
            type="button"
            className={action === 'rename' ? 'selected' : ''}
            onClick={() => setAction('rename')}
          >
            Rename
          </button>
          <button
            type="button"
            className={action === 'clear' ? 'selected' : ''}
            onClick={() => setAction('clear')}
          >
            Clear entries
          </button>
          <button
            type="button"
            className={action === 'remove' ? 'selected' : ''}
            onClick={() => setAction('remove')}
          >
            Remove row
          </button>
        </div>
        {action === 'rename' ? (
          <label>
            Row name
            <input name="name" defaultValue={row.name} maxLength={100} required />
            <small>
              Updates this report only. Use the directory to rename the dialer for future reports.
            </small>
          </label>
        ) : (
          <div className="delete-explanation">
            <p>
              {action === 'clear'
                ? 'Clear all amounts for this dialer in this report. The row remains available for new entries.'
                : 'Remove this dialer and its amounts from this report. You can recover the saved row using Restore removed rows.'}{' '}
              Totals will recalculate.
            </p>
            <p>
              Any unsaved changes in this row will be discarded. Other rows keep their unsaved
              changes.
            </p>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button className="secondary" type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button className={action === 'rename' ? 'primary' : 'danger'} disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={14} />
            ) : action === 'rename' ? (
              <Save size={14} />
            ) : action === 'clear' ? (
              <Eraser size={14} />
            ) : (
              <Trash2 size={14} />
            )}{' '}
            {action === 'rename'
              ? 'Save name'
              : action === 'clear'
                ? 'Clear entries'
                : 'Remove row'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
