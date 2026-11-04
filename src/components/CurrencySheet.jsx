import { useState } from 'react';
import { Search, Check } from 'lucide-react';
import Sheet from '../ui/Sheet';
import SectionHeader from '../ui/SectionHeader';
import { CURRENCY_META } from '../services/currency';
import { getCurrencyInfo } from './expenseStyle';

const ALL_CURRENCIES = Object.entries(CURRENCY_META).map(([code, meta]) => ({ code, ...meta }));

// The currency, over a form: the trip's own (`quick`) on top, every other
// under them, with a search. The expense form and a payment's ("בינינו").
export default function CurrencySheet({ value, quick: quickCodes, onPick, onClose }) {
  const [search, setSearch] = useState('');
  return (
    <Sheet
      label="מטבע"
      onClose={onClose}
      style={{ maxHeight: '80vh' }}
      header={({ close }) => (
        <div className="modal-header origin-picker-head">
          <div className="origin-picker-title">
            <h2>מטבע</h2>
            <button type="button" aria-label="סגור" className="btn-close" onClick={close}>✕</button>
          </div>
          <div className="origin-picker-search">
            <Search size={18} aria-hidden="true" />
            <input type="search" enterKeyHint="search" className="form-control" placeholder="חיפוש מטבע"
              aria-label="חיפוש מטבע" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      )}
    >
      {({ close }) => {
        const q = search.trim().toLowerCase();
        const match = (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
        const quick = quickCodes.map(getCurrencyInfo).filter(match);
        const rest = ALL_CURRENCIES.filter(c => !quickCodes.includes(c.code)).filter(match);
        const row = (c) => (
          <button key={c.code} type="button" role="radio" aria-checked={value === c.code} className="list-row"
            onClick={() => { onPick(c.code); close(); }}>
            <span className="exp-cur-symbol" aria-hidden="true">{c.symbol}</span>
            <span className="list-row-label">{c.name}<span className="list-row-hint">{c.code}</span></span>
            {value === c.code && <Check size={16} aria-hidden="true" />}
          </button>
        );
        return (
          <div className="place-picker">
            {quick.length > 0 && (
              <section className="origin-picker-group">
                <SectionHeader title="בטיול הזה" />
                <div className="list-group" role="radiogroup" aria-label="בטיול הזה">{quick.map(row)}</div>
              </section>
            )}
            {rest.length > 0 && (
              <section className="origin-picker-group">
                <SectionHeader title="כל המטבעות" />
                <div className="list-group" role="radiogroup" aria-label="כל המטבעות">{rest.map(row)}</div>
              </section>
            )}
            {!quick.length && !rest.length && <div className="place-picker-empty">לא נמצא מטבע</div>}
          </div>
        );
      }}
    </Sheet>
  );
}
