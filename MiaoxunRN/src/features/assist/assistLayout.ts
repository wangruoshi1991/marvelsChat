import { AIAssistDirection, AIAssistPoint } from './aiAssistTypes';

export type AssistBounds = { width: number; height: number };
export type AssistFrame = AIAssistPoint & AssistBounds;
export type AIAssistLabelPlacement = 'above' | 'below';
export type AIAssistActionFrame = AssistFrame & {
  labelPlacement: AIAssistLabelPlacement;
};
export type AIAssistPlacement =
  | 'interior'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left';
export type AIAssistTargetLayout = Record<
  AIAssistDirection,
  AIAssistActionFrame
> & {
  center: AIAssistPoint;
  placement: AIAssistPlacement;
};

const targetSize = 48;
const radius = 72;
const edgeLateralOffset = 66;
const edgeFanAcross = 30;
const edgeFanInward = 66;
const sideFanInward = 66;
const sideFanAlong = 43;
const labelGap = 5;
const labelLineHeight = 16;
const labelHeight = 32;
const labelMinWidth = 32;
const labelMaxWidth = 72;
const viewportMargin = 6;
const selectedScaleOutset = targetSize * 0.06;
const hitSlop = 6;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function normalizedRange(min: number, max: number) {
  if (min <= max) return { min, max };
  const midpoint = (min + max) / 2;
  return { min: midpoint, max: midpoint };
}

function circleCenterRange(length: number) {
  const inset = targetSize / 2 + selectedScaleOutset + hitSlop;
  return normalizedRange(inset, length - inset);
}

function labelPlacementFor(
  direction: AIAssistDirection,
  placement: AIAssistPlacement,
): AIAssistLabelPlacement {
  if (placement === 'top') return 'below';
  if (placement === 'bottom' && direction === 'down') return 'above';
  if (direction === 'up') return 'above';
  return 'below';
}

function verticalCenterRange(
  bounds: AssistBounds,
  labelPlacement: AIAssistLabelPlacement,
) {
  const circleRange = circleCenterRange(bounds.height);
  const labelledInset =
    targetSize / 2 + labelGap + labelHeight + viewportMargin;
  return labelPlacement === 'above'
    ? normalizedRange(labelledInset, circleRange.max)
    : normalizedRange(circleRange.min, bounds.height - labelledInset);
}

function resolvePlacement(
  touch: AIAssistPoint,
  bounds: AssistBounds,
): AIAssistPlacement {
  const labelledExtent =
    radius + targetSize / 2 + labelGap + labelHeight + viewportMargin;
  const circleExtent = radius + targetSize / 2 + selectedScaleOutset + hitSlop;
  const overflow: Array<[Exclude<AIAssistPlacement, 'interior'>, number]> = [
    ['top', labelledExtent - touch.y],
    ['right', touch.x + circleExtent - bounds.width],
    ['bottom', touch.y + labelledExtent - bounds.height],
    ['left', circleExtent - touch.x],
  ];
  const [placement, amount] = overflow.reduce((largest, candidate) =>
    candidate[1] > largest[1] ? candidate : largest,
  );
  return amount > 0 ? placement : 'interior';
}

function offsetsForPlacement(
  placement: AIAssistPlacement,
): Record<AIAssistDirection, AIAssistPoint> {
  if (placement === 'top') {
    return {
      up: { x: -edgeFanAcross, y: edgeFanInward },
      right: { x: edgeLateralOffset, y: 0 },
      down: { x: edgeFanAcross, y: edgeFanInward },
      left: { x: -edgeLateralOffset, y: 0 },
    };
  }
  if (placement === 'right') {
    return {
      up: { x: 0, y: -radius },
      right: { x: -sideFanInward, y: -sideFanAlong },
      down: { x: 0, y: radius },
      left: { x: -sideFanInward, y: sideFanAlong },
    };
  }
  if (placement === 'bottom') {
    return {
      up: { x: -edgeFanAcross, y: -edgeFanInward },
      right: { x: edgeLateralOffset, y: 0 },
      down: { x: edgeFanAcross, y: -edgeFanInward },
      left: { x: -edgeLateralOffset, y: 0 },
    };
  }
  if (placement === 'left') {
    return {
      up: { x: 0, y: -radius },
      right: { x: sideFanInward, y: -sideFanAlong },
      down: { x: 0, y: radius },
      left: { x: sideFanInward, y: sideFanAlong },
    };
  }
  return {
    up: { x: 0, y: -radius },
    right: { x: radius, y: 0 },
    down: { x: 0, y: radius },
    left: { x: -radius, y: 0 },
  };
}

