import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { useButlerActions } from '../src/app/useButlerActions';

describe('Butler navigation actions', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens the real Station Agent workspace for site building', async () => {
    jest.useFakeTimers();
    const setSelectedTab = jest.fn();
    const setSelectedStationTab = jest.fn();
    const setModalRoute = jest.fn();
    let sendButlerMessage:
      | ReturnType<typeof useButlerActions>['sendButlerMessage']
      | undefined;

    function Harness() {
      ({ sendButlerMessage } = useButlerActions({
        session: {
          language: 'zh',
          setAppearance: jest.fn(),
          setLanguage: jest.fn(),
          sendMessage: jest.fn().mockResolvedValue(true),
        },
        setSelectedTab,
        setSelectedMessageTab: jest.fn(),
        setSelectedStationTab,
        setModalRoute,
        setSearchQuery: jest.fn(),
        openQRCode: jest.fn(),
      }));
      return null;
    }

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Harness />);
    });

    await ReactTestRenderer.act(async () => {
      await sendButlerMessage?.('butler-thread', '打开建站入口');
    });
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(260);
    });

    expect(setSelectedTab).toHaveBeenCalledWith('station');
    expect(setSelectedStationTab).toHaveBeenCalledWith('agents');
    expect(setModalRoute).toHaveBeenCalledWith(null);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });
});
