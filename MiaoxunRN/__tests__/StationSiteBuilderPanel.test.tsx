import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { StationSiteBuilderPanel } from '../src/features/station/StationSiteBuilderPanel';
import { palettes } from '../src/shared/theme';

const SiteBuilderPanelUnderTest = StationSiteBuilderPanel as unknown as React.ComponentType<
  Record<string, unknown>
>;

test('opens the shared homepage builder without legacy structure-draft controls', async () => {
  const onOpenBuilder = jest.fn();
  const onCreateDraft = jest.fn();
  const onApplyDraft = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SiteBuilderPanelUnderTest
        palette={palettes.light}
        language="zh"
        enabled
        readiness={{ configured: true }}
        onOpenBuilder={onOpenBuilder}
        profile={{ stationConfig: {} }}
        siteDrafts={[]}
        onCreateDraft={onCreateDraft}
        onApplyDraft={onApplyDraft}
        onActionMessage={jest.fn()}
        onActionError={jest.fn()}
      />,
    );
  });

  const mounted = renderer as unknown as ReactTestRenderer.ReactTestRenderer;
  expect(mounted.root.findAllByType(TextInput)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    mounted.root
      .findByProps({ testID: 'station-site-builder-open' })
      .props.onPress();
  });

  expect(onOpenBuilder).toHaveBeenCalledTimes(1);
  expect(onCreateDraft).not.toHaveBeenCalled();
  expect(onApplyDraft).not.toHaveBeenCalled();
});
