import { TIMEZONE_LABEL, timezoneAbbreviation } from '../../shared/time.js';
import CatalogEditModal from '../components/CatalogEditModal.jsx';
import ReportRowModal from '../components/ReportRowModal.jsx';
import VendorWorkspace from '../pages/VendorWorkspace.jsx';
import VendorNegativeWorkspace from '../pages/VendorNegativeWorkspace.jsx';
import VendorOverview from '../components/VendorOverview.jsx';
import UsersPage from '../pages/UsersPage.jsx';
import WorkspaceActivityPage from '../pages/WorkspaceActivityPage.jsx';
import React, { useEffect, useState, useRef } from 'react';
import {
  Activity,
  Users,
  Building2,
  ReceiptText,
  MinusCircle,
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileSpreadsheet,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { prettyDate, clockLabel } from '../utils/format.js';
import { api, send } from '../services/api.js';
import Brand from '../components/Brand.jsx';
import PoweredBy from '../components/PoweredBy.jsx';
import ProfileMenu from '../components/ProfileMenu.jsx';
import Auth from '../pages/AuthPage.jsx';
import PortalModal from '../components/WorkspaceModal.jsx';
import DailyReportPage from '../pages/DailyReportPage.jsx';
import OverviewPage from '../pages/OverviewPage.jsx';
import DialersPage from '../pages/DialersPage.jsx';
import DateRangePicker from '../components/DateRangePicker.jsx';
import AddReportDialerModal from '../components/AddReportDialerModal.jsx';
import { getDatePresets } from '../utils/dateRanges.js';
import { withDraft } from '../utils/reports.js';
import { summarize } from '../../shared/reporting.js';
import { downloadReports } from '../utils/download.js';
export default function App() {
  const [user, setUser] = useState(null),
    [status, setStatus] = useState(null),
    [bootError, setBootError] = useState('');
  const [page, setPage] = useState('overview'),
    [catalog, setCatalog] = useState({ campaigns: [], dialers: [] }),
    [sheets, setSheets] = useState([]),
    [selectedId, setSelectedId] = useState(null),
    [sheet, setSheet] = useState(null),
    [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null),
    [notice, setNotice] = useState(null),
    [campaign, setCampaign] = useState('all'),
    [search, setSearch] = useState(''),
    [draft, setDraft] = useState({}),
    [saving, setSaving] = useState(false);
  const [range, setRange] = useState(() => getDatePresets()[0]);
  const isSuperAdmin = user?.role === 'super_admin';
  const [activityRevision, setActivityRevision] = useState(0);
  const [vendorDirty, setVendorDirty] = useState(false);
  const vendorPage = page === 'vendor-reports' || page === 'vendors';
  function navigate(next) {
    if (next === page) return;
    if ((dirty || vendorDirty) && !window.confirm('Discard unsaved entries and leave this page?'))
      return;
    setDraft({});
    setVendorDirty(false);
    setPage(next);
  }
  const [rangeReports, setRangeReports] = useState([]),
    [allRangeReports, setAllRangeReports] = useState([]),
    [rangeLoading, setRangeLoading] = useState(false),
    [overviewScope, setOverviewScope] = useState('all'),
    [rowModal, setRowModal] = useState(null);
  const [editCatalog, setEditCatalog] = useState(null),
    [editRow, setEditRow] = useState(null),
    [showDeleted, setShowDeleted] = useState(false),
    [directoryCatalog, setDirectoryCatalog] = useState({ campaigns: [], dialers: [] }),
    [directoryBusy, setDirectoryBusy] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('voip_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('voip_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }
  useEffect(() => {
    let ignore = false;
    if (!showDeleted) {
      setDirectoryCatalog(catalog);
      return;
    }
    api('/catalog?includeDeleted=true')
      .then((data) => {
        if (!ignore) setDirectoryCatalog(data);
      })
      .catch(fail);
    return () => {
      ignore = true;
    };
  }, [showDeleted, catalog]);
  async function restoreCatalog(type, item) {
    setDirectoryBusy(true);
    try {
      await send(`/${type === 'campaign' ? 'campaigns' : 'dialers'}/${item.id}/restore`, {});
      await refreshCatalog();
      setNotice({ type: 'success', message: 'Item restored.' });
    } catch (e) {
      fail(e);
    } finally {
      setDirectoryBusy(false);
    }
  }
  async function rowChanged(action, dialerId) {
    if (action === 'clear' || action === 'remove')
      setDraft((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !key.startsWith(`${dialerId}:`)),
        ),
      );
    await loadSheet(sheet.id, true);
    await refreshSheets();
    setEditRow(null);
    setNotice({ type: 'success', message: 'Report row updated. Totals recalculated.' });
  }
  async function restoreRow(dialerId) {
    setSaving(true);
    try {
      await send(
        `/sheets/${sheet.id}/dialers/${dialerId}`,
        { version: sheet.version, action: 'restore' },
        'PATCH',
      );
      await rowChanged('restore', dialerId);
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  const requestId = useRef(0);
  const visibleSheets = sheets.filter(
    (s) =>
      s.report_date >= range.from &&
      s.report_date <= range.to &&
      (selectedAdminId === 'all' || !isSuperAdmin || Number(s.created_by) === Number(selectedAdminId)),
  );
  const dirty = Object.keys(draft).length > 0;
  useEffect(() => {
    const syncToday = () => {
      if (dirty || vendorDirty) return;
      const today = getDatePresets()[0];
      setRange((current) =>
        current.label === 'Today' && current.from !== today.from ? today : current,
      );
    };
    syncToday();
    const timer = setInterval(syncToday, 60000);
    return () => clearInterval(timer);
  }, [dirty, vendorDirty]);
  function fail(err) {
    setNotice({ type: 'error', message: err.message });
    if (err.status === 401) {
      setUser(null);
      setSheet(null);
      setDraft({});
    }
  }
  async function signOut() {
    if ((dirty || vendorDirty) && !window.confirm('Discard unsaved changes and sign out?')) return;
    try {
      await send('/logout', {});
      setUser(null);
      setSheet(null);
      setSelectedId(null);
      setDraft({});
      setVendorDirty(false);
    } catch (e) {
      fail(e);
    }
  }
  async function boot() {
    setBootError('');
    try {
      const s = await api('/status');
      setStatus(s);
      if (!s.needsSetup) {
        try {
          setUser((await api('/me')).user);
        } catch (e) {
          if (e.status !== 401) throw e;
        }
      }
    } catch (e) {
      setBootError(
        'Cannot reach the workspace. Make sure the Node server and PostgreSQL are running, then retry.',
      );
    }
  }
  useEffect(() => {
    boot();
  }, []);
  async function refreshCatalog() {
    const c = await api('/catalog');
    setCatalog(c);
    return c;
  }
  async function refreshSheets(adminId = selectedAdminId) {
    const query = isSuperAdmin
      ? `?adminView=true${adminId !== 'all' ? '&userId=' + adminId : ''}`
      : '';
    const s = await api(`/sheets${query}`);
    setSheets(s);
    return s;
  }
  useEffect(() => {
    if (user && isSuperAdmin) {
      api('/users?includeDeleted=false')
        .then((data) => {
          setAdminUsers(Array.isArray(data) ? data.filter((u) => !u.deleted_at) : []);
        })
        .catch(() => {});
    } else {
      setAdminUsers([]);
      setSelectedAdminId('all');
    }
  }, [user?.id, isSuperAdmin]);
  useEffect(() => {
    let cancelled = false;
    if (user) {
      const sheetsQuery = isSuperAdmin
        ? `?adminView=true${selectedAdminId !== 'all' ? '&userId=' + selectedAdminId : ''}`
        : '';
      Promise.all([api('/catalog'), api(`/sheets${sheetsQuery}`)])
        .then(([c, s]) => {
          if (!cancelled) {
            setCatalog(c);
            setSheets(s);
          }
        })
        .catch((e) => {
          if (!cancelled) fail(e);
        });
    }
    return () => {
      cancelled = true;
      requestId.current++;
    };
  }, [user?.id, isSuperAdmin, selectedAdminId]);
  async function loadSheet(sheetId, preserveDraft = false) {
    const sequence = ++requestId.current;
    setLoading(true);
    try {
      const query = isSuperAdmin ? '?adminView=true' : '';
      const result = await api(`/sheets/${sheetId}${query}`);
      if (sequence !== requestId.current) return;
      setSheet(result);
      if (!preserveDraft) setDraft({});
    } catch (e) {
      if (sequence === requestId.current) {
        fail(e);
        setSheet(null);
      }
    } finally {
      if (sequence === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setRangeLoading(true);
    setRangeReports([]);
    setAllRangeReports([]);
    const requests = [api(`/reports/range?from=${range.from}&to=${range.to}`)];
    if (isSuperAdmin) {
      requests.push(api(`/reports/range/all?from=${range.from}&to=${range.to}`));
    }
    Promise.all(requests)
      .then(([userData, allData]) => {
        if (!cancelled) {
          setRangeReports(userData || []);
          if (allData) setAllRangeReports(allData);
        }
      })
      .catch((e) => {
        if (!cancelled) fail(e);
      })
      .finally(() => {
        if (!cancelled) setRangeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, range.from, range.to, sheets, isSuperAdmin]);
  useEffect(() => {
    setSelectedId((previous) =>
      visibleSheets.some((s) => s.id === previous) ? previous : visibleSheets[0]?.id || null,
    );
  }, [sheets, range.from, range.to]);
  function changeRange(next) {
    if (dirty && !window.confirm('Discard unsaved entries and change the date range?')) return;
    setDraft({});
    setRange(next);
    setCampaign('all');
  }

  useEffect(() => {
    setSheet(null);
    if (selectedId) loadSheet(selectedId);
    else {
      requestId.current++;
      setLoading(false);
    }
  }, [selectedId]);
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (notice?.type === 'success') {
      const timer = setTimeout(() => setNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function switchSheet(value) {
    if (dirty && !window.confirm('Discard unsaved changes and switch reports?')) return;
    setDraft({});
    setSelectedId(Number(value));
    setCampaign('all');
  }
  async function saveEntries() {
    const entries = Object.entries(draft).map(([key, value]) => {
      const [dialer_id, slot] = key.split(':').map(Number);
      return { dialer_id, slot, amount: value === '' ? null : Number(value) };
    });
    if (
      entries.some(
        (e) =>
          e.amount !== null &&
          (!Number.isFinite(e.amount) ||
            e.amount < 0 ||
            e.amount > 9999999999.99 ||
            Math.abs(e.amount * 100 - Math.round(e.amount * 100)) > 0.0001),
      )
    )
      return setNotice({
        type: 'error',
        message: 'Use positive dollar amounts with up to 2 decimal places.',
      });
    setSaving(true);
    try {
      await send(`/sheets/${sheet.id}/entries`, { version: sheet.version, entries }, 'PUT');
      setDraft({});
      await loadSheet(sheet.id);
      await refreshSheets();
      setNotice({ type: 'success', message: `${entries.length} entries saved to PostgreSQL.` });
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  function exportCsv() {
    if (page === 'overview') {
      const activeList = isSuperAdmin && overviewScope === 'all' ? allRangeReports : rangeReports;
      downloadReports(
        activeList,
        `voip-${isSuperAdmin && overviewScope === 'all' ? 'all-' : ''}${range.from}-to-${range.to}`,
      );
    } else if (sheet) {
      downloadReports([sheet], `voip-${sheet.report_date}-${sheet.id}`, true);
    }
  }
  const liveEntries = withDraft(sheet, draft);
  const summary = sheet ? summarize(sheet.config, liveEntries) : null;
  const nav = [
    ['overview', LayoutDashboard, 'Overview'],
    ['sheets', FileSpreadsheet, 'Daily reports'],
    ['dialers', Radio, 'Dialers & campaigns'],
    ['vendor-reports', ReceiptText, 'Vendor reports'],
    ['vendor-negative', MinusCircle, 'Vendor negative'],
    ['vendors', Building2, 'Vendors'],
    ...(isSuperAdmin
      ? [
          ['users', Users, 'Users'],
          ['activity', Clock3, 'Activity log'],
        ]
      : []),
  ];
  const filteredDialers =
    summary?.dialers.filter(
      (d) =>
        (campaign === 'all' || String(d.campaign_id) === campaign) &&
        d.name.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  const groups = sheet
    ? [
        ...new Map(
          sheet.config.dialers.map((d) => [
            d.campaign_id,
            { id: d.campaign_id, name: d.campaign, color: d.color },
          ]),
        ).values(),
      ]
    : [];
  if (bootError)
    return (
      <div className="boot">
        <Brand />
        <h2>Let’s reconnect your workspace.</h2>
        <p>{bootError}</p>
        <button className="primary" onClick={boot}>
          <RefreshCw size={17} /> Retry connection
        </button>
      </div>
    );
  if (!status)
    return (
      <div className="boot">
        <LoaderCircle className="spin" />
        <p>Connecting to your workspace…</p>
      </div>
    );
  if (!user)
    return (
      <Auth
        setup={status.needsSetup}
        onLogin={(u) => {
          requestId.current++;
          setSheets([]);
          setRangeReports([]);
          setAllRangeReports([]);
          setSheet(null);
          setSelectedId(null);
          setDraft({});
          setVendorDirty(false);
          setNotice(null);
          setUser(u);
          setPage('overview');
          setOverviewScope('all');
          setRange(getDatePresets()[0]);
          setStatus({ ...status, needsSetup: false });
        }}
      />
    );
  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <Brand light />
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([key, Icon, label]) => (
            <button
              key={key}
              className={page === key ? 'active' : ''}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              {label}
              {key === 'sheets' && <span className="nav-count">{sheets.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="shift-note">
            <span className="shift-icon">
              <Clock3 size={19} />
            </span>
            <b>Every 30 minutes counts.</b>
            <p>Keep your dialer entries up to date for a clearer view of spend.</p>
            <button
              onClick={() => {
                navigate('sheets');
              }}
            >
              Open your report <ArrowRight size={14} />
            </button>
          </div>
          <button className="sidebar-help" onClick={() => setModal('help')}>
            <CircleHelp size={18} /> Workspace guide
          </button>
          <div className="user-block">
            <span className="user-avatar">{user.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <b>{user.name}</b>
              <small>{isSuperAdmin ? 'Super Admin' : 'Admin'}</small>
            </div>
            <button aria-label="Sign out" className="icon-btn" onClick={signOut}>
              <LogOut size={17} />
            </button>
          </div>
          <div className="sidebar-credit">
            <PoweredBy />
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="sidebar-toggle-btn"
              title={sidebarCollapsed ? 'Expand sidebar (show navigation)' : 'Collapse sidebar (full screen mode)'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <span>Workspace</span> <ChevronRight size={14} />
            <strong>{nav.find((n) => n[0] === page)?.[2]}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <span className="status-dot" />
              Database connected
            </span>
            <span className="timezone">
              {timezoneAbbreviation()} <span>{TIMEZONE_LABEL}</span>
            </span>
            <ProfileMenu
              user={user}
              onSignOut={signOut}
              onManageUsers={isSuperAdmin ? () => navigate('users') : undefined}
            />
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR OPERATIONS, AT A GLANCE</div>
              <h1>
                {page === 'overview'
                  ? 'Operations overview'
                  : page === 'users'
                    ? 'Users & access'
                    : page === 'vendor-negative'
                      ? 'Vendor negative'
                      : vendorPage
                        ? page === 'vendors'
                          ? 'Vendors'
                          : 'Vendor reports'
                        : page === 'sheets'
                          ? 'Daily reports'
                          : page === 'dialers'
                            ? 'Dialers & campaigns'
                            : 'Workspace activity'}
                <span className="heading-dot">.</span>
              </h1>
              <p className="muted">
                {page === 'overview'
                  ? 'A clear view of your VoIP spend, one interval at a time.'
                  : page === 'users'
                    ? 'Create accounts and give your team the right access.'
                    : page === 'vendor-negative'
                      ? 'Record and track vendor deductions, adjustments, and negative spend.'
                      : vendorPage
                        ? page === 'vendors'
                          ? 'Your vendor directory, organized and easy to manage.'
                          : 'Hourly vendor spend, with automatic totals and a familiar sheet.'
                        : page === 'sheets'
                          ? 'Your familiar spreadsheet. With totals that take care of themselves.'
                          : page === 'dialers'
                            ? 'Organize the dialers that power your daily operations.'
                            : 'A record of saved changes, so your team stays in sync.'}
              </p>
            </div>
            {!vendorPage && page !== 'vendor-negative' && page !== 'users' && page !== 'activity' && (
              <div className="heading-actions">
                {(page === 'overview' || page === 'sheets') && (
                  <button
                    className="secondary"
                    disabled={
                      dirty ||
                      (page === 'overview'
                        ? rangeLoading || !rangeReports.length
                        : !sheet || loading)
                    }
                    onClick={exportCsv}
                  >
                    <ArrowDownToLine size={16} />{' '}
                    {page === 'overview' ? 'Download range' : 'Download report'}
                  </button>
                )}
                <button
                  className="primary"
                  onClick={() => setModal(page === 'dialers' ? 'dialer' : 'sheet')}
                >
                  <Plus size={18} />
                  {page === 'dialers' ? 'Add dialer' : 'New report'}
                </button>
              </div>
            )}
          </div>
          {notice && (
            <div role="alert" className={`notice ${notice.type}`}>
              <span>
                {notice.type === 'success' && <Check size={16} />} {notice.message}
              </span>
              <button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}
          {page !== 'dialers' && page !== 'users' && page !== 'vendor-negative' && !vendorPage && (
            <div className="report-toolbar">
              <div className="report-toolbar-left">
                <DateRangePicker value={range} onChange={changeRange} disabled={saving} />
                {isSuperAdmin && page === 'sheets' && (
                  <div className="report-selector admin-selector-wrap" title="Filter daily reports by Admin">
                    <Users size={16} />
                    <select
                      aria-label="Filter reports by admin"
                      value={selectedAdminId}
                      onChange={(e) => {
                        if (dirty && !window.confirm('Discard unsaved entries and switch admin?')) return;
                        setDraft({});
                        setSelectedAdminId(e.target.value);
                      }}
                    >
                      <option value="all">👥 All Admins ({adminUsers.length})</option>
                      {adminUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          👤 {u.name} ({u.role === 'super_admin' ? 'Super Admin' : 'Admin'})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </div>
                )}
                {page === 'sheets' && (
                  <div className="report-selector">
                    <CalendarDays size={17} />
                    <select
                      aria-label="Select report"
                      value={selectedId || ''}
                      onChange={(e) => switchSheet(e.target.value)}
                    >
                      <option disabled value="">
                        Select a daily report
                      </option>
                      {visibleSheets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.creator_name ? `[${s.creator_name}] ` : ''}{prettyDate(s.report_date)} · {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </div>
                )}
                <span className="range-caption">
                  {range.from} — {range.to}
                </span>
              </div>
              <div className="report-toolbar-right">
                {sheet && page === 'sheets' && (
                  <span className="muted shift-label">
                    <Clock3 size={14} />
                    {clockLabel(sheet.config.slots[0].start)} –{' '}
                    {clockLabel(sheet.config.slots.at(-1).end)} ·{' '}
                    {timezoneAbbreviation(new Date(`${sheet.report_date}T12:00:00Z`))}
                  </span>
                )}
                <button
                  className="icon-btn"
                  title="Reload report"
                  aria-label="Reload report"
                  disabled={saving || loading || rangeLoading}
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm('Discard unsaved changes and reload the latest report?')
                    ) {
                      if (selectedId) loadSheet(selectedId);
                      setActivityRevision((value) => value + 1);
                      refreshSheets().catch(fail);
                    }
                  }}
                >
                  <RefreshCw size={16} className={loading ? 'spin' : ''} />
                </button>
              </div>
            </div>
          )}
          {loading && page === 'sheets' && (
            <div className="loading-line">
              <LoaderCircle size={16} className="spin" /> Loading report…
            </div>
          )}
          {page === 'sheets' && !sheet && !loading && (
            <div className="empty panel">
              <span className="empty-icon">
                <FileSpreadsheet size={32} />
              </span>
              <h2>No reports in this date range.</h2>
              <p>Choose another date range, or create a report for this shift.</p>
              <button className="primary" onClick={() => setModal('sheet')}>
                <Plus size={17} /> Create daily report
              </button>
              <div className="empty-features">
                <span>
                  <CheckCheck size={16} /> Automatic totals
                </span>
                <span>
                  <ShieldCheck size={16} /> Saved to PostgreSQL
                </span>
                <span>
                  <Clock3 size={16} /> Night-shift ready
                </span>
              </div>
            </div>
          )}
          {page === 'overview' && (
            <>
              <OverviewPage
                vendorOverview={
                  <VendorOverview
                    range={range}
                    onOpen={() => navigate('vendor-reports')}
                    isSuperAdmin={isSuperAdmin}
                    allUsers={overviewScope === 'all'}
                  />
                }
                catalog={catalog}
                reports={rangeReports}
                allReports={allRangeReports}
                isSuperAdmin={isSuperAdmin}
                scope={overviewScope}
                onScopeChange={setOverviewScope}
                loading={rangeLoading}
                range={range}
                onOpen={(id) => {
                  switchSheet(id);
                  setPage('sheets');
                }}
              />
            </>
          )}
          {page === 'vendor-negative' && (
            <VendorNegativeWorkspace onDirty={setVendorDirty} />
          )}
          {vendorPage && (
            <VendorWorkspace
              key={page}
              page={page}
              range={range}
              onRange={setRange}
              onDirty={setVendorDirty}
              canViewActivity={isSuperAdmin}
              isSuperAdmin={isSuperAdmin}
            />
          )}
          {page === 'sheets' && sheet && (
            <DailyReportPage
              {...{
                sheet,
                summary,
                dirty,
                draft,
                saving,
                saveEntries,
                campaign,
                setCampaign,
                search,
                setSearch,
                groups,
                filteredDialers,
                setDraft,
                liveEntries,
              }}
              onEditRow={setEditRow}
              onRestoreRow={restoreRow}
              onAddDialer={(campaignId) => setRowModal({ campaignId })}
            />
          )}
          {page === 'dialers' && (
            <DialersPage
              catalog={directoryCatalog}
              setModal={setModal}
              onEdit={(type, item) => setEditCatalog({ type, item })}
              onRestore={restoreCatalog}
              showDeleted={showDeleted}
              onToggleDeleted={() => setShowDeleted((v) => !v)}
              directoryBusy={directoryBusy}
            />
          )}
          {page === 'activity' && isSuperAdmin && (
            <WorkspaceActivityPage key={activityRevision} range={range} />
          )}
          {page === 'users' && isSuperAdmin && (
            <UsersPage
              currentUser={user}
              onUserUpdated={(updated) => {
                if (updated.id !== user.id) return;
                if (updated.reauthenticate) {
                  setUser(null);
                  setSheet(null);
                  setSelectedId(null);
                  setDraft({});
                  setPage('overview');
                } else
                  setUser((current) => ({
                    ...current,
                    name: updated.name,
                    email: updated.email,
                    role: updated.role,
                  }));
              }}
            />
          )}
          <footer className="main-footer">
            <span>
              Voip Portal <i /> A little clarity for every shift.
            </span>
            <span>
              <ShieldCheck size={13} /> Your data, in your PostgreSQL database
            </span>
          </footer>
        </main>
      </div>
      {editCatalog && (
        <CatalogEditModal
          {...editCatalog}
          catalog={catalog}
          close={() => setEditCatalog(null)}
          onChanged={async () => {
            await refreshCatalog();
            setEditCatalog(null);
            setNotice({
              type: 'success',
              message: 'Directory updated. Existing reports preserved.',
            });
          }}
        />
      )}
      {editRow && sheet && (
        <ReportRowModal
          row={editRow}
          sheet={sheet}
          close={() => setEditRow(null)}
          onChanged={rowChanged}
        />
      )}
      {rowModal && sheet && (
        <AddReportDialerModal
          sheet={sheet}
          catalog={catalog}
          campaignId={rowModal.campaignId}
          dirty={dirty}
          close={() => setRowModal(null)}
          onAdded={async () => {
            await loadSheet(sheet.id, true);
            await Promise.all([refreshCatalog(), refreshSheets()]);
            setRowModal(null);
            setNotice({
              type: 'success',
              message: 'Dialer row added. Existing price entries preserved.',
            });
          }}
        />
      )}
      {modal && (
        <PortalModal
          modal={modal}
          close={() => setModal(null)}
          catalog={catalog}
          onError={fail}
          onCreated={async (type, result) => {
            setModal(null);
            if (type === 'sheet') {
              setDraft({});
              const updated = await refreshSheets();
              const created = updated.find((s) => s.id === result.id);
              if (created && (created.report_date < range.from || created.report_date > range.to))
                setRange({
                  label: 'Custom Range',
                  from: created.report_date,
                  to: created.report_date,
                });
              setSelectedId(result.id);
              setPage('sheets');
              setCampaign('all');
            } else await refreshCatalog();
            setNotice({
              type: 'success',
              message: `${type === 'sheet' ? 'Daily report' : type === 'campaign' ? 'Campaign' : 'Dialer'} created successfully.`,
            });
          }}
          dirty={dirty}
        />
      )}
    </div>
  );
}
