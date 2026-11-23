import React from 'react';
import { Search } from 'lucide-react';
export default function Filter({ campaign, setCampaign, search, setSearch, groups }) {
  return (
    <div className="filters">
      <div className="filter-tabs">
        <button className={campaign === 'all' ? 'selected' : ''} onClick={() => setCampaign('all')}>
          All campaigns
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            className={campaign === String(g.id) ? 'selected' : ''}
            onClick={() => setCampaign(String(g.id))}
          >
            {g.name}
          </button>
        ))}
      </div>
      <label className="search">
        <Search size={16} />
        <input
          aria-label="Search dialers"
          placeholder="Search dialers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
    </div>
  );
}
