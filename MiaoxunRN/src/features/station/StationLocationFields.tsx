import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { LocationCandidateDTO } from '../../models/api';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';

export function LocationCandidateSection({
  title,
  empty,
  candidates,
  selectedName,
  palette,
  onSelect,
}: {
  title: string;
  empty: string;
  candidates: LocationCandidateDTO[];
  selectedName: string;
  palette: Palette;
  onSelect: (name: string) => void;
}) {
  return (
    <View
      style={[
        styles.locationSection,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text
        style={[styles.locationSectionTitle, { color: palette.secondaryText }]}
      >
        {title}
      </Text>
      {candidates.length ? (
        candidates.map(candidate => {
          const selected = selectedName === candidate.name;
          return (
            <Pressable
              key={candidate.id}
              onPress={() => onSelect(candidate.name)}
              style={[
                styles.locationCandidate,
                {
                  backgroundColor: selected
                    ? `${palette.mint}22`
                    : palette.soft,
                  borderColor: selected ? palette.mint : palette.border,
                },
              ]}
            >
              <View style={styles.locationCandidateCopy}>
                <Text
                  style={[
                    styles.locationCandidateName,
                    { color: palette.text },
                  ]}
                  numberOfLines={1}
                >
                  {candidate.name}
                </Text>
                {candidate.detail ? (
                  <Text
                    style={[
                      styles.locationCandidateDetail,
                      { color: palette.secondaryText },
                    ]}
                    numberOfLines={1}
                  >
                    {candidate.detail}
                  </Text>
                ) : null}
              </View>
              {selected ? (
                <View
                  style={[
                    styles.locationSelectedDot,
                    { backgroundColor: palette.mint },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })
      ) : (
        <Text
          style={[styles.locationEmptyText, { color: palette.secondaryText }]}
        >
          {empty}
        </Text>
      )}
    </View>
  );
}
