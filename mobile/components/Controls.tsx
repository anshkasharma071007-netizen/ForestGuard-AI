import { Check, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';

export function InputField({ label, hint, prefix, ...props }: TextInputProps & { label: string; hint?: string; prefix?: string }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[typeScale.card, { color: colors.primaryText }]}>{label}</Text>
      <View style={prefix ? [styles.prefixedInput, { backgroundColor: colors.input,
        borderColor: focused ? colors.focus : colors.controlBorder }] : undefined}>
        {prefix && <Text style={[typeScale.input, { color: colors.primaryText }]}>{prefix}</Text>}
        <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.mutedText}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        style={[styles.input, props.multiline && styles.multiline, props.style,
          { color: colors.primaryText, backgroundColor: colors.input, borderColor: focused ? colors.focus : colors.controlBorder },
          prefix && styles.inputWithPrefix]} />
      </View>
      {hint && <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{hint}</Text>}
    </View>
  );
}

export function Dropdown({ label, accessibilityLabel, icon: Icon, onPress, expanded, disabled = false }: {
  label: string; accessibilityLabel: string; icon?: LucideIcon; onPress: () => void;
  expanded: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      aria-expanded={expanded} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.control, { borderColor: expanded ? colors.focus : colors.controlBorder,
        backgroundColor: pressed ? colors.successTint : colors.input, opacity: disabled ? 0.6 : 1 }]}>
      {Icon && <Icon size={20} color={colors.accent} />}
      <Text style={[styles.label, { color: colors.primaryText }]}>{label}</Text>
      <ChevronDown size={18} color={colors.accent} style={expanded && styles.expanded} />
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled = false, compact = false }: {
  label: string;
  options: readonly { id: T; label: string; icon?: LucideIcon }[];
  value: T | null;
  onChange: (id: T) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stack = Math.min(width, sizing.content) / Math.max(fontScale, 1) < 275;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segments, stack && (compact ? styles.wrapped : styles.stacked)]}>
      {options.map(({ id, label: name, icon: Icon }) => {
        const selected = value === id;
        return (
          <Pressable key={id} accessibilityRole="radio" aria-checked={selected} accessibilityState={{ checked: selected, disabled }}
            disabled={disabled} onPress={() => onChange(id)}
            style={({ pressed }) => [styles.control, styles.segment, !stack && styles.segmentHorizontal, stack && compact && styles.segmentWrapped,
              compact && styles.compact,
              { backgroundColor: selected && compact ? colors.primaryAction : selected || pressed ? colors.softAccent : colors.card,
                borderColor: selected && compact ? colors.primaryAction : selected ? colors.focus : compact ? colors.border : colors.controlBorder, opacity: disabled ? 0.6 : 1 }]}>
            {Icon && <Icon size={18} color={selected ? colors.accent : colors.secondaryText} />}
            <Text style={[typeScale.action, styles.segmentText, { color: selected && compact ? colors.onAction : selected ? colors.accent : colors.primaryText }]}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NavigationRow({ label, detail, icon: Icon, onPress, disabled = false }: {
  label: string; detail?: string; icon: LucideIcon; onPress: () => void; disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} haptic="light"
      style={[styles.nav, { borderColor: colors.border, opacity: disabled ? 0.6 : 1 }]}
      pressedStyle={{ backgroundColor: colors.successTint }}>
      <View style={[styles.navIcon, { backgroundColor: colors.softAccent }]}><Icon size={18} color={colors.accent} /></View>
      <View style={styles.flex}>
        <Text style={[typeScale.action, { color: colors.primaryText }]}>{label}</Text>
        {detail && <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{detail}</Text>}
      </View>
      <ChevronRight size={18} color={colors.mutedText} />
    </PressableScale>
  );
}

export function SelectionRow({ label, detail, icon: Icon, surface = false, selected = false, disabled = false, onPress }: {
  label: string; detail?: string; icon?: LucideIcon; surface?: boolean; selected?: boolean; disabled?: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} haptic="selection"
      style={[styles.nav, surface && styles.selectionSurface, { borderColor: selected && surface ? colors.focus : colors.border,
        backgroundColor: selected ? colors.successTint : surface ? colors.card : undefined }]}
      pressedStyle={{ backgroundColor: colors.successTint }}>
      {Icon && <Icon size={18} color={colors.accent} />}
      <View style={styles.flex}>
        <Text style={[typeScale.body, { color: colors.primaryText }]}>{label}</Text>
        {detail && <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{detail}</Text>}
      </View>
      {selected && <View style={[styles.check, { backgroundColor: colors.accent }]}><Check size={13} color={colors.onAction} strokeWidth={3} /></View>}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  flex: { flex: 1 },
  input: { ...typeScale.input, minHeight: sizing.touch, borderRadius: radius.input, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  prefixedInput: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.input, borderWidth: 1, paddingLeft: spacing.md },
  inputWithPrefix: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingLeft: spacing.sm },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  control: { minHeight: sizing.touch, borderRadius: radius.input, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typeScale.body, flex: 1 },
  expanded: { transform: [{ rotate: '180deg' }] },
  segments: { flexDirection: 'row', gap: spacing.sm },
  stacked: { flexDirection: 'column' },
  wrapped: { flexWrap: 'wrap' },
  compact: { borderRadius: radius.pill, paddingVertical: spacing.xs },
  segmentWrapped: { flexBasis: '45%', flexGrow: 1 },
  segment: { justifyContent: 'center', paddingHorizontal: spacing.sm },
  segmentHorizontal: { flex: 1, minWidth: 0 },
  segmentText: { flexShrink: 1, textAlign: 'center' },
  nav: { minHeight: sizing.touch, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.sm },
  navIcon: { width: 34, height: 34, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
  check: { width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  selectionSurface: { borderWidth: 1, borderRadius: radius.input, paddingHorizontal: spacing.md },
});
