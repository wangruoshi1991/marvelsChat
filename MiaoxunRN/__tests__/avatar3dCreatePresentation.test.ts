import {
  bodyShapeOptions,
  formatCost,
  jobStatusCopy,
  outfitOptions,
  referenceViewLabel,
} from '../src/features/station/avatar3dCreatePresentation';

describe('3D avatar creation presentation', () => {
  it('provides localized body and outfit options with stable API values', () => {
    expect(bodyShapeOptions('zh')).toEqual([
      { label: '匀称', value: 'balanced' },
      { label: '修长', value: 'slender' },
      { label: '运动感', value: 'athletic' },
    ]);
    expect(outfitOptions('en').map(option => option.value)).toEqual([
      'smart_casual',
      'casual',
      'business',
      'sport',
      'formal',
    ]);
  });

  it('formats estimated costs from fen', () => {
    expect(formatCost(0)).toBe('¥0.00');
    expect(formatCost(1299)).toBe('¥12.99');
  });

  it('localizes active job status copy', () => {
    expect(
      jobStatusCopy('zh', {
        errorCode: null,
        status: 'processing_3d',
      }),
    ).toEqual({
      body: '可以离开此页面，任务会在后台继续。',
      title: '正在生成3D模型',
    });
    expect(
      jobStatusCopy('en', {
        errorCode: null,
        status: 'processing_3d',
      }),
    ).toEqual({
      body: 'You can leave while the task continues.',
      title: 'Generating 3D Model',
    });
  });

  it('includes provider error codes in failed status copy', () => {
    expect(
      jobStatusCopy('zh', {
        errorCode: 'PROVIDER_TIMEOUT',
        status: 'failed',
      }).body,
    ).toBe('错误代码：PROVIDER_TIMEOUT');
    expect(
      jobStatusCopy('en', {
        errorCode: 'PROVIDER_TIMEOUT',
        status: 'failed',
      }).body,
    ).toBe('Error: PROVIDER_TIMEOUT');
  });

  it('labels all four reference views', () => {
    expect(
      (['front', 'left', 'back', 'right'] as const).map(view =>
        referenceViewLabel('zh', view),
      ),
    ).toEqual(['正面', '左侧', '背面', '右侧']);
    expect(referenceViewLabel('en', 'back')).toBe('Back');
  });
});
