import React from 'react';
import { Alert, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { AuthScreen } from '../src/features/auth/AuthScreen';
import { DeleteAccountSheet } from '../src/features/settings/DeleteAccountSheet';
import { LegalPoliciesDTO } from '../src/models/api';
import { palettes } from '../src/shared/theme';

const policies: LegalPoliciesDTO = {
  privacy: {
    version: '2026-07-15',
    url: 'https://preview.example.com/legal/privacy',
  },
  terms: {
    version: '2026-07-15',
    url: 'https://preview.example.com/legal/terms',
  },
};

async function unmount(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => renderer.unmount());
}

describe('account safety', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('registration stays blocked until the current policies are accepted', async () => {
    const onSignUp = jest.fn(async () => undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthScreen
          palette={palettes.light}
          language="zh"
          isBusy={false}
          errorMessage={null}
          policies={policies}
          onOpenLegalUrl={jest.fn()}
          onSignIn={jest.fn()}
          onSignUp={onSignUp}
        />,
      );
    });
    const screen = renderer as unknown as ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      screen.root.findByProps({ testID: 'auth-mode-register' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      screen.root
        .findByProps({ testID: 'auth-display-name' })
        .props.onChangeText('Jarson');
      screen.root
        .findByProps({ testID: 'auth-register-contact' })
        .props.onChangeText('jarson@example.com');
      screen.root
        .findByProps({ testID: 'auth-password' })
        .props.onChangeText('Qwer1234!');
    });

    expect(
      screen.root.findByProps({ testID: 'auth-submit' }).props
        .accessibilityState,
    ).toEqual({ disabled: true });
    await ReactTestRenderer.act(async () => {
      screen.root
        .findByProps({ testID: 'auth-policy-consent' })
        .props.onPress();
    });
    expect(
      screen.root.findByProps({ testID: 'auth-submit' }).props
        .accessibilityState,
    ).toEqual({ disabled: false });

    await ReactTestRenderer.act(async () => {
      screen.root.findByProps({ testID: 'auth-submit' }).props.onPress();
    });
    expect(onSignUp).toHaveBeenCalledWith(
      'email',
      'jarson@example.com',
      'Qwer1234!',
      'Jarson',
      {
        privacyPolicyVersion: policies.privacy.version,
        termsVersion: policies.terms.version,
        privacyAccepted: true,
        termsAccepted: true,
      },
    );
    await unmount(screen);
  });

  test('account deletion requires password, typed confirmation, and final approval', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const onDeleteAccount = jest.fn(async () => undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DeleteAccountSheet
          palette={palettes.light}
          language="zh"
          onBack={jest.fn()}
          onDeleteAccount={onDeleteAccount}
        />,
      );
    });
    const sheet = renderer as unknown as ReactTestRenderer.ReactTestRenderer;
    const inputs = sheet.root.findAllByType(TextInput);

    await ReactTestRenderer.act(async () => {
      inputs[0].props.onChangeText('Qwer1234!');
      inputs[1].props.onChangeText('删除账号');
    });
    expect(
      sheet.root.findByProps({ testID: 'delete-account-submit' }).props
        .accessibilityState,
    ).toEqual({ disabled: false });

    await ReactTestRenderer.act(async () => {
      sheet.root
        .findByProps({ testID: 'delete-account-submit' })
        .props.onPress();
    });
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0][2] || [];
    const deleteButton = buttons.find(button => button.text === '永久删除');
    await ReactTestRenderer.act(async () => {
      await deleteButton?.onPress?.();
    });

    expect(onDeleteAccount).toHaveBeenCalledWith('Qwer1234!');
    await unmount(sheet);
  });
});
