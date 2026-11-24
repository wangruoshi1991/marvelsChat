import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

/** A callback from a previous account or an unmounted screen stays inactive. */
export function useCurrentScope(scope: unknown) {
  const owner = useMemo(() => ({ scope }), [scope]);
  const current = useRef<typeof owner | null>(null);
  useLayoutEffect(() => {
    current.current = owner;
    return () => {
      current.current = null;
    };
  }, [owner]);
  return useCallback(() => current.current === owner, [owner]);
}
