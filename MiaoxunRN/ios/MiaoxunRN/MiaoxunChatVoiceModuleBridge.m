#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MiaoxunChatVoiceModule, NSObject)

RCT_EXTERN_METHOD(prepareRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(startRecording:(NSString *)recordingId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(finishRecording:(NSString *)recordingId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(cancelRecording:(NSString *)recordingId)
RCT_EXTERN_METHOD(releaseRecording:(NSString *)recordingId)
RCT_EXTERN_METHOD(playRecording:(NSString *)playbackId
                  recordingId:(NSString *)recordingId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(playAttachment:(NSString *)playbackId
                  attachmentId:(NSString *)attachmentId
                  token:(NSString *)token
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getPlaybackState:(NSString *)playbackId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setPlaybackPaused:(NSString *)playbackId
                  paused:(BOOL)paused
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(seekPlayback:(NSString *)playbackId
                  positionMs:(double)positionMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setPlaybackRate:(NSString *)playbackId
                  rate:(double)rate
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopPlayback:(NSString *)playbackId)

@end
