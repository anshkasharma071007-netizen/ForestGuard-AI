import { Check, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';

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

export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled = false }: {
  label: string;
  options: readonly { id: T; label: string; icon?: LucideIcon }[];
  value: T | null;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stack = Math.min(width, sizing.content) / Math.max(fontScale, 1) < 275;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segments, stack && styles.stacked]}>
      {options.map(({ id, label: name, icon: Icon }) => {
        const selected = value === id;
        return (
          <Pressable key={id} accessibilityRole="radio" aria-checked={selected} accessibilityState={{ checked: selected, disabled }}
            disabled={disabled} onPress={() => onChange(id)}
            style={({ pressed }) => [styles.control, styles.segment, !stack && styles.segmentHorizontal,
              { backgroundColor: selected || pressed ? colors.successTint : colors.card,
                borderColor: selected ? colors.focus : colors.controlBorder, opacity: disabled ? 0.6 : 1 }]}>
            {Icon && <Icon size={18} color={selected ? colors.accent : colors.secondaryText} />}
            <Text style={[typeScale.action, styles.segmentText, { color: selected ? colors.accent : colors.primaryText }]}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NavigationRow({ label, icon: Icon, onPress, disabled = false }: {
  label: string; icon: LucideIcon; onPress: () => void; disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.nav, { borderColor: colors.border, opacity: disabled ? 0.6 : 1, backgroundColor: pressed ? colors.successTint : undefined }]}>
      <Icon size={20} color={colors.accent} />
      <Text style={[styles.label, typeScale.action, { color: colors.primaryText }]}>{label}</Text>
      <ChevronRight size={18} color={colors.accent} />
    </Pressable>
  );
}

export function SelectionRow({ label, detail, selected = false, disabled = false, onPress }: {
  label: string; detail?: string; selected?: boolean; disabled?: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="radio" aria-checked={selected} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.nav, { borderColor: colors.border, backgroundColor: pressed || selected ? colors.successTint : undefined }]}>
      <View style={styles.flex}>
        <Text style={[typeScale.body, { color: colors.primaryText }]}>{label}</Text>
        {detail && <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{detail}</Text>}
      </View>
      {selected && <Check size={18} color={colors.accent} />}
    </Pressable>
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
  segment: { justifyContent: 'center', paddingHorizontal: spacing.sm },
  segmentHorizontal: { flex: 1, minWidth: 0 },
  segmentText: { flexShrink: 1, textAlign: 'center' },
  nav: { minHeight: sizing.touch, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.sm },
});
