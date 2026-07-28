import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { Avatar3DBootstrapDTO } from '../src/models/api';
import { Avatar3DCreateScreen } from '../src/features/station/Avatar3DCreateScreen';
import { Stat } from '../src/features/station/StationShared';
import { useAvatar3dWorkflow } from '../src/features/station/useAvatar3dWorkflow';
import { palettes } from '../src/shared/theme';

jest.mock('../src/features/station/useAvatar3dWorkflow', () => ({
  useAvatar3dWorkflow: jest.fn(),
}));

const mockedUseAvatar3dWorkflow = useAvatar3dWorkflow as jest.MockedFunction<
  typeof useAvatar3dWorkflow
>;

const bootstrap: Avatar3DBootstrapDTO = {
  user: {
    id: 'user-1',
    email: 'tester@example.com',
    displayName: 'Tester',
    aiId: '000000000001',
    role: 'user',
  },
  feature: {
    enabled: true,
    generationAvailable: true,
    dailyLimit: 3,
    retentionDays: 7,
    costVersion: 'test-v1',
    referenceGenerationEstimatedCostFen: 200,
    defaultQualityPreset: 'standard',
    qualityPresets: [
      {
        id: 'standard',
        label: 'Standard',
        description: 'Standard model',
        estimatedCostFen: 280,
      },
    ],
  },
  quota: { dailyUsed: 0, dailyRemaining: 3, hasActiveJob: false },
  jobs: [],
  activeJob: null,
  models: [],
};

describe('station avatar layout', () => {
  beforeEach(() => {
    mockedUseAvatar3dWorkflow.mockReturnValue({
      bootstrap,
      busyAction: 'none',
      createJob: jest.fn(),
      discardDraft: jest.fn(async () => undefined),
      errorMessage: '',
      isSubmissionUncertain: false,
      job: null,
      pendingOptions: null,
      setErrorMessage: jest.fn(),
      validatedPhoto: null,
      validatePhoto: jest.fn(),
    } as unknown as ReturnType<typeof useAvatar3dWorkflow>);
  });

  it('keeps the composer scrollable below its fixed header and footer', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Avatar3DCreateScreen
          initialBootstrap={bootstrap}
          language="zh"
          onBack={jest.fn()}
          onChanged={jest.fn()}
          palette={palettes.light}
          token="token"
        />,
      );
    });

    const screen = renderer!.root.findByProps({
      testID: 'avatar3d-create-screen',
    });
    const scrollView = renderer!.root.findByProps({
      testID: 'avatar3d-composer-scroll',
    });

    expect(screen.props.accessibilityViewIsModal).toBe(true);
    expect(scrollView.type).toBe(ScrollView);
    expect(StyleSheet.flatten(scrollView.props.style)).toMatchObject({
      flex: 1,
    });

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('renders zero for a non-finite station statistic', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Stat label="Likes" palette={palettes.light} value={Number.NaN} />,
      );
    });

    const values = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(values).toContain(0);
    expect(values).not.toContain(Number.NaN);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });
});
