import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

export function useSessionSetter<T>(
  token: string,
  currentToken: MutableRefObject<string>,
  setState: Dispatch<SetStateAction<T>>,
) {
  return useCallback(
    (value: SetStateAction<T>) => {
      if (!token || currentToken.current !== token) {
        return;
      }
      setState(current => {
        if (currentToken.current !== token) {
          return current;
        }
        return typeof value === 'function'
          ? (value as (previous: T) => T)(current)
          : value;
      });
    },
    [currentToken, setState, token],
  );
}
