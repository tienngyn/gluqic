import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NumberField } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/SheetHeader';
import { colors, layout, radius, spacing } from '@/constants/theme';
import { MOCK_FOODS } from '@/data/foods';
import { foodDatabase } from '@/services/foodDatabase';
import type { MealType } from '@/types/models';
import { haptics } from '@/utils/haptics';

const DEMO_CODES = MOCK_FOODS.filter((f) => f.barcode).slice(0, 4);

export default function ScanBarcode() {
  const { meal } = useLocalSearchParams<{ meal?: MealType }>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState<'idle' | 'looking' | 'not-found'>('idle');
  const busy = useRef(false);

  const lookup = async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    setStatus('looking');
    const food = await foodDatabase.getByBarcode(code);
    busy.current = false;
    if (food) {
      haptics.success();
      router.replace({ pathname: '/food/[id]', params: { id: food.id, meal: meal ?? 'snack' } });
    } else {
      haptics.warning();
      setStatus('not-found');
    }
  };

  const onScanned = (r: BarcodeScanningResult) => {
    if (status === 'looking') return;
    void lookup(r.data);
  };

  const cameraAvailable = Platform.OS !== 'web' && permission?.granted;

  return (
    <View style={styles.root}>
      {cameraAvailable ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={onScanned}
        />
      ) : null}
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.top}>
          <Text variant="headline">Scan barcode</Text>
          <IconButton label="Close" size={36} icon={<X size={18} color={colors.text} />} onPress={() => router.back()} />
        </View>

        {cameraAvailable ? (
          <View style={styles.frameWrap}>
            <View style={styles.frame} />
            <Text variant="callout" color="secondary" align="center" style={styles.frameHint}>
              Point at the barcode on the pack
            </Text>
          </View>
        ) : (
          <View style={styles.fallback}>
            {Platform.OS !== 'web' && permission && !permission.granted ? (
              <View style={styles.block}>
                <Text variant="callout" color="secondary">
                  gluciq needs the camera only to read barcodes. Nothing is recorded or uploaded.
                </Text>
                <Button label="Allow camera" onPress={() => void requestPermission()} />
              </View>
            ) : (
              <Banner tone="info" message="Camera scanning runs on iOS and Android. Enter a code or try a sample below." />
            )}
          </View>
        )}

        <View style={styles.bottom}>
          {status === 'not-found' ? <Banner tone="caution" message="No product found for that code. You can create a custom food instead." /> : null}
          <View style={styles.manualRow}>
            <NumberField label="Enter barcode" value={manual} onChangeText={setManual} decimal={false} placeholder="e.g. 5449000131805" style={styles.manualField} />
          </View>
          <Button label={status === 'looking' ? 'Looking up…' : 'Look up'} onPress={() => void lookup(manual)} disabled={manual.length < 8 || status === 'looking'} />
          <Text variant="caption" color="muted" style={styles.sampleLabel}>
            Sample codes
          </Text>
          <View style={styles.samples}>
            {DEMO_CODES.map((f) => (
              <Button key={f.id} size="m" variant="secondary" label={f.name} onPress={() => void lookup(f.barcode!)} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  overlay: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: layout.maxContentWidth + 40,
    alignSelf: 'center',
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  frameWrap: { alignItems: 'center' },
  frame: { width: '86%', aspectRatio: 1.7, borderRadius: radius.xl, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  frameHint: { marginTop: spacing.lg },
  fallback: { flex: 1, justifyContent: 'center' },
  block: { gap: spacing.lg },
  bottom: { gap: spacing.md },
  manualRow: { flexDirection: 'row' },
  manualField: { flex: 1 },
  sampleLabel: { marginTop: spacing.sm },
  samples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
