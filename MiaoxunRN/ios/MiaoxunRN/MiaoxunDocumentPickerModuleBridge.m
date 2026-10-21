#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(MiaoxunDocumentPickerModule, NSObject)
RCT_EXTERN_METHOD(pick:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(release:(NSString *)key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(upload:(NSString *)key token:(NSString *)token mimeType:(NSString *)mimeType filename:(NSString *)filename resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
