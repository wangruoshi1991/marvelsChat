import React from 'react';
import {
  AccessibilityState,
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Palette } from './theme';

// Shared by task workspaces and second-floor tools. Feature-specific layouts
// stay in their screens; these tokens define the controls inside those layouts.
export const workspaceTokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
  radius: { control: 8, panel: 12 },
  minTouch: 44,
  typography: {
    caption: { fontSize: 12, lineHeight: 18 },
    body: { fontSize: 13, lineHeight: 20 },
    title: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
    heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  },
};

export type WorkspaceButtonProps = {
  palette: Palette;
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: Pick<AccessibilityState, 'expanded' | 'selected'>;
  testID?: string;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function WorkspaceButton({
  palette,
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
  icon,
  iconOnly = false,
  style,
}: WorkspaceButtonProps) {
  const unavailable = disabled || busy || !onPress;
  const foreground = variant === 'primary' ? palette.surface : palette.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        ...accessibilityState,
        disabled: unavailable,
        busy,
      }}
      disabled={unavailable}
      onPress={
        onPress
          ? () => {
              if (!unavailable) onPress();
            }
          : undefined
      }
      style={({ pressed }) => [
        workspaceStyles.button,
        {
          backgroundColor:
            variant === 'primary'
              ? palette.text
              : variant === 'secondary'
              ? palette.soft
              : 'transparent',
        },
        style,
        unavailable && workspaceStyles.disabled,
        pressed && !unavailable && workspaceStyles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator accessible={false} size="small" color={foreground} />
      ) : icon ? (
        <View accessible={false}>{icon}</View>
      ) : null}
      {!iconOnly ? (
        <Text style={[workspaceStyles.buttonLabel, { color: foreground }]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function WorkspaceState({
  palette,
  title,
  description,
  tone = 'neutral',
  busy = false,
  onRetry,
  retryLabel = '重试',
}: {
  palette: Palette;
  title: string;
  description?: string;
  tone?: 'neutral' | 'error';
  busy?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={workspaceStyles.state}>
      <View style={workspaceStyles.stateHeading}>
        {busy ? (
          <ActivityIndicator accessible={false} color={palette.text} />
        ) : null}
        <Text
          accessibilityRole={tone === 'error' ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy }}
          style={[
            workspaceStyles.stateTitle,
            { color: tone === 'error' ? palette.rose : palette.secondaryText },
          ]}
        >
          {title}
        </Text>
      </View>
      {description ? (
        <Text
          style={[
            workspaceTokens.typography.caption,
            { color: palette.secondaryText },
          ]}
        >
          {description}
        </Text>
      ) : null}
      {onRetry ? (
        <WorkspaceButton
          palette={palette}
          label={retryLabel}
          onPress={onRetry}
          variant="secondary"
          busy={busy}
          style={workspaceStyles.stateAction}
        />
      ) : null}
    </View>
  );
}

export function WorkspacePanel({
  palette,
  children,
  style,
  testID,
}: {
  palette: Palette;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        workspaceStyles.panel,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export const workspaceStyles = StyleSheet.create({
  content: {
    paddingHorizontal: workspaceTokens.space.md,
    paddingVertical: workspaceTokens.space.lg,
    gap: workspaceTokens.space.sm,
  },
  button: {
    minHeight: workspaceTokens.minTouch,
    minWidth: workspaceTokens.minTouch,
    paddingHorizontal: workspaceTokens.space.md,
    paddingVertical: workspaceTokens.space.sm,
    borderRadius: workspaceTokens.radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: workspaceTokens.space.sm,
  },
  buttonLabel: { ...workspaceTokens.typography.title, flexShrink: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  panel: {
    padding: workspaceTokens.space.md,
    borderWidth: 1,
    borderRadius: workspaceTokens.radius.panel,
    gap: workspaceTokens.space.sm,
  },
  input: {
    ...workspaceTokens.typography.body,
    minHeight: workspaceTokens.minTouch,
    padding: workspaceTokens.space.md,
    borderWidth: 1,
    borderRadius: workspaceTokens.radius.control,
  },
  state: {
    paddingVertical: workspaceTokens.space.sm,
    gap: workspaceTokens.space.sm,
  },
  stateHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: workspaceTokens.space.sm,
  },
  stateTitle: { ...workspaceTokens.typography.body, flexShrink: 1 },
  stateAction: { alignSelf: 'flex-start' },
});
