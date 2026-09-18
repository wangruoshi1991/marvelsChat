import React from 'react';
import { Alert, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { StationProfileEditScreen } from '../src/features/station/StationProfileEditScreen';
import { emptyProfile } from '../src/features/session/sessionDefaults';
import { getCurrentLocation } from '../src/services/location';
import { LocationResolveDTO } from '../src/models/api';
import { palettes } from '../src/shared/theme';
import { MiaoxunApiError } from '../src/services/api/http';

jest.mock('../src/services/location', () => ({
  getCurrentLocation: jest.fn(),
}));

const located: LocationResolveDTO = {
  latitude: 31.23,
  longitude: 121.47,
  provider: 'amap',
  country: '中国',
  community: '某小区',
  activityArea: '某商圈',
  displayName: '完整街道地址',
  communityCandidates: [
    { id: 'poi:1', type: 'poi', name: '某小区', detail: '住宅' },
  ],
  activityAreaCandidates: [
    { id: 'area:1', type: 'business_area', name: '某商圈', detail: '商圈' },
    { id: 'district:1', type: 'district', name: '静安区', detail: '区县' },
    { id: 'city:1', type: 'city', name: '上海市', detail: '城市' },
    { id: 'province:1', type: 'province', name: '上海市', detail: '省份' },
  ],
};

async function openEditor({
  onUpdateProfile = jest.fn().mockResolvedValue(emptyProfile),
  onResolveLocation = jest.fn().mockResolvedValue(located),
} = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const onBack = jest.fn();
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <StationProfileEditScreen
        palette={palettes.light}
        language="zh"
        profile={{
          ...emptyProfile,
          nickname: '本人',
          avatarText: '本',
          bio: '旧签名',
          headline: '设计师',
          publicLocation: '杭州',
          experienceYears: 5,
          languages: ['zh'],
          community: '旧社区',
          activityArea: '旧活动区',
        }}
        onBack={onBack}
        onUpdateProfile={onUpdateProfile}
        onResolveLocation={onResolveLocation}
        onActionError={jest.fn()}
      />,
    );
  });
  const button = (label: string) =>
    renderer.root.findAllByProps({ accessibilityLabel: label })[0];
  const press = async (label: string) =>
    ReactTestRenderer.act(async () => {
      await button(label).props.onPress();
    });
  const change = async (label: string, value: string) =>
    ReactTestRenderer.act(async () => {
      renderer.root
        .findAllByType(TextInput)
        .find(input => input.props.accessibilityLabel === label)!
        .props.onChangeText(value);
    });
  const input = (label: string) =>
    renderer.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === label);
  const save = () => button('保存小站资料').props.onPress();
  return {
    renderer,
    button,
    press,
    change,
    input,
    save,
    onUpdateProfile,
    onResolveLocation,
    onBack,
  };
}

