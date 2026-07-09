#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MiaoxunConfigModule, NSObject)
@end

@interface RCT_EXTERN_MODULE(QRCodeScannerModule, NSObject)

RCT_EXTERN_METHOD(scan:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(MiaoxunLocationModule, NSObject)

RCT_EXTERN_METHOD(currentLocation:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(MiaoxunSpeechModule, NSObject)

RCT_EXTERN_METHOD(recognizeOnce:(NSString *)languageCode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