function shiftIntoRanges(
  values: number[],
  ranges: Array<{ min: number; max: number }>,
) {
  const minimumShift = Math.max(
    ...values.map((value, index) => ranges[index].min - value),
  );
  const maximumShift = Math.min(
    ...values.map((value, index) => ranges[index].max - value),
  );
  if (minimumShift <= maximumShift) {
    return clamp(0, minimumShift, maximumShift);
  }
  return (minimumShift + maximumShift) / 2;
}

// The touch halo stays at the real contact point. Only action targets fan inward.
export function resolveAIAssistTargetLayout(
  touch: AIAssistPoint,
  bounds: AssistBounds,
): AIAssistTargetLayout {
  const center = {
    x: clamp(touch.x, 0, bounds.width),
    y: clamp(touch.y, 0, bounds.height),
  };
  const placement = resolvePlacement(center, bounds);
  const offsets = offsetsForPlacement(placement);
  const directions: AIAssistDirection[] = ['up', 'right', 'down', 'left'];
  const targetCenters = directions.map(direction => ({
    x: center.x + offsets[direction].x,
    y: center.y + offsets[direction].y,
  }));
  const horizontalRange = circleCenterRange(bounds.width);
  const verticalRanges = directions.map(direction =>
    verticalCenterRange(bounds, labelPlacementFor(direction, placement)),
  );
  const shift = {
    x: shiftIntoRanges(
      targetCenters.map(point => point.x),
      directions.map(() => horizontalRange),
    ),
    y: shiftIntoRanges(
      targetCenters.map(point => point.y),
      verticalRanges,
    ),
  };
  const frame = (direction: AIAssistDirection): AIAssistActionFrame => {
    const offset = offsets[direction];
    const verticalRange = verticalCenterRange(
      bounds,
      labelPlacementFor(direction, placement),
    );
    const actionCenter = {
      x: clamp(
        center.x + offset.x + shift.x,
        horizontalRange.min,
        horizontalRange.max,
      ),
      y: clamp(
        center.y + offset.y + shift.y,
        verticalRange.min,
        verticalRange.max,
      ),
    };
    return {
      x: actionCenter.x - targetSize / 2,
      y: actionCenter.y - targetSize / 2,
      width: targetSize,
      height: targetSize,
      labelPlacement: labelPlacementFor(direction, placement),
    };
  };
  return {
    center,
    placement,
    up: frame('up'),
    right: frame('right'),
    down: frame('down'),
    left: frame('left'),
  };
}

function estimatedLabelSize(label: string) {
  const naturalWidth = Array.from(label).reduce(
    (total, character) => total + (character.charCodeAt(0) <= 0x7f ? 7 : 12),
    4,
  );
  return {
    width: clamp(naturalWidth, labelMinWidth, labelMaxWidth),
    height: naturalWidth > labelMaxWidth ? labelHeight : labelLineHeight,
  };
}

export function resolveAIAssistLabelFrame(
  action: AIAssistActionFrame,
  label: string,
  bounds: AssistBounds,
): AssistFrame {
  const { width, height } = estimatedLabelSize(label);
  const centerX = action.x + action.width / 2;
  const maximumX = Math.max(
    viewportMargin,
    bounds.width - viewportMargin - width,
  );
  return {
    x: clamp(centerX - width / 2, viewportMargin, maximumX),
    y:
      action.labelPlacement === 'above'
        ? action.y - labelGap - height
        : action.y + action.height + labelGap,
    width,
    height,
  };
}

export function resolveAIAssistTargetAtPoint(
  point: AIAssistPoint,
  layout: AIAssistTargetLayout,
): AIAssistDirection | null {
  return (
    (['up', 'right', 'down', 'left'] as const).find(direction => {
      const frame = layout[direction];
      return (
        Math.hypot(
          point.x - frame.x - frame.width / 2,
          point.y - frame.y - frame.height / 2,
        ) <=
        frame.width / 2 + 10
      );
    }) ?? null
  );
}
