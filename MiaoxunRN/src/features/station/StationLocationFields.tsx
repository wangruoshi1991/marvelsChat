import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Camera as MapCamera,
  Map as MapLibreMap,
} from '@maplibre/maplibre-react-native';

import { LocationCandidateDTO } from '../../models/api';
import { apiClient, buildApiUrl } from '../../services/apiClient';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { Coordinates, gcj02ToWgs84, wgs84ToGcj02 } from './stationLocationGeo';

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

export function LocationMapPicker({
  token,
  center,
  palette,
  language,
  disabled,
  onSelectCoordinate,
}: {
  token: string;
  center: Coordinates;
  palette: Palette;
  language: Language;
  disabled: boolean;
  onSelectCoordinate: (coordinate: Coordinates) => void;
}) {
  const [mapTicket, setMapTicket] = useState('');
  const [mapTicketError, setMapTicketError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setMapTicket('');
    setMapTicketError('');
    if (!token) {
      return () => {
        cancelled = true;
      };
    }
    apiClient
      .mapTicket(token)
      .then(ticket => {
        if (!cancelled) {
          setMapTicket(ticket.ticket);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setMapTicketError(
            error instanceof Error ? error.message : 'Map is unavailable.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const styleURL = mapTicket
    ? buildApiUrl(`/map/style?ticket=${encodeURIComponent(mapTicket)}`)
    : '';
  const mapCenter = wgs84ToGcj02(center);
  return (
    <View
      style={[
        styles.mapPickerCard,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View style={styles.mapPickerHeader}>
        <Text style={[styles.mapPickerTitle, { color: palette.text }]}>
          {textFor(language, '附近地图', 'Nearby Map')}
        </Text>
        <Text
          style={[styles.mapPickerDetail, { color: palette.secondaryText }]}
        >
          {textFor(language, '拖动地图，点击选点', 'Pan, then tap')}
        </Text>
      </View>
      <View style={[styles.mapViewport, { backgroundColor: palette.soft }]}>
        {styleURL ? (
          <MapLibreMap
            mapStyle={styleURL}
            style={styles.mapLibreView}
            logo={false}
            attribution
            compass
            dragPan={!disabled}
            touchZoom={!disabled}
            touchPitch={false}
            touchRotate={false}
            onPress={event => {
              const [longitude, latitude] = event.nativeEvent.lngLat;
              if (
                typeof latitude === 'number' &&
                typeof longitude === 'number'
              ) {
                onSelectCoordinate(gcj02ToWgs84({ latitude, longitude }));
              }
            }}
          >
            <MapCamera
              center={[mapCenter.longitude, mapCenter.latitude]}
              zoom={15}
              duration={300}
            />
          </MapLibreMap>
        ) : (
          <View style={styles.mapLibreView}>
            <Text
              style={[styles.mapCoordinateText, { color: palette.secondaryText }]}
            >
              {mapTicketError ||
                textFor(language, '正在加载地图', 'Loading map')}
            </Text>
          </View>
        )}
        <View style={[styles.mapCrosshair, styles.pointerEventsNone]}>
          <View
            style={[styles.mapCrosshairRing, { borderColor: palette.rose }]}
          />
          <View
            style={[styles.mapCrosshairDot, { backgroundColor: palette.rose }]}
          />
        </View>
      </View>
      <Text
        style={[styles.mapCoordinateText, { color: palette.secondaryText }]}
      >
        {textFor(language, '定位', 'Location')} {center.latitude.toFixed(5)},{' '}
        {center.longitude.toFixed(5)}
        {' · '}
        {textFor(language, '地图', 'Map')} {mapCenter.latitude.toFixed(5)},{' '}
        {mapCenter.longitude.toFixed(5)}
      </Text>
    </View>
  );
}
