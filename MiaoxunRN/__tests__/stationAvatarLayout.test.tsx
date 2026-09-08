import React from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  Avatar3DBootstrapDTO,
  Avatar3DJobDTO,
  Avatar3DReferencesDTO,
} from '../src/models/api';
import { Avatar3DCreateScreen } from '../src/features/station/Avatar3DCreateScreen';
import { StationAvatarSpace } from '../src/features/station/StationAvatarSpace';
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
    defaultQualityPreset: 'ultra',
    qualityPresets: [
      {
        id: 'standard',
        label: '标准',
        description: '高清纹理，适合个人主页和日常查看',
        estimatedCostFen: 280,
      },
      {
        id: 'ultra',
        label: '超精细',
        description: '适合大屏查看和专业处理',
        estimatedCostFen: 420,
      },
    ],
  },
  quota: { dailyUsed: 0, dailyRemaining: 3, hasActiveJob: false },
  jobs: [],
  activeJob: null,
  models: [],
};

const awaitingReferencesJob: Avatar3DJobDTO = {
  id: 'job-1',
  style: 'realistic',
  qualityPreset: 'ultra',
  generationMode: 'face_first_multiview',
  referenceSetId: 'reference-set-1',
  status: 'awaiting_reference_confirmation',
  progress: 60,
  photoCount: 1,
  acceptedCostVersion: 'test-v1',
  estimatedCostFen: 420,
  modelId: null,
  errorCode: null,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
  finishedAt: null,
};

const references: Avatar3DReferencesDTO = {
  referenceSet: {
    id: 'reference-set-1',
    jobId: 'job-1',
    status: 'awaiting_confirmation',
    expectedImageCount: 4,
    actualImageCount: 4,
    usageImageCount: 4,
    costVersion: 'test-v1',
    estimatedCostFen: 200,
    confirmedAt: null,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  },
  images: (['right', 'front', 'back', 'left'] as const).map(view => ({
    id: `image-${view}`,
    referenceSetId: 'reference-set-1',
    jobId: 'job-1',
    view,
    sequenceIndex: { front: 0, left: 1, back: 2, right: 3 }[view],
    mimeType: 'image/jpeg',
    byteSize: 1024,
    width: 1024,
    height: 1024,
    status: 'active',
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  })),
};

const validatedPhoto = {
  id: 'photo-1',
  jobId: null,
  view: null,
  originalFilename: 'portrait.jpg',
  mimeType: 'image/jpeg' as const,
  byteSize: 1024,
  width: 1024,
  height: 1024,
  status: 'ready',
  purpose: 'reference',
  quality: { level: 'good' as const, canContinue: true, suggestions: [] },
  errorCode: null,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
};

