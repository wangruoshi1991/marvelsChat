import {
  GestureResponderEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScrollViewProps,
} from 'react-native';

/** Scroll hooks used by V15 floor pages for the bottom-edge return gesture. */
export type SecondFloorPageScrollProps = Pick<
  ScrollViewProps,
  | 'alwaysBounceVertical'
  | 'onScroll'
  | 'onScrollBeginDrag'
  | 'onScrollEndDrag'
  | 'onMomentumScrollEnd'
  | 'onTouchStart'
  | 'onTouchMove'
  | 'onTouchEnd'
  | 'onTouchCancel'
  | 'onContentSizeChange'
  | 'onLayout'
  | 'scrollEventThrottle'
> & {
  /** Capture touch phases before a nested Pressable takes the responder. */
  onTouchStartCapture?: (event: GestureResponderEvent) => void;
  onTouchEndCapture?: (event: GestureResponderEvent) => void;
};

export type SecondFloorPageScrollEvent =
  NativeSyntheticEvent<NativeScrollEvent>;
