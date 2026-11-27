import { Maximize2 } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { photoViewerColors, radius, sizing, spacing } from '@/theme';
import { EvidenceImage, type OriginalPhoto } from './EvidenceImage';

export function PhotoPreview({ photo, onExpand, overlay }: {
  photo: OriginalPhoto; onExpand: () => void; overlay?: ComponentProps<typeof EvidenceImage>['overlay'];
}) {
  const ratio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3;
  return <View style={styles.frame}>
    <EvidenceImage photo={photo} label="Submitted incident photo" overlay={overlay} style={[styles.image, { aspectRatio: ratio }]} />
    <Pressable accessibilityRole="button" accessibilityLabel="Expand submitted photograph" onPress={onExpand} style={styles.expand}>
      <Maximize2 size={18} color={photoViewerColors.foreground} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  frame: { position: 'relative', alignItems: 'center', borderRadius: radius.input, overflow: 'hidden',
    backgroundColor: photoViewerColors.imageMatte },
  image: { width: '100%', maxHeight: 340, minHeight: 96 },
  expand: { position: 'absolute', bottom: spacing.sm, right: spacing.sm, minWidth: sizing.touch, minHeight: sizing.touch,
    alignItems: 'center', justifyContent: 'center', borderRadius: radius.input, backgroundColor: photoViewerColors.backdrop },
});
import type { ComponentProps } from 'react';
