import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, type CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useCamera } from '@/hooks/use-camera';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { processPhoto } from '@/utils/image';
import { haptics } from '@/utils/haptics';

export default function CameraScreen() {
  const { granted, requestPermission } = useCamera();
  const { setPhoto } = useDisposalFlow();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // --- Permission gate ---------------------------------------------------
  if (!granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <StatusBar style="dark" />
        <View style={styles.permissionCard}>
          <ThemedText style={styles.permissionTitle}>Camera Access</ThemedText>
          <ThemedText style={styles.permissionBody}>
            RRR needs your camera to photograph items for disposal guidance.
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
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    haptics.medium();
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (shot?.uri) setPreviewUri(shot.uri);
    } catch (e) {
      // Camera was unmounted mid-capture (navigated away / fast double-tap) — ignore.
    } finally {
      setCapturing(false);
    }
  }

  async function usePhoto() {
    if (!previewUri) return;
    setProcessing(true);
    try {
      const { uri, base64 } = await processPhoto(previewUri);
      setPhoto(uri, base64);
      router.replace('/flow/processing' as any);
    } finally {
      setProcessing(false);
    }
  }

  async function uploadFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setProcessing(true);
    try {
      const { uri, base64 } = await processPhoto(result.assets[0].uri);
      setPhoto(uri, base64);
      router.replace('/flow/processing' as any);
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
            <Button title="Use Photo" onPress={usePhoto} loading={processing} style={styles.flexBtn} />
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
          <Pressable onPress={uploadFromLibrary} style={styles.sideButton}>
            <ThemedText style={styles.topButtonText}>Upload</ThemedText>
          </Pressable>
          <Pressable onPress={takePhoto} style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={styles.sideButtonSpacer} />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.four,
  },
  sideButton: {
    backgroundColor: Colors.light.background,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    ...FlatBorder,
  },
  sideButtonSpacer: {
    width: 72,
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
