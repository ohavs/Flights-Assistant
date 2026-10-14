// Firestore writes for the trip root document (/trips/{tripId}).
//
// The trip document also holds `members`, `name`, `destination` and other
// fields that other screens (and other clients) own. Writes here must only
// touch the fields they change — never replace the whole document — or those
// fields are lost (losing `members` makes the trip unreadable for everyone).
import { doc, updateDoc } from 'firebase/firestore';

// Saves the flight & hotel edit form. Each map is replaced as a whole (the
// form edits all of its fields); every other top-level field is left alone.
export function saveFlightAndHotelDetails(db, tripId, { outboundFlightDetails, returnFlightDetails, hotelDetails }) {
  return updateDoc(doc(db, 'trips', tripId), {
    outboundFlightDetails,
    returnFlightDetails,
    hotelDetails
  });
}

// Inline date change on a flight card. `type` is 'outbound' or 'return'.
export function updateFlightDate(db, tripId, type, date) {
  const field = type === 'outbound' ? 'outboundFlightDetails' : 'returnFlightDetails';
  return updateDoc(doc(db, 'trips', tripId), { [`${field}.date`]: date });
}
