import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
export default function Modal({ title, subtitle, children, close }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section role="dialog" aria-modal="true" aria-label={title} className="modal">
        <button className="icon-btn modal-close" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
        <div className="eyebrow">VOIP WORKSPACE</div>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
        {children}
      </section>
    </div>
  );
}
