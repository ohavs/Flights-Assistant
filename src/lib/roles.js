/* A member's role on a trip, and what it lets them do. The rules
   (firestore.rules) say the same; this is so the screens offer only what
   will be saved.

     owner, editor ('member' is an older editor) — everything
     contributor ("הוספה", 8.70.0) — adds anything; changes and deletes
       only what they added; ticks anyone's item (visited, packed, done);
       adds activities to the days, but not days
     viewer — reads                                                       */

export const EDIT_ROLES = ['owner', 'editor', 'member'];

export const canEditRole = (role) => EDIT_ROLES.includes(role);
export const canAddRole = (role) => canEditRole(role) || role === 'contributor';

// Who added it. Places and bookings said so as `addedBy` before
// `createdBy`; a reminder's `addedByUid` is whose it is, not who wrote it.
export const creatorOf = (item) => item?.createdBy || item?.addedBy || null;

// May this member change or delete this item?
export function mayChange(role, uid, item) {
  if (canEditRole(role)) return true;
  return role === 'contributor' && !!uid && creatorOf(item) === uid;
}

export const ROLE_LABEL = {
  owner: 'בעלים', editor: 'עריכה', member: 'עריכה', contributor: 'הוספה', viewer: 'צפייה',
};

// The choices when inviting or changing a member, in order.
export const ROLE_CHOICES = [
  { val: 'viewer', label: 'צפייה', desc: 'רואה הכל, לא משנה כלום' },
  { val: 'contributor', label: 'הוספה', desc: 'מוסיף הכל, ועורך ומוחק רק את מה שהוסיף' },
  { val: 'editor', label: 'עריכה', desc: 'עורך הכל: טיסות, מלון, תכנון וצ\'קליסט' },
];
