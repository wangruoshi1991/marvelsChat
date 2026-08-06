import { AlertCircle } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import { ScreenColors } from './avatar3dCreatePresentation';
import { avatar3dCreateStyles as localStyles } from './avatar3dCreateStyles';

export function Avatar3DErrorNotice({
  colors,
  message,
}: {
  colors: ScreenColors;
  message: string;
}) {
  return (
    <View
      style={[
        localStyles.errorNotice,
        {
          backgroundColor: `${colors.danger}12`,
          borderColor: `${colors.danger}33`,
        },
      ]}
    >
      <AlertCircle color={colors.danger} size={18} />
      <Text style={[localStyles.errorText, { color: colors.danger }]}>
        {message}
      </Text>
    </View>
  );
}
