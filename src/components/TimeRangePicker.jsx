import React, { useState, useEffect, useRef } from 'react';
import { Clock3, ChevronDown, Check, LoaderCircle } from 'lucide-react';
import { clockLabel } from '../utils/format.js';
import {
  HALF_HOUR_TIMES,
  addMinutesToTime,
  makeSlots,
  DEFAULT_SHIFT_START,
  DEFAULT_SHIFT_LAST_SLOT,
} from '../../shared/reporting.js';

const PRESETS = [
  { label: '6:30 PM – 5:00 AM (Default)', start: '18:30', lastSlot: '05:00' },
  { label: '6:00 PM – 5:00 AM', start: '18:00', lastSlot: '05:00' },
  { label: '6:30 PM – 4:00 AM', start: '18:30', lastSlot: '04:00' },
  { label: '6:00 PM – 4:00 AM', start: '18:00', lastSlot: '04:00' },
  { label: '6:30 PM – 5:30 AM', start: '18:30', lastSlot: '05:30' },
  { label: '6:00 PM – 6:00 AM', start: '18:00', lastSlot: '06:00' },
];

export default function TimeRangePicker({
  slots = [],
  timezoneAbbr = 'EDT',
  disabled = false,
  onApply,
}) {
  const currentStart = slots[0]?.start || DEFAULT_SHIFT_START;
  const currentLastSlot = slots.at(-1)?.start || DEFAULT_SHIFT_LAST_SLOT;

  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(currentStart);
  const [lastSlot, setLastSlot] = useState(currentLastSlot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    setStart(currentStart);
    setLastSlot(currentLastSlot);
    setError('');
  }, [currentStart, currentLastSlot, open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const previewEnd = addMinutesToTime(lastSlot, 30);
  const previewSlots = makeSlots(start, previewEnd);
  const isValid = previewSlots.length >= 1 && previewSlots.length <= 47;

  async function applySelection(nextStart, nextLastSlot) {
    const endBoundary = addMinutesToTime(nextLastSlot, 30);
    const computed = makeSlots(nextStart, endBoundary);
    if (computed.length < 1 || computed.length > 47) {
      setError('Please select a valid time range (1 to 47 intervals).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onApply(nextStart, endBoundary);
      setOpen(false);
    } catch (err) {
      setError(err?.message || 'Failed to update time range.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="time-range-picker" ref={wrapRef}>
      <button
        type="button"
        className={`time-range-trigger ${open ? 'is-open' : ''}`}
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        title="Change report time range (start and end columns)"
        aria-label="Select report time range"
      >
        <Clock3 size={14} />
        <span>
          {clockLabel(currentStart)} – {clockLabel(currentLastSlot)} · {timezoneAbbr}
        </span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="time-range-menu" role="dialog" aria-label="Select report time range">
          <div className="date-menu-title">
            <strong>REPORT TIME RANGE</strong>
            <span>{previewSlots.length} columns (30m)</span>
          </div>

          <div className="time-presets">
            {PRESETS.map((p) => {
              const chosen = p.start === currentStart && p.lastSlot === currentLastSlot;
              const count = makeSlots(p.start, addMinutesToTime(p.lastSlot, 30)).length;
              return (
                <button
                  key={`${p.start}-${p.lastSlot}`}
                  type="button"
                  className={chosen ? 'chosen' : ''}
                  disabled={busy}
                  onClick={() => {
                    setStart(p.start);
                    setLastSlot(p.lastSlot);
                    applySelection(p.start, p.lastSlot);
                  }}
                >
                  <span>{p.label}</span>
                  <small>{count} slots</small>
                  {chosen && <Check size={14} />}
                </button>
              );
            })}
          </div>

          <div className="custom-time-range">
            <div className="custom-time-title">Custom Time Range (Start & End Column)</div>
            <div className="time-select-row">
              <label>
                First column (Start)
                <select
                  value={start}
                  disabled={busy}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setError('');
                  }}
                >
                  {HALF_HOUR_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {clockLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Last column (End)
                <select
                  value={lastSlot}
                  disabled={busy}
                  onChange={(e) => {
                    setLastSlot(e.target.value);
                    setError('');
                  }}
                >
                  {HALF_HOUR_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {clockLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="time-range-summary">
              Columns: <b>{clockLabel(start)}</b> to <b>{clockLabel(lastSlot)}</b> (
              {previewSlots.length} intervals)
            </div>
            {error && <p className="range-error">{error}</p>}
            <button
              type="button"
              className="primary time-apply-btn"
              disabled={busy || !isValid}
              onClick={() => applySelection(start, lastSlot)}
            >
              {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Apply time
              range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

