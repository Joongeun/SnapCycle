import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, type CameraType } from 'expo-camera';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useCamera } from '@/hooks/use-camera';
import { useItemFlow } from '@/contexts/item-context';
import { processPhoto } from '@/utils/image';
import { haptics } from '@/utils/haptics';

export default function CameraScreen() {
  const { granted, requestPermission } = useCamera();
  const { setPhoto } = useItemFlow();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // --- Permission gate ---------------------------------------------------
  if (!granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <StatusBar style="dark" />
        <View style={styles.permissionCard}>
          <ThemedText style={styles.permissionTitle}>Camera Access</ThemedText>
          <ThemedText style={styles.permissionBody}>
            RRR2 needs your camera to photograph items for identification.
          </ThemedText>
          <Button title="Grant Permission" onPress={requestPermission} size="lg" />
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => router.back()}
            style={styles.cancelBtn}
          />
        </View>
      </SafeAreaView>
    );
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    haptics.medium();
    const shot = await cameraRef.current.takePictureAsync({ quality: 1 });
    if (shot?.uri) setPreviewUri(shot.uri);
  }

  async function usePhoto() {
    if (!previewUri) return;
    setProcessing(true);
    try {
      const { uri, base64 } = await processPhoto(previewUri);
      setPhoto(uri, base64);
      router.replace('/flow/identify');
    } finally {
      setProcessing(false);
    }
  }

  // --- Preview state -----------------------------------------------------
  if (previewUri) {
    return (
      <View style={styles.previewContainer}>
        <StatusBar style="light" />
        <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
        <SafeAreaView style={styles.previewControls}>
          <View style={styles.previewButtons}>
            <Button
              title="Retake"
              variant="secondary"
              onPress={() => setPreviewUri(null)}
              style={styles.flexBtn}
              disabled={processing}
            />
            <Button
              title="Use Photo"
              onPress={usePhoto}
              loading={processing}
              style={styles.flexBtn}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // --- Live camera state -------------------------------------------------
  return (
    <View style={styles.cameraContainer}>
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.topButton}>
            <ThemedText style={styles.topButtonText}>Close</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            style={styles.topButton}
          >
            <ThemedText style={styles.topButtonText}>Flip</ThemedText>
          </Pressable>
        </View>

        <View style={styles.frameHint}>
          <ThemedText style={styles.hintText}>Frame the whole item</ThemedText>
        </View>

        <View style={styles.bottomBar}>
          <Pressable onPress={takePhoto} style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Permission
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  permissionCard: {
    width: '100%',
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: 20,
    padding: Spacing.five,
    ...FlatBorder,
    gap: Spacing.three,
  },
  permissionTitle: {
    ...Typography.h2,
    color: Colors.light.text,
    textAlign: 'center',
  },
  permissionBody: {
    ...Typography.body,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  cancelBtn: {
    marginTop: -Spacing.one,
  },

  // Camera
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  topButton: {
    backgroundColor: Colors.light.background,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    ...FlatBorder,
  },
  topButtonText: {
    ...Typography.captionBold,
    color: Colors.light.text,
  },
  frameHint: {
    alignItems: 'center',
  },
  hintText: {
    ...Typography.captionBold,
    color: '#FBF3E4',
    backgroundColor: Colors.light.overlay,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: Spacing.four,
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.light.primary,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.light.primary,
  },

  // Preview
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
  },
  previewControls: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  previewButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  flexBtn: {
    flex: 1,
  },
});
