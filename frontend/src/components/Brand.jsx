import React from 'react';
import { PhoneCall } from 'lucide-react';
export default function Brand({ light = false }) {
  return (
    <div className={`brand powered-brand ${light ? 'light' : ''}`}>
      {light && (
        <span className="portal-logo" aria-hidden="true">
          <PhoneCall size={21} strokeWidth={1.8} />
        </span>
      )}
      <div className="brand-product">
        VoIP <span>Portal</span>
      </div>
    </div>
  );
}
