import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';
import { Header } from './Header';

type Props = {
  children: ReactNode;
  /** Show the top bar (logo + Settings). Default true. */
  header?: boolean;
  /** Show a Back button in the top bar instead of Settings. */
  back?: boolean;
  /** Use more width on big screens (for lists and grids). */
  wide?: boolean;
};

/** Page wrapper: midnight background, safe area, scrolls, and stays readable on wide web screens. */
export function Screen({ children, header = true, back, wide }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={[styles.column, wide && styles.wide]}>
          {header && <Header back={back} />}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: 'center', padding: spacing.md },
  column: { width: '100%', maxWidth: 720, gap: spacing.md },
  wide: { maxWidth: 1040 },
});
