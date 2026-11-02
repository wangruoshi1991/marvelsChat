const emptyState = () => ({ id: null, detail: null, loading: false, error: null, revision: 0 });

export function createUserDetailLoader({ request, onChange }) {
  let currentId = null;
  let revision = 0;
  const load = async (id) => {
    if (!id) return;
    currentId = id;
    const requestRevision = ++revision;
    onChange({ id, detail: null, loading: true, error: null, revision });
    try {
      const detail = await request(`/api/admin/users/${encodeURIComponent(id)}`);
      if (requestRevision !== revision || currentId !== id) return;
      if (detail?.user?.id !== id) throw new Error("用户详情与所选账号不一致，请重新读取。");
      onChange({ id, detail, loading: false, error: null, revision });
    } catch (error) {
      if (requestRevision !== revision || currentId !== id) return;
      onChange({ id, detail: null, loading: false, revision,
        error: { message: error?.message || "读取用户详情失败", requestId: error?.requestId || null } });
    }
  };
  return {
    open: load,
    refresh: () => load(currentId),
    close() { currentId = null; revision += 1; onChange({ ...emptyState(), revision }); },
    cancel() { currentId = null; revision += 1; },
  };
}
