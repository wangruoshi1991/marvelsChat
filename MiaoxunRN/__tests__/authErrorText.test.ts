import { authErrorText } from '../src/shared/i18n';

describe('authErrorText', () => {
  it('translates the unified credential error without identifying the account', () => {
    expect(authErrorText('zh', 'Invalid account or password')).toBe(
      '账号或密码错误',
    );
    expect(authErrorText('en', 'Invalid account or password')).toBe(
      'Incorrect account or password',
    );
  });

  it('matches the credential error regardless of case', () => {
    expect(authErrorText('zh', 'INVALID ACCOUNT OR PASSWORD')).toBe(
      '账号或密码错误',
    );
  });

  it('preserves other explicit service errors', () => {
    expect(authErrorText('zh', '登录尝试过于频繁，请稍后再试。')).toBe(
      '登录尝试过于频繁，请稍后再试。',
    );
    expect(authErrorText('zh', null)).toBe('');
  });
});
