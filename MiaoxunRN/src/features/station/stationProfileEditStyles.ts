import { StyleSheet } from 'react-native';

export const profileEditStyles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 12,
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 48,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  content: { gap: 14, paddingHorizontal: 20, paddingBottom: 32 },
  intro: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 14,
  },
  introCopy: { flex: 1, gap: 6 },
  introTitle: { fontSize: 17, fontWeight: '600', lineHeight: 24 },
  helper: { fontSize: 12, lineHeight: 18 },
  card: { borderRadius: 18, gap: 10, padding: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 4 },
  counter: { fontSize: 11, textAlign: 'right' },
  privacy: { fontSize: 12, lineHeight: 19, paddingHorizontal: 4 },
  error: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
});
