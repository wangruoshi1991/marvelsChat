// Only explicit queued tasks enter this executor. A dispatched request is never
// retried, including after a worker lease loss or an ambiguous provider timeout.
export function createComicRenderExecutor({ provider, repository, storage } = {}) {
  return async function executeComicRenderTask(record) {
    const identity = { taskId: record.id, claimToken: record.claimToken };
    let succeeded = 0, failed = 0;
    const finish = (status, error = null) => repository.finishComicRenderTask({ ...identity, status, error });
    let snapshot;
    try { snapshot = await repository.revalidateComicRenderTask(identity); }
    catch (error) { return finish('failed', safeFailure(error)); }
    // Revalidation is repeated immediately before every provider dispatch. The
    // storage bind independently repeats it inside its commit transaction.
    for (const frame of snapshot.input.frames) {
      let started = false;
      try {
        if (frame.index !== snapshot.input.frames[0].index) await repository.revalidateComicRenderTask(identity);
        await repository.markComicFrameRunning({ ...identity, frameIndex: frame.index });
        started = true;
        const selectedImages = await storage.readSelectedImages({ userId: record.userId, mediaAssetIds: frame.mediaAssetIds });
        await repository.revalidateComicRenderTask(identity);
        let result;
        try {
          result = await provider.generateFrame({
            prompt: [snapshot.input.style,frame.title,frame.scene,frame.caption,frame.dialogue,frame.mood,frame.camera].filter(Boolean).join('\n'),
            selectedImages, ...snapshot.input.outputOptions,
            idempotencyKey: `${record.id}:${frame.index}`,
          });
        } catch (error) {
          if (unknownOutcome(error)) {
            await repository.markComicFrameResult({ ...identity, frameIndex:frame.index, status:'unknown', errorCode:'COMIC_IMAGE_OUTCOME_UNKNOWN' });
            return finish('interrupted', {code:'COMIC_IMAGE_OUTCOME_UNKNOWN',message:'画面生成响应中断，结果尚未确认。后续画面已停止，本次不会自动重试。'});
          }
          throw error;
        }
        await storage.storeComicFrame({ ...identity, userId:record.userId, frameIndex:frame.index, ...result });
        succeeded++;
      } catch (error) {
        if (error?.outcomeUnknown === true) return finish('interrupted', {code:'COMIC_STORAGE_OUTCOME_UNKNOWN',message:'画面保存结果尚未确认，后续画面已停止，没有自动重试。'});
        const failure = safeFailure(error);
        // Lease-loss errors must never overwrite the recovery decision.
        if (failure.code === 'AI_TASK_LEASE_LOST') throw error;
        if (!started) return finish(succeeded ? 'partially_succeeded' : 'failed', failure);
        await repository.markComicFrameResult({ ...identity,frameIndex:frame.index,status:'failed',errorCode:failure.code });
        failed++;
        if (error?.status === 403 || error?.status === 404 || error?.status === 409) return finish(succeeded ? 'partially_succeeded' : 'failed', failure);
      }
    }
    return finish(failed ? (succeeded ? 'partially_succeeded' : 'failed') : 'succeeded', failed ? {code:'COMIC_RENDER_FRAME_FAILED',message:'部分画面未能交付，请查看每格状态。本次没有自动重试。'} : null);
  };
}
function unknownOutcome(error) {
  return error?.outcomeUnknown === true || error?.details?.code === 'COMIC_IMAGE_OUTCOME_UNKNOWN' || error?.status === 504 || ['TypeError','TimeoutError','AbortError'].includes(error?.name);
}
function safeFailure(error) {
  const code=error?.details?.code;
  if (code === 'AI_TASK_LEASE_LOST') return {code,message:'漫画任务执行权已失效。'};
  if(error?.status===403) return {code:'COMIC_RENDER_ACCESS_REVOKED',message:'所需授权已撤回，后续画面已停止。'};
  if(error?.status===404||error?.status===409) return {code:'COMIC_RENDER_SOURCE_CHANGED',message:'所选分镜、素材或 Agent 已变化，后续画面已停止。'};
  if(code === 'COMIC_IMAGE_BYTES_INVALID') return {code,message:'图片结果无效，未保存为漫画画面。'};
  if(code === 'COMIC_IMAGE_STORAGE_FAILED') return {code,message:'画面未能安全保存。'};
  return {code:'COMIC_RENDER_FRAME_FAILED',message:'本格画面未能交付，没有自动重试。'};
}