describe('station profile editing', () => {
  beforeEach(() => {
    jest.mocked(getCurrentLocation).mockReset().mockResolvedValue({
      latitude: 31.23,
      longitude: 121.47,
      horizontalAccuracy: 12,
    });
  });

  it('explains missing geocoding data without showing a permission remedy or saving a guessed city', async () => {
    const editor = await openEditor({
      onResolveLocation: jest.fn().mockRejectedValue(
        new MiaoxunApiError('Geocoding service did not return usable data.', {
          status: 422,
        }),
      ),
    });
    await editor.press('定位选择地区');
    const visible = JSON.stringify(editor.renderer.toJSON());
    expect(visible).toContain('当前位置没有可用的地区信息');
    expect(visible).not.toContain('Geocoding service');
    expect(editor.button('管理定位权限')).toBeUndefined();
    expect(editor.onUpdateProfile).not.toHaveBeenCalled();
  });

  it('starts with only name and bio inputs and preserves optional professional data on save', async () => {
    const editor = await openEditor();
    expect(editor.renderer.root.findAllByType(TextInput)).toHaveLength(2);
    expect(editor.input('职业身份')).toBeUndefined();
    await editor.change(
      '签名 / 个人简介',
      '把模糊的想法，做成清晰、可用、增长的作品',
    );
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: '本人',
        avatarText: '本',
        bio: '把模糊的想法，做成清晰、可用、增长的作品',
        headline: '设计师',
        publicLocation: '杭州',
        experienceYears: 5,
        languages: ['zh'],
        community: '旧社区',
        activityArea: '旧活动区',
      }),
    );
    expect(editor.onBack).toHaveBeenCalledTimes(1);
  });

  it('clears optional identity explicitly and preserves zero experience', async () => {
    const editor = await openEditor();
    await editor.press('职业资料');
    await editor.change('职业身份', '');
    await editor.change('经验年限', '');
    await editor.press('中文');
    await editor.press('不展示地区');
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headline: '',
        publicLocation: '',
        experienceYears: null,
        languages: [],
      }),
    );
    await editor.change('经验年限', '0');
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ experienceYears: 0 }),
    );
  });

  it('rejects invalid input and retains drafts on a server error', async () => {
    const editor = await openEditor({
      onUpdateProfile: jest
        .fn()
        .mockRejectedValue(new Error('服务器暂时不可用')),
    });
    await editor.press('职业资料');
    await editor.change('经验年限', '-1');
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).not.toHaveBeenCalled();
    await editor.change('职业身份', '我的职业');
    await editor.change('经验年限', '8');
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onBack).not.toHaveBeenCalled();
    expect(editor.input('职业身份')!.props.value).toBe('我的职业');
    expect(JSON.stringify(editor.renderer.toJSON())).toContain(
      '服务器暂时不可用',
    );
  });

  it('submits only once before React rerenders', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => {
      finish = resolve;
    });
    const editor = await openEditor({
      onUpdateProfile: jest.fn().mockReturnValue(pending),
    });
    await ReactTestRenderer.act(async () => {
      const first = editor.save();
      const second = editor.save();
      expect(editor.onUpdateProfile).toHaveBeenCalledTimes(1);
      finish();
      await Promise.all([first, second]);
    });
    expect(editor.onBack).toHaveBeenCalledTimes(1);
  });

  it('requires explicit coarse region selection and never applies nearby private places automatically', async () => {
    const editor = await openEditor();
    await editor.press('定位选择地区');
    expect(getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(editor.onResolveLocation).toHaveBeenCalledWith({
      latitude: 31.23,
      longitude: 121.47,
    });
    expect(editor.onUpdateProfile).not.toHaveBeenCalled();
    expect(editor.button('选择展示地区：某小区')).toBeUndefined();
    expect(editor.button('选择展示地区：静安区')).toBeUndefined();
    expect(
      editor.renderer.root
        .findAllByProps({ accessibilityLabel: '选择展示地区：上海市' })
        .filter(node => typeof node.type === 'string'),
    ).toHaveLength(1);
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publicLocation: '杭州',
        community: '旧社区',
        activityArea: '旧活动区',
      }),
    );
    await editor.press('选择展示地区：上海市');
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publicLocation: '上海市',
        community: '旧社区',
        activityArea: '旧活动区',
      }),
    );
  });

  it('keeps community changes independent of display region and saves them in the same draft', async () => {
    const editor = await openEditor();
    await editor.press('定位选择地区');
    await editor.press('社区与活动区域');
    await editor.press('所属社区：某小区');
    await editor.press('活动区域：某商圈');
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publicLocation: '杭州',
        community: '某小区',
        activityArea: '某商圈',
      }),
    );
  });

  it('shows denied location and preserves the current region without requesting geocoding', async () => {
    jest
      .mocked(getCurrentLocation)
      .mockRejectedValue(new Error('未获得定位权限'));
    const editor = await openEditor();
    await editor.press('定位选择地区');
    expect(editor.onResolveLocation).not.toHaveBeenCalled();
    expect(JSON.stringify(editor.renderer.toJSON())).toContain(
      '未获得定位权限',
    );
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ publicLocation: '杭州' }),
    );
  });

  it('does not infer a public region from street or district results', async () => {
    const editor = await openEditor({
      onResolveLocation: jest.fn().mockResolvedValue({
        ...located,
        activityAreaCandidates: located.activityAreaCandidates.slice(0, 2),
      }),
    });
    await editor.press('定位选择地区');
    expect(JSON.stringify(editor.renderer.toJSON())).toContain(
      '当前位置没有可展示的城市或省份',
    );
    expect(editor.button('选择展示地区：静安区')).toBeUndefined();
    await ReactTestRenderer.act(async () => {
      await editor.save();
    });
    expect(editor.onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ publicLocation: '杭州' }),
    );
  });

  it('locks save and deduplicates physical locate taps while coordinates are pending', async () => {
    let finish!: (value: {
      latitude: number;
      longitude: number;
      horizontalAccuracy: number;
    }) => void;
    jest.mocked(getCurrentLocation).mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      }),
    );
    const editor = await openEditor();
    let first!: Promise<void>;
    await ReactTestRenderer.act(async () => {
      first = editor.button('定位选择地区').props.onPress();
      editor.button('定位选择地区').props.onPress();
      await editor.save();
    });
    expect(getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(editor.onUpdateProfile).not.toHaveBeenCalled();
    expect(editor.button('保存小站资料').props.disabled).toBe(true);
    await ReactTestRenderer.act(async () => {
      finish({ latitude: 31.23, longitude: 121.47, horizontalAccuracy: 12 });
      await first;
    });
    expect(editor.button('保存小站资料').props.disabled).toBe(false);
  });

  it('asks before abandoning unsaved edits', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const editor = await openEditor();
    await editor.change('昵称', '新昵称');
    await editor.press('返回');
    expect(editor.onBack).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      '放弃修改？',
      expect.any(String),
      expect.any(Array),
    );
    alert.mockRestore();
  });
});
