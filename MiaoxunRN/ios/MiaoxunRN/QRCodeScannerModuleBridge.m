#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

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

@interface RCT_EXTERN_MODULE(MiaoxunSpeechModule, RCTEventEmitter)

RCT_EXTERN_METHOD(recognize:(NSString *)requestId
                  languageCode:(NSString *)languageCode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(prepare:(NSString *)requestId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(finish:(NSString *)requestId)
RCT_EXTERN_METHOD(cancel:(NSString *)requestId)

@end
