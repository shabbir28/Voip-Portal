import React, { useState } from 'react';
import { Plus, Radio, Search, Layers3, Pencil, RotateCcw } from 'lucide-react';
export default function DialersPage({
  catalog,
  setModal,
  onEdit,
  onRestore,
  showDeleted,
  onToggleDeleted,
  directoryBusy,
}) {
  const [search, setSearch] = useState(''),
    [campaign, setCampaign] = useState('all');
  const filtered = catalog.dialers.filter(
    (d) =>
      (campaign === 'all' || String(d.campaign_id) === campaign) &&
      d.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="directory-mode">
        <button
          className={showDeleted ? 'secondary selected' : 'secondary'}
          onClick={onToggleDeleted}
        >
          {showDeleted ? 'Show active items' : 'Deleted items'}
        </button>
        <span>
          {showDeleted
            ? 'Restore a deleted campaign to make its active dialers available again.'
            : 'Edit names and campaigns, or delete items from your directory.'}
        </span>
      </div>
      <div className="catalog-workspace">
        <aside className="panel campaign-directory">
          <div className="panel-heading">
            <h3>
              Campaigns <span className="count-chip">{catalog.campaigns.length}</span>
            </h3>
            <button
              className="icon-btn"
              aria-label="Add campaign"
              onClick={() => setModal('campaign')}
            >
              <Plus size={17} />
            </button>
          </div>
          <button
            className={`campaign-directory-row ${campaign === 'all' ? 'selected' : ''}`}
            onClick={() => setCampaign('all')}
          >
            <Layers3 size={16} />
            <b>All campaigns</b>
            <span>{catalog.dialers.length}</span>
          </button>
          {catalog.campaigns.map((c) => (
            <div className="campaign-directory-item" key={c.id}>
              <button
                className={`campaign-directory-row ${campaign === String(c.id) ? 'selected' : ''}`}
                onClick={() => setCampaign(String(c.id))}
              >
                <i style={{ background: c.color }} />
                <b>
                  {c.name}
                  {c.deleted_at ? ' · Deleted' : ''}
                </b>
                <span>{catalog.dialers.filter((d) => d.campaign_id === c.id).length}</span>
              </button>
              {c.deleted_at ? (
                <button
                  className="icon-btn"
                  aria-label={`Restore campaign ${c.name}`}
                  disabled={directoryBusy}
                  onClick={() => onRestore('campaign', c)}
                >
                  <RotateCcw size={13} />
                </button>
              ) : (
                <button
                  className="icon-btn"
                  aria-label={`Edit campaign ${c.name}`}
                  onClick={() => onEdit('campaign', c)}
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          ))}
          <button className="text-btn directory-add" onClick={() => setModal('campaign')}>
            <Plus size={14} /> New campaign
          </button>
        </aside>
        <section className="panel dialer-directory">
          <div className="panel-heading">
            <div>
              <h3>
                {campaign === 'all'
                  ? 'All dialers'
                  : catalog.campaigns.find((c) => String(c.id) === campaign)?.name}{' '}
                <span className="count-chip">{filtered.length}</span>
              </h3>
              <p>Manage your reporting dialer directory</p>
            </div>
            <button
              className="secondary"
              onClick={() =>
                setModal({
                  type: 'dialer',
                  campaignId: campaign === 'all' ? undefined : Number(campaign),
                })
              }
            >
              <Plus size={14} /> Add dialer
            </button>
          </div>
          <div className="directory-search">
            <label className="search">
              <Search size={15} />
              <input
                aria-label="Search directory"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a dialer..."
              />
            </label>
          </div>
          <div className="table-wrap">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Dialer name</th>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const c = catalog.campaigns.find((c) => c.id === d.campaign_id);
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="dialer-cell">
                          <span className="dialer-icon">
                            <Radio size={14} />
                          </span>
                          <b>{d.name}</b>
                        </span>
                      </td>
                      <td>
                        <span className="campaign-badge" style={{ '--campaign-color': c.color }}>
                          {c.name}
                        </span>
                      </td>
                      <td>
                        <span className="status-chip complete">
                          <i />{' '}
                          {d.deleted_at ? 'Deleted' : c.deleted_at ? 'Campaign deleted' : 'Active'}
                        </span>
                      </td>
                      <td>
                        {d.deleted_at ? (
                          <button
                            className="icon-btn"
                            aria-label={`Restore dialer ${d.name}`}
                            disabled={directoryBusy}
                            onClick={() => onRestore('dialer', d)}
                          >
                            <RotateCcw size={14} />
                          </button>
                        ) : (
                          !c.deleted_at && (
                            <button
                              className="icon-btn"
                              aria-label={`Edit dialer ${d.name}`}
                              onClick={() => onEdit('dialer', d)}
                            >
                              <Pencil size={14} />
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="small-empty">
                No dialers found. Add a dialer or adjust your search.
              </div>
            )}
          </div>
          <div className="table-footer">
            Add these dialers to new reports, or use “Add dialer row” inside an existing daily
            report.
          </div>
        </section>
      </div>
    </>
  );
}
