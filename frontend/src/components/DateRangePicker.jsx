import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, Check } from 'lucide-react';
import { getDatePresets } from '../utils/dateRanges.js';
export default function DateRangePicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false),
    [custom, setCustom] = useState(false),
    [from, setFrom] = useState(value.from),
    [to, setTo] = useState(value.to),
    [error, setError] = useState('');
  const root = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);
  function select(range) {
    onChange(range);
    setOpen(false);
    setCustom(false);
    setError('');
  }
  return (
    <div
      className="date-range"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        className={`date-trigger ${open ? 'is-open' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        aria-label="Filter by date range"
        onClick={() => setOpen(!open)}
      >
        <CalendarDays size={15} />
        {value.label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="date-menu" role="dialog" aria-label="Date range">
          <div className="date-menu-title">
            REPORT DATE <span>US Eastern</span>
          </div>
          {getDatePresets().map((p) => (
            <button
              key={p.label}
              className={value.label === p.label ? 'chosen' : ''}
              onClick={() => select(p)}
            >
              <span>{p.label}</span>
              <small>{p.from === p.to ? p.from : `${p.from} — ${p.to}`}</small>
              {value.label === p.label && <Check size={13} />}
            </button>
          ))}
          <button
            className={custom ? 'chosen' : ''}
            onClick={() => {
              setCustom(!custom);
              setFrom(value.from);
              setTo(value.to);
            }}
          >
            <span>Custom Range</span>
            <CalendarDays size={15} />
          </button>
          {custom && (
            <form
              className="custom-range"
              onSubmit={(e) => {
                e.preventDefault();
                if (from > to) return setError('End date must be on or after start date.');
                if ((new Date(to) - new Date(from)) / 86400000 > 365)
                  return setError('Choose a range of up to 366 days.');
                select({ label: 'Custom Range', from, to });
              }}
            >
              <div className="form-row">
                <label>
                  From
                  <input
                    type="date"
                    aria-label="Range start"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    required
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    aria-label="Range end"
                    value={to}
                    min={from}
                    onChange={(e) => setTo(e.target.value)}
                    required
                  />
                </label>
              </div>
              {error && (
                <p role="alert" className="range-error">
                  {error}
                </p>
              )}
              <button className="primary full" type="submit">
                Apply range
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