const workflowValue = (
  overrides: Partial<ReturnType<typeof useAvatar3dWorkflow>> = {},
) =>
  ({
    bootstrap,
    busyAction: 'none',
    cancelJob: jest.fn(),
    confirmReferences: jest.fn(),
    createJob: jest.fn(),
    deleteModel: jest.fn(),
    discardDraft: jest.fn(async () => undefined),
    dismissJob: jest.fn(),
    errorMessage: '',
    isSubmissionUncertain: false,
    job: null,
    pendingOptions: null,
    references: null,
    rejectReferences: jest.fn(),
    setErrorMessage: jest.fn(),
    validatedPhoto: null,
    validatePhoto: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAvatar3dWorkflow>);

const renderedText = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAllByType(Text)
    .flatMap(node => [node.props.children].flat(Infinity))
    .filter(value => typeof value === 'string' || typeof value === 'number')
    .join('');

describe('station avatar layout', () => {
  beforeEach(() => {
    mockedUseAvatar3dWorkflow.mockReturnValue(workflowValue());
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
    expect(
      renderer!.root.findByProps({ testID: 'avatar3d-reference-cost' }),
    ).toBeTruthy();
    expect(renderedText(renderer!)).toContain('身材方向');
    expect(renderedText(renderer!)).toContain('运动感');
    expect(renderedText(renderer!)).toContain('服装方向');
    expect(renderedText(renderer!)).toContain('商务休闲');
    expect(renderedText(renderer!)).toContain('补充要求');
    expect(renderedText(renderer!)).toContain('本次先生成 4 张参考图');
    expect(renderedText(renderer!)).toContain('预计 ¥2.00');
    expect(renderedText(renderer!)).not.toContain('3D 生成精度');

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('offers model quality only after all four reference views are ready', async () => {
    const confirmReferences = jest.fn(async () => undefined);
    mockedUseAvatar3dWorkflow.mockReturnValue(
      workflowValue({
        confirmReferences,
        job: awaitingReferencesJob,
        references,
      }),
    );
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

    expect(
      renderer!.root.findByProps({ testID: 'avatar3d-quality-options' }),
    ).toBeTruthy();
    expect(
      renderer!.root.findByProps({ testID: 'avatar3d-quality-ultra' }).props
        .accessibilityState,
    ).toEqual({ checked: true });
    expect(renderedText(renderer!)).toContain('预计 ¥4.20');

    await ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ testID: 'avatar3d-quality-standard' })
        .props.onPress();
    });
    const confirmButton = renderer!.root.findByProps({
      testID: 'avatar3d-confirm-references',
    });
    expect(confirmButton.props.disabled).toBe(false);

    await ReactTestRenderer.act(() => confirmButton.props.onPress());
    expect(confirmReferences).toHaveBeenCalledWith('standard');

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('confirms reference cost and uses the server default for the initial job', async () => {
    const createJob = jest.fn(async () => undefined);
    mockedUseAvatar3dWorkflow.mockReturnValue(
      workflowValue({ createJob, validatedPhoto }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
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

    const consentControl = (label: string) => {
      let node: ReactTestRenderer.ReactTestInstance | null =
        renderer!.root
          .findAllByType(Text)
          .find(candidate => candidate.props.children === label) || null;
      while (
        node &&
        (node.props.accessibilityRole !== 'checkbox' ||
          typeof node.props.onPress !== 'function')
      ) {
        node = node.parent;
      }
      if (!node) {
        throw new Error(`Missing consent control: ${label}`);
      }
      return node;
    };
    await ReactTestRenderer.act(() => {
      consentControl(
        '确认拥有照片使用授权，且照片中的人物已成年',
      ).props.onPress();
      consentControl(
        '同意 AI 根据描述补全未展示的身体、服装与背面',
      ).props.onPress();
    });
    await ReactTestRenderer.act(() => {
      renderer!.root.findByProps({ testID: 'avatar3d-submit' }).props.onPress();
    });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('确认生成四视图');
    expect(alert.mock.calls[0][1]).toContain('预计费用：¥2.00');
    const actions = alert.mock.calls[0][2];
    await ReactTestRenderer.act(() => actions?.[1]?.onPress?.());
    expect(createJob).toHaveBeenCalledWith({
      bodyShape: 'balanced',
      outfit: 'smart_casual',
      qualityPreset: 'ultra',
      userDescription: '',
    });

    alert.mockRestore();
    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('blocks 3D generation when the reference set is incomplete', async () => {
    mockedUseAvatar3dWorkflow.mockReturnValue(
      workflowValue({
        job: awaitingReferencesJob,
        references: { ...references, images: references.images.slice(0, 3) },
      }),
    );
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

    expect(
      renderer!.root.findByProps({
        testID: 'avatar3d-confirm-references',
      }).props.disabled,
    ).toBe(true);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('fills the 3D stage and keeps only one outfit entry', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationAvatarSpace
          avatar3d={bootstrap}
          avatar3dError=""
          avatar3dStatus="ready"
          language="zh"
          onOpenGenerator={jest.fn()}
          onOpenOotd={jest.fn()}
          palette={palettes.light}
          token="token"
        />,
      );
    });

    const labels = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children);
    const stageStyle = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'avatar3d-stage' }).props.style,
    );
    const emptyStyle = StyleSheet.flatten(
      renderer!.root.findByProps({ testID: 'avatar3d-empty-state' }).props
        .style,
    );

    expect(labels.filter(label => label === '今日穿搭')).toHaveLength(1);
    expect(labels).toContain('生成形象');
    expect(stageStyle.backgroundColor).toBe('#F7F8FC');
    expect(emptyStyle.flex).toBe(1);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('shows the generated preview while the interactive model is being saved', async () => {
    const persistingJob: Avatar3DJobDTO = {
      ...awaitingReferencesJob,
      modelId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      progress: 95,
      status: 'persisting',
    };
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationAvatarSpace
          avatar3d={{
            ...bootstrap,
            activeJob: persistingJob,
            jobs: [persistingJob],
            quota: { ...bootstrap.quota, hasActiveJob: true },
          }}
          avatar3dError=""
          avatar3dStatus="ready"
          language="zh"
          onOpenGenerator={jest.fn()}
          palette={palettes.light}
          token="token"
        />,
      );
    });

    expect(renderedText(renderer!)).toContain('模型已生成，正在准备交互文件。');
    expect(renderer!.root.findByType(Image).props.source.uri).toContain(
      '/models/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/thumbnail',
    );

    await ReactTestRenderer.act(() => renderer!.unmount());
  });
});
