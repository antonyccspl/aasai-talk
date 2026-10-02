#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(CallSounds, NSObject)
RCT_EXTERN_METHOD(start:(NSString *)key
                  incoming:(BOOL)incoming
                  speaker:(BOOL)speaker
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stop:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end