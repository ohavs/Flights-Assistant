import { createContext, useContext } from 'react';

// Provides the current user's role on the active trip down the tree so
// edit-only UI can hide/disable for viewers without prop-drilling.
const TripContext = createContext({
  tripId: null,
  role: null,      // 'owner' | 'editor' | 'member' | 'viewer'
  canEdit: false,
  isOwner: false,
  ownerProfile: null,
  currentUid: null,
  currentUserProfile: null,
  memberProfiles: {},
  tripMembers: {},
});

export const TripProvider = TripContext.Provider;

export function useTrip() {
  return useContext(TripContext);
}
