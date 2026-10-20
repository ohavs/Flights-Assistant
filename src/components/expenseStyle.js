import { Utensils, Bus, BedDouble, Ticket, ShoppingBag, Receipt } from 'lucide-react';
import { CURRENCY_META } from '../services/currency';

// An icon and a colour per category, so a row reads at a glance like a
// place in the planning tab. A category the trip added gets the receipt.
const EXPENSE_CATEGORY_STYLE = {
  'אוכל ושתייה': { Icon: Utensils, color: '#F97316' },
  'תחבורה': { Icon: Bus, color: '#3B82F6' },
  'לינה': { Icon: BedDouble, color: '#8B5CF6' },
  'בידור ותיירות': { Icon: Ticket, color: '#EC4899' },
  'קניות': { Icon: ShoppingBag, color: '#14B8A6' },
};
export const expenseCategoryStyle = (cat) => EXPENSE_CATEGORY_STYLE[cat] || { Icon: Receipt, color: '#64748B' };

export const getCurrencyInfo = (code) => {
  const meta = CURRENCY_META[code];
  return meta ? { code, ...meta } : { code, symbol: code, name: code, flag: '' };
};

// "₪1,450", "€42.5": whole shekels, up to two decimals in the currency paid.
export const shekels = (n) => `₪${Math.round(Math.abs(n)).toLocaleString('he-IL')}`;
export const money = (n, code) => `${getCurrencyInfo(code).symbol}${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

// What a row is called: its description, else the place it is linked to,
// else its category.
export const expenseLabel = (e, plans = []) =>
  e.description || plans.find(p => p.id === e.linkedPlanId)?.title || e.customPlace || e.category || 'הוצאה';

// "13.11" — the day it was written down. Older documents may hold a number.
export function expenseDay(createdAt) {
  if (createdAt == null || createdAt === '') return null;
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : `${d.getDate()}.${d.getMonth() + 1}`;
}
