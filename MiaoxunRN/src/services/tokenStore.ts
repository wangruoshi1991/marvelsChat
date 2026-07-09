import * as Keychain from 'react-native-keychain';

const service = 'com.gary.miaoxun.rn.auth';
const account = 'auth-token';

export const tokenStore = {
  async save(token: string) {
    await Keychain.setGenericPassword(account, token, {service});
  },

  async read() {
    const credentials = await Keychain.getGenericPassword({service});
    return credentials ? credentials.password : '';
  },

  async clear() {
    await Keychain.resetGenericPassword({service});
  },
};
