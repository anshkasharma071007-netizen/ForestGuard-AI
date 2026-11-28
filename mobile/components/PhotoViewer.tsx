import { useLanguage } from '@/i18n';
import { Minus, Plus, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { containImage, type ImageSize } from '@/identification';
import { photoViewerColors as colors, sizing, spacing, typeScale } from '@/theme';
import { EvidenceImage, type OriginalPhoto } from './EvidenceImage';

type Transform = { scale: number; x: number; y: number };
type Touch = { x: number; y: number; distance: number; count: number };
const identity: Transform = { scale: 1, x: 0, y: 0 };
const maxZoom = 4;

export function PhotoViewer({ photo, onClose }: { photo: OriginalPhoto; onClose: () => void }) {
  const { t } = useLanguage();
  const [frame, setFrame] = useState<ImageSize>({ width: 0, height: 0 });
  const [transform, setTransform] = useState(identity);
  const current = useRef(identity);
  const start = useRef<{ touch: Touch; transform: Transform } | null>(null);
  const fit = useMemo(() => containImage(photo, frame), [photo, frame]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function update(next: Transform) {
    const limitX = Math.max(0, ((fit?.width ?? frame.width) * next.scale - frame.width) / 2);
    const limitY = Math.max(0, ((fit?.height ?? frame.height) * next.scale - frame.height) / 2);
    const updated = { scale: next.scale, x: clamp(next.x, -limitX, limitX), y: clamp(next.y, -limitY, limitY) };
    current.current = updated;
    setTransform(updated);
  }

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: (event) => touch(event).count > 1 || current.current.scale > 1,
    onMoveShouldSetPanResponder: (event) => touch(event).count > 1,
    onPanResponderGrant: (event) => { start.current = { touch: touch(event), transform: current.current }; },
    onPanResponderMove: (event) => {
      const next = touch(event);
      const from = start.current;
      if (!from || from.touch.count !== next.count) {
        start.current = { touch: next, transform: current.current };
        return;
      }
      const scale = next.count > 1 && from.touch.distance > 0
        ? clamp(from.transform.scale * next.distance / from.touch.distance, 1, maxZoom)
        : from.transform.scale;
      update({ scale, x: from.transform.x + next.x - from.touch.x, y: from.transform.y + next.y - from.touch.y });
    },
    onPanResponderEnd: () => { start.current = null; },
    onPanResponderTerminate: () => { start.current = null; },
  });

  function zoomBy(change: number) {
    update({ ...current.current, scale: clamp(current.current.scale + change, 1, maxZoom) });
  }

  return (
    <Modal animationType="fade" presentationStyle="fullScreen" visible onRequestClose={onClose}>
      <SafeAreaView style={styles.shell} accessibilityViewIsModal>
        <View style={styles.bar}>
          <Text accessibilityRole="header" style={styles.title}>{t('Incident photo')}</Text>
          <IconControl icon={X} label={t('Close photo')} onPress={onClose} />
        </View>
        <View style={styles.canvas} {...responder.panHandlers} onLayout={({ nativeEvent: { layout } }) => {
          if (layout.width !== frame.width || layout.height !== frame.height) {
            setFrame({ width: layout.width, height: layout.height });
            current.current = identity;
            setTransform(identity);
          }
        }}>
          <EvidenceImage photo={photo} style={[StyleSheet.absoluteFill, {
            transform: [{ translateX: transform.x }, { translateY: transform.y }, { scale: transform.scale }],
          }]} />
        </View>
        <View style={styles.toolbar}>
          <IconControl icon={Minus} label={t('Zoom out')} onPress={() => zoomBy(-0.5)} disabled={transform.scale <= 1} />
          <IconControl icon={RotateCcw} label={t('Reset zoom')} onPress={() => update(identity)} disabled={transform.scale <= 1} />
          <IconControl icon={Plus} label={t('Zoom in')} onPress={() => zoomBy(0.5)} disabled={transform.scale >= maxZoom} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function IconControl({ icon: Icon, label, onPress, disabled = false }: {
  icon: typeof X; label: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
      onPress={onPress} disabled={disabled} style={[styles.control, disabled && styles.disabled]}>
      <Icon size={sizing.icon} color={colors.foreground} />
    </Pressable>
  );
}

function touch(event: GestureResponderEvent): Touch {
  const { touches, pageX, pageY } = event.nativeEvent;
  if (touches.length < 2) return { x: pageX, y: pageY, distance: 0, count: 1 };
  const [first, second] = touches;
  return {
    count: 2,
    x: (first.pageX + second.pageX) / 2,
    y: (first.pageY + second.pageY) / 2,
    distance: Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.backdrop },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { ...typeScale.section, color: colors.foreground, flexShrink: 1 },
  canvas: { flex: 1, overflow: 'hidden', backgroundColor: colors.imageMatte, ...(Platform.OS === 'web' && { touchAction: 'none' as const }) },
  toolbar: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, padding: spacing.sm },
  control: { minWidth: sizing.touch, minHeight: sizing.touch, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
});
