import React from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';
import { Palette } from '../../shared/theme';
import {
  MessageTextBlock,
  MessageTextInline,
  messageTextBlocks,
  messageTextInline,
  safeMessageLink,
} from './messageTextPresentation';

async function openLink(href: string) {
  if (!safeMessageLink(href)) return;
  try {
    await Linking.openURL(href);
  } catch {
    Alert.alert('无法打开链接', '请稍后重试。');
  }
}

function inline(
  parts: MessageTextInline[],
  palette: Palette,
): React.ReactNode[] {
  return parts.map((part, index) => {
    if ('text' in part)
      return part.kind === 'text' ? (
        part.text
      ) : (
        <Text
          key={index}
          style={[s.inlineCode, { backgroundColor: palette.soft }]}
        >
          {part.text}
        </Text>
      );
    const children = inline(part.children, palette);
    if (part.kind === 'link')
      return part.href ? (
        <Text
          key={index}
          accessibilityRole="link"
          accessibilityHint={part.href}
          style={[s.link, { color: palette.mint }]}
          onPress={event => {
            event.stopPropagation();
            return openLink(part.href!);
          }}
        >
          {children}
        </Text>
      ) : (
        <Text key={index}>
          {children}
          {` (${part.destination})`}
        </Text>
      );
    return (
      <Text key={index} style={part.kind === 'strong' ? s.strong : s.emphasis}>
        {children}
      </Text>
    );
  });
}

function blocks(
  items: MessageTextBlock[],
  palette: Palette,
  style: StyleProp<TextStyle>,
): React.ReactNode[] {
  return items.map((block, index) => {
    if (block.kind === 'quote')
      return (
        <View
          key={index}
          testID="message-quote"
          style={[s.quote, { borderLeftColor: palette.border }]}
        >
          {blocks(block.blocks, palette, style)}
        </View>
      );
    if (block.kind === 'code')
      return (
        <ScrollView
          key={index}
          horizontal
          nestedScrollEnabled
          style={s.horizontal}
          contentContainerStyle={[
            s.codeBlock,
            { backgroundColor: palette.soft },
          ]}
        >
          <Text style={[style, s.code]}>{block.text}</Text>
        </ScrollView>
      );
    if (block.kind === 'table') {
      const count = Math.max(...block.rows.map(row => row.length));
      const widths = Array.from({ length: count }, (_, column) =>
        Math.min(
          240,
          Math.max(
            120,
            ...block.rows.map(row => (row[column]?.length || 0) * 7 + 24),
          ),
        ),
      );
      return (
        <ScrollView
          key={index}
          testID="message-table"
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={s.horizontal}
        >
          <View style={[s.table, { borderColor: palette.border }]}>
            {block.rows.map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={[
                  s.tableRow,
                  rowIndex === 0 && { backgroundColor: palette.soft },
                ]}
              >
                {widths.map((width, column) => (
                  <View
                    key={column}
                    style={[s.cell, { width, borderColor: palette.border }]}
                  >
                    <Text
                      accessibilityRole={rowIndex === 0 ? 'header' : undefined}
                      style={[
                        style,
                        rowIndex === 0 && s.strong,
                        { textAlign: block.align[column] || 'left' },
                      ]}
                    >
                      {inline(messageTextInline(row[column] || ''), palette)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }
    if (block.kind === 'list')
      return (
        <View key={index} style={[s.list, { marginLeft: block.indent * 6 }]}>
          <Text style={[style, s.marker]}>{block.marker}</Text>
          <Text style={[style, s.listBody]}>
            {inline(messageTextInline(block.text), palette)}
          </Text>
        </View>
      );
    return (
      <Text
        key={index}
        accessibilityRole={block.kind === 'heading' ? 'header' : undefined}
        style={[
          style,
          block.kind === 'heading' && headingStyles[block.level - 1],
        ]}
      >
        {block.kind === 'literal'
          ? block.text
          : inline(messageTextInline(block.text), palette)}
      </Text>
    );
  });
}

// Formatting never executes HTML or fetches media. Actual media uses the
// authenticated product components; external links open only after a tap.
export function ChatMessageText({
  children,
  formatted,
  palette,
  style,
  testID,
}: {
  children: string;
  formatted: boolean;
  palette: Palette;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  if (!formatted)
    return (
      <Text testID={testID} style={style}>
        {children}
      </Text>
    );
  return (
    <View testID={testID} style={s.content}>
      {blocks(messageTextBlocks(children), palette, style)}
    </View>
  );
}

const s = StyleSheet.create({
  content: { gap: 10, minWidth: 0 },
  list: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  marker: { minWidth: 16, flexShrink: 0 },
  listBody: { flex: 1 },
  strong: { fontWeight: '600' },
  emphasis: { fontStyle: 'italic' },
  link: { textDecorationLine: 'underline' },
  quote: { borderLeftWidth: 3, paddingLeft: 12, gap: 10, minWidth: 0 },
  horizontal: { maxWidth: '100%', flexGrow: 0 },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableRow: { flexDirection: 'row', alignItems: 'stretch' },
  cell: {
    padding: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  codeBlock: { borderRadius: 6, padding: 10, minWidth: 0 },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
const headingStyles: TextStyle[] = [
  { fontWeight: '700', fontSize: 22, lineHeight: 30 },
  { fontWeight: '600', fontSize: 20, lineHeight: 28 },
  { fontWeight: '600', fontSize: 18, lineHeight: 26 },
  { fontWeight: '600', fontSize: 16, lineHeight: 24 },
  { fontWeight: '600', fontSize: 15, lineHeight: 22 },
  { fontWeight: '600', fontSize: 14, lineHeight: 21 },
];
