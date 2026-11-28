import * as Haptics from 'expo-haptics';
import { useRef, type ReactNode } from 'react';
import { Animated, Platform, Pressable, type AccessibilityRole, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'selection' | false;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
};

function tap(haptic: Props['haptic']) {
  if (!haptic || Platform.OS === 'web') return;
  const feedback = haptic === 'medium'
    ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    : haptic === 'selection' ? Haptics.selectionAsync()
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  void feedback.catch(() => {});
}

export function PressableScale({
  children, onPress, style, pressedStyle, containerStyle, disabled = false, scaleTo = 0.97,
  haptic = 'light', accessibilityRole = 'button', accessibilityLabel, accessibilityState, accessibilityHint,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 30, bounciness: 4 }).start();

  return (
    <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
        disabled={disabled}
        onPressIn={() => animate(scaleTo)}
        onPressOut={() => animate(1)}
        onPress={() => { tap(haptic); onPress?.(); }}
        style={({ pressed }) => [style, pressed && pressedStyle]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}