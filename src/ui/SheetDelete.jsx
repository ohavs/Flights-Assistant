import { Trash2 } from 'lucide-react';

/* Delete, at the end of an edit sheet's footer. Tapping an item opens its
   sheet, and everything about the item is there: edit, and this. `onDelete`
   asks first and resolves true once the item is gone; the sheet then
   closes.                                                                */
export default function SheetDelete({ onDelete, close }) {
  return (
    <button type="button" className="btn-secondary danger btn-icon" aria-label="מחיקה" title="מחיקה"
      onClick={async () => { if (await onDelete()) close(); }}>
      <Trash2 size={18} />
    </button>
  );
}
