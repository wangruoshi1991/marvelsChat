import { spacing } from '../theme';

export const stationProfileStyles = {
  // Prototype `.me-profile`: 12px radius, 18px padding. Its `min-height:
  // 35dvh` is applied at render time, where the window height is known.
  stationIdentityCard: {
    borderRadius: 12,
    gap: 0,
    padding: 18,
  },
  // Prototype `.me-profile-kicker`: teal eyebrow. Its colour is the design's
  // own `#15938e`, not the product accent.
  stationIdentityKicker: {
    color: '#15938E',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  // Prototype `.me-profile-main`: two columns — the avatar cell at 42%, the
  // identity copy filling the rest — with an 18px gap.
  stationIdentityTopRowWithStage: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
  },
  // Prototype `.me-avatar-wrap`: 9px radius, pale teal plate. Its width and
  // height are animated against the measured row, so no flex basis here — a
  // `flexBasis` would outrank the animated `width` in Yoga.
  stationIdentityStage: {
    backgroundColor: '#C8F0EF',
    flexGrow: 0,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  // The 3D stage and the 46px fallback occupy the same box, cross-fading as
  // the card collapses, so the WebView is resized rather than remounted.
  stationIdentityStageFiller: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  stationIdentityAvatarFiller: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  // Prototype `.me-avatar-badge`: 23px online check on the block's corner.
  stationIdentityStageBadge: {
    alignItems: 'center',
    backgroundColor: '#129B96',
    borderColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 2,
    bottom: 7,
    height: 23,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    width: 23,
  },
  stationIdentityCopy: { flex: 1, gap: 0, minWidth: 0 },
  // Prototype `.me-identity h1`: 1.35rem, tight tracking.
  stationIdentityName: { fontSize: 21, fontWeight: '700', lineHeight: 25 },
  // Prototype `.me-id`: a 99px pill, not bare text.
  stationIdentityIdPill: {
    alignSelf: 'flex-start',
    borderRadius: 99,
    marginTop: 7,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stationIdentityId: { fontSize: 12, lineHeight: 16 },
  // Prototype `.me-location`: 6px gap, 10px above, muted small text.
  stationIdentityLocation: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    minHeight: 20,
  },
  // Prototype `.me-location`: `#8d8d94`.
  stationIdentityLocationText: {
    color: '#8D8D94',
    fontSize: 12,
    lineHeight: 16,
  },
  // Prototype `.me-bio`: 12px above, 0.9rem, 1.55 line height, `#4f4f56`.
  stationIdentityBio: {
    color: '#4F4F56',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  stationIdentityTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  stationIdentityTag: {
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stationIdentityTagText: {
    fontSize: 11,
    lineHeight: 15,
  },
  // Prototype `.me-switch`: 2 equal segments in one rounded trough, sitting
  // directly under the profile card.
  stationSwitch: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    marginHorizontal: 14,
    marginVertical: 8,
    padding: 4,
  },
  stationSwitchV6: {
    backgroundColor: '#FFFFFF08',
    borderColor: 'transparent',
  },
  stationSwitchButton: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  // Prototype `.me-switch-button[aria-selected="true"]`:
  // `box-shadow: 0 3px 12px rgba(28,28,36,.08)` — a barely-there lift, not a
  // heavy drop. RN has no `rgba()` shadow, so the colour and the 8% alpha are
  // set separately.
  stationSwitchButtonSelected: {
    shadowColor: '#1C1C24',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  stationSwitchButtonSelectedV6: { backgroundColor: '#3A4257' },
  // Prototype `.me-switch-button:active { transform: scale(.97) }`.
  stationSwitchButtonPressed: { transform: [{ scale: 0.97 }] },
  stationSwitchText: { fontSize: 14, fontWeight: '700' },
  stationTabsViewport: { flex: 1, minWidth: 0 },
  stationTabs: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: 4,
  },
  stationTabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 64,
    paddingHorizontal: 10,
    position: 'relative',
  },
  stationTabLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
  },
  stationTabText: { textAlign: 'center' },
  stationTabTextActive: { fontSize: 12, fontWeight: '700' },
  stationTabTextInactive: { fontSize: 11, fontWeight: '400' },
  stationTabIndicator: {
    backgroundColor: '#0B8271',
    borderRadius: 2,
    bottom: 3,
    height: 3,
    position: 'absolute',
    width: 22,
  },
  stationNavSettings: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
  },
  profileDataRow: {
    alignItems: 'center',
    borderRadius: spacing.cardRadius,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  profileDataTitle: { fontSize: 12, fontWeight: '700' },
  profileDataValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  locationHero: {
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 14,
    padding: 14,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  locationHeroTitle: { fontSize: 24, fontWeight: '900' },
  locationHeroDetail: { fontSize: 14, fontWeight: '800' },
  locationStatusText: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
  locationSection: {
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    gap: 9,
    marginHorizontal: 14,
    padding: 12,
  },
  locationSectionTitle: { fontSize: 12, fontWeight: '900' },
  locationCandidate: {
    alignItems: 'center',
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  locationCandidateCopy: { flex: 1, gap: 3 },
  locationCandidateName: { fontSize: 14, fontWeight: '900' },
  locationCandidateDetail: { fontSize: 11, fontWeight: '700' },
  locationSelectedDot: { borderRadius: 999, height: 10, width: 10 },
  locationEmptyText: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
} as const;
