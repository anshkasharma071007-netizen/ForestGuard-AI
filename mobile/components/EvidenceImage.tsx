import { useState } from 'react';
import { Image, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { containImage, projectBox, type AnimalPrediction, type ImageSize } from '@/identification';
import { photoViewerColors, spacing, typeScale, useTheme } from '@/theme';

export type OriginalPhoto = ImageSize & { uri: string };

export function EvidenceImage({ photo, style, overlay, label = 'Original incident photograph' }: {
  photo: OriginalPhoto;
  style?: StyleProp<ViewStyle>;
  overlay?: { image: ImageSize; animals: readonly AnimalPrediction[]; activeId?: string };
  label?: string;
}) {
  const { colors } = useTheme();
  const [frame, setFrame] = useState<ImageSize>({ width: 0, height: 0 });
  const aspectMatches = overlay && Math.abs((overlay.image.width / overlay.image.height) / (photo.width / photo.height) - 1) < 0.005;
  const canDraw = aspectMatches && containImage(overlay.image, frame);

  return (
    <View style={[styles.frame, style]} onLayout={({ nativeEvent }) => setFrame(nativeEvent.layout)}>
      <Image source={{ uri: photo.uri }} resizeMode="contain" style={StyleSheet.absoluteFill}
        accessibilityRole={Platform.OS === 'web' ? undefined : 'image'} accessibilityLabel={label} />
      {canDraw && overlay.animals.map((animal, index) => {
        const rect = animal.box && projectBox(animal.box, overlay.image, frame);
        return rect && (
          <View key={animal.id} pointerEvents="none" accessible={false}
            style={[styles.box, rect, { borderColor: colors.lime, borderWidth: overlay.activeId === animal.id ? 3 : 2 }]}>
            <Text style={[styles.marker, { color: colors.deepForest, backgroundColor: colors.lime }]}>{index + 1}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: photoViewerColors.imageMatte },
  box: { position: 'absolute' },
  marker: { ...typeScale.supporting, fontWeight: '700', alignSelf: 'flex-start', paddingHorizontal: spacing.xs },
});
