#import "DatalakeVision.h"
#import <React/RCTLog.h>

// Declare the external Rust C FFI function
extern "C" int datalake_vision_init();

@implementation DatalakeVision

RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(initializeEngine:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        int result = datalake_vision_init();
        if (result == 1) {
            resolve(@(YES));
        } else {
            reject(@"INIT_ERROR", @"Failed to initialize Rust memory arena.", nil);
        }
    } @catch (NSException *exception) {
        reject(@"INIT_ERROR", exception.reason, nil);
    }
}

@end
