import type { ImageSourcePropType } from 'react-native';

const asset = (source: ImageSourcePropType) => source;

export const messageIconAssets = {
  actionAdd: asset(require('./messages/action-add.png')),
  actionSearchContacts: asset(require('./messages/action-search-contacts.png')),
  agentAvatars: {
    butler: asset(require('./messages/avatar-butler.png')),
    datingExpert: asset(require('./messages/avatar-dating-expert.png')),
    globalScout: asset(require('./messages/avatar-global-scout.png')),
    nearbyStories: asset(require('./messages/avatar-nearby-stories.png')),
    neighborhoodHelp: asset(require('./messages/avatar-neighborhood-help.png')),
  },
  tabMessagesActive: asset(require('./messages/tab-messages-active.png')),
  tabStationInactive: asset(require('./messages/tab-station-inactive.png')),
} as const;

export const notificationIconAssets = {
  favoriteReminder: asset(require('./notifications/favorite-reminder.png')),
  general: asset(require('./notifications/general.png')),
  orderAssistant: asset(require('./notifications/order-assistant.png')),
} as const;

export const settingsIconAssets = {
  digitalIdentity: asset(require('./settings/digital-identity.png')),
  edit: asset(require('./settings/edit.png')),
  files: asset(require('./settings/files.png')),
  notifications: asset(require('./settings/notifications.png')),
  permissions: asset(require('./settings/permissions.png')),
} as const;

export const composerIconAssets = {
  imageActive: asset(require('./composer/image-active.png')),
  imageEntry: asset(require('./composer/image-entry.png')),
  imageInactive: asset(require('./composer/image-inactive.png')),
  textActive: asset(require('./composer/text-active.png')),
  textEntry: asset(require('./composer/text-entry.png')),
  textInactive: asset(require('./composer/text-inactive.png')),
  videoActive: asset(require('./composer/video-active.png')),
  videoEntry: asset(require('./composer/video-entry.png')),
  videoInactive: asset(require('./composer/video-inactive.png')),
} as const;

export const contactIconAssets = {
  back: asset(require('./contacts/back.png')),
  nearbyEvents: asset(require('./contacts/nearby-events.png')),
} as const;

export const pointIconAssets = {
  banner: asset(require('./points/banner.png')),
  decrease: asset(require('./points/decrease.png')),
  increase: asset(require('./points/increase.png')),
} as const;

export const stationPostIconAssets = {
  add: asset(require('./station/posts/add.png')),
  comment: asset(require('./station/posts/comment.png')),
  favoriteActive: asset(require('./station/posts/favorite-active.png')),
  favoriteInactive: asset(require('./station/posts/favorite-inactive.png')),
  likeActive: asset(require('./station/posts/like-active.png')),
  likeInactive: asset(require('./station/posts/like-inactive.png')),
  more: asset(require('./station/posts/more.png')),
  photo: asset(require('./station/posts/photo.png')),
  tabMessagesInactive: asset(
    require('./station/posts/tab-messages-inactive.png'),
  ),
  tabStationActive: asset(require('./station/posts/tab-station-active.png')),
  text: asset(require('./station/posts/text.png')),
  time: asset(require('./station/posts/time.png')),
  video: asset(require('./station/posts/video.png')),
} as const;

export const stationPartnerIconAssets = {
  collectionOrganizer: asset(
    require('./station/partners/collection-organizer.png'),
  ),
  eventCompanion: asset(require('./station/partners/event-companion.png')),
  gigWork: asset(require('./station/partners/gig-work.png')),
  marketplace: asset(require('./station/partners/marketplace.png')),
  miaoxunAssistant: asset(require('./station/partners/miaoxun-assistant.png')),
  personalBrand: asset(require('./station/partners/personal-brand.png')),
  resale: asset(require('./station/partners/resale.png')),
  travelInspiration: asset(
    require('./station/partners/travel-inspiration.png'),
  ),
} as const;
