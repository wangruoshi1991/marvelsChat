#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(MiaoxunDocumentPickerModule, NSObject)
RCT_EXTERN_METHOD(pick:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(pickVideo:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(release:(NSString *)key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(upload:(NSString *)key token:(NSString *)token mimeType:(NSString *)mimeType filename:(NSString *)filename resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(uploadChatAttachment:(NSString *)key threadId:(NSString *)threadId token:(NSString *)token mimeType:(NSString *)mimeType encodedFilename:(NSString *)encodedFilename idempotencyKey:(NSString *)idempotencyKey resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestBinary:(NSString *)method path:(NSString *)path token:(NSString *)token uri:(NSString *)uri headers:(NSDictionary *)headers maximumUploadBytes:(nonnull NSNumber *)maximumUploadBytes maximumResponseBytes:(nonnull NSNumber *)maximumResponseBytes resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(downloadChatVideo:(NSString *)key attachmentId:(NSString *)attachmentId token:(NSString *)token resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(releaseChatVideo:(NSString *)key)
@end
