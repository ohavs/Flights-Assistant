// Push to a trip's other members when one of them changes it (N5, Android).
// Who changed it comes from the write's own auth (…WithAuthContext), so
// the one who made the change is never told about it. Writes from the
// console or the Admin SDK (no app user) send nothing. What each change
// says, and to whom: handlers.js and push.js.
//
// Each phone lists itself under users/{uid}/devices/{deviceId} { token }
// while its "שינויים של שותפים" switch is on (src/lib/native/push.js).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreatedWithAuthContext, onDocumentUpdatedWithAuthContext } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { makeHandlers } from './handlers.js';

initializeApp();
const db = getFirestore();

// Near the Firestore database, which is where its triggers fire.
setGlobalOptions({ region: 'europe-west1', maxInstances: 5, memory: '256MiB' });

// One notification to every device of `uids`. Its tag makes a newer one
// replace the older one on the phone instead of piling up.
async function deliver(uids, { title, body }, { tripId, kind, tag, tab }) {
  if (!uids.length) return;
  const devices = (await Promise.all(uids.map(uid => db.collection(`users/${uid}/devices`).get())))
    .flatMap(s => s.docs).filter(d => d.get('token'));
  if (!devices.length) return;
  const res = await getMessaging().sendEach(devices.map(d => ({
    token: d.get('token'),
    notification: { title, body },
    data: { tripId, tab, kind },
    android: { notification: { tag, channelId: 'partners', icon: 'ic_stat_notify', color: '#22A45D' } },
  })));
  // A phone that uninstalled the app, or signed out offline: forget it.
  await Promise.all(res.responses.map((r, i) => {
    if (r.success || !/registration-token-not-registered|invalid-registration-token/.test(r.error?.code || '')) return null;
    return devices[i].ref.delete().catch(() => {});
  }));
  const failed = res.responses.filter(r => !r.success).length;
  if (failed) logger.warn('push: some sends failed', { kind, tripId, failed, of: devices.length });
}

const on = makeHandlers({ db, deliver });
const actorOf = (event) => (event.authType === 'app_user' && event.authId ? event.authId : null);

export const pushExpense = onDocumentCreatedWithAuthContext('trips/{tripId}/expenses/{expenseId}',
  (event) => on.expenseCreated(actorOf(event), event.params.tripId, event.data?.data()));

export const pushPlace = onDocumentCreatedWithAuthContext('trips/{tripId}/planning/{planId}',
  (event) => on.placeCreated(actorOf(event), event.params.tripId, event.data?.data()));

export const pushActivity = onDocumentUpdatedWithAuthContext('trips/{tripId}/days/{dayId}',
  (event) => on.dayUpdated(actorOf(event), event.params.tripId, event.data?.before.data(), event.data?.after.data()));

export const pushTrip = onDocumentUpdatedWithAuthContext('trips/{tripId}',
  (event) => on.tripUpdated(actorOf(event), event.params.tripId, event.data?.before.data(), event.data?.after.data()));
