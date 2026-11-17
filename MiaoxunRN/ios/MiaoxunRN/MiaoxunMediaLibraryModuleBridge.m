#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MiaoxunMediaLibraryModule, NSObject)
RCT_EXTERN_METHOD(saveImage:(NSString *)mediaAssetId
                  token:(NSString *)token
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(saveChatImage:(NSString *)attachmentId
                  token:(NSString *)token
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
