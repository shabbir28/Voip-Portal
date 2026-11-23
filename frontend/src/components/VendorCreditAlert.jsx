import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { money } from '../utils/format.js';

export default function VendorCreditAlert({ vendors, close, review }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="vn-credit-dialog"
      aria-labelledby="vn-alert-title"
      aria-describedby="vn-alert-description"
      onCancel={close}
    >
      <button className="vn-dialog-close" aria-label="Dismiss low credit alert" onClick={close}>
        <X size={18} />
      </button>
      <div className="vn-dialog-icon">
        <AlertTriangle size={24} />
      </div>
      <h2 id="vn-alert-title">Low credit — recharge required</h2>
      <p id="vn-alert-description">
        The following vendors have $1,000.00 or less remaining. Please recharge to avoid service
        interruption.
      </p>
      <ul className="vn-dialog-balances">
        {vendors.map((v) => (
          <li key={v.id}>
            <span>{v.name}</span>
            <strong>
              {money(v.remainingCredit)}
              <small>remaining</small>
            </strong>
          </li>
        ))}
      </ul>
      <div className="vn-dialog-actions">
        <button className="secondary" onClick={close}>
          Dismiss
        </button>
        <button className="primary" onClick={review}>
          Review credit
        </button>
      </div>
    </dialog>
  );
}
