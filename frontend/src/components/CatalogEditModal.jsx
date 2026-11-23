import React, { useState } from 'react';
import { Save, Trash2, LoaderCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { send } from '../services/api.js';
export default function CatalogEditModal({ item, type, catalog, close, onChanged }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [deleting, setDeleting] = useState(false);
  const endpoint = type === 'campaign' ? '/campaigns' : '/dialers';
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      await send(`${endpoint}/${item.id}`, data, deleting ? 'DELETE' : 'PATCH');
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${deleting ? 'Delete' : 'Edit'} ${type}`}
      subtitle={
        deleting
          ? 'This item can be restored from Deleted items.'
          : 'Changes apply to your directory and future reports. Existing report names stay unchanged.'
      }
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        {deleting ? (
          <div className="delete-explanation">
            <b>{item.name}</b>
            <p>
              {type === 'campaign'
                ? 'This campaign and its dialers will be hidden from the active directory.'
                : 'This dialer will be hidden from the active directory.'}{' '}
              Existing report entries and totals are preserved.
            </p>
          </div>
        ) : (
          <>
            <label>
              Name
              <input name="name" defaultValue={item.name} required maxLength={100} />
            </label>
            {type === 'campaign' ? (
              <label>
                Color
                <input name="color" type="color" defaultValue={item.color} />
              </label>
            ) : (
              <label>
                Campaign
                <select name="campaign_id" defaultValue={item.campaign_id} required>
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
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div className="modal-actions">
          {!deleting && (
            <button
              type="button"
              className="danger-outline"
              disabled={busy}
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={deleting ? () => setDeleting(false) : close}
          >
            {deleting ? 'Back' : 'Cancel'}
          </button>
          <button className={deleting ? 'danger' : 'primary'} disabled={busy}>
            {busy ? (
              <LoaderCircle size={14} className="spin" />
            ) : deleting ? (
              <Trash2 size={14} />
            ) : (
              <Save size={14} />
            )}{' '}
            {deleting ? 'Delete ' + type : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
