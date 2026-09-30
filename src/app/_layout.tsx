import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';

void SystemUI.setBackgroundColorAsync(colors.background);

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.text,
  },
};

const sheet = {
  presentation: 'modal',
  contentStyle: { backgroundColor: colors.surface },
} as const;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="log/glucose" options={sheet} />
            <Stack.Screen name="log/insulin" options={sheet} />
            <Stack.Screen name="log/weight" options={sheet} />
            <Stack.Screen name="food/add" options={sheet} />
            <Stack.Screen name="food/[id]" options={sheet} />
            <Stack.Screen name="food/scan" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="food/custom" options={sheet} />
            <Stack.Screen name="bolus/confirm" options={sheet} />
            <Stack.Screen name="bolus/history" />
            <Stack.Screen name="timeline" />
            <Stack.Screen name="weight" />
            <Stack.Screen name="profile/diabetes" />
            <Stack.Screen name="profile/goals" />
            <Stack.Screen name="profile/health" />
            <Stack.Screen name="profile/dexcom" />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } });
