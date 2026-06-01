#import "OpenFace.h"
#import <React/RCTLog.h>

// Declare the external Rust C FFI functions
extern "C" {
    int   open_face_init();
    char* open_face_initialize(const char* config_json);
    char* open_face_search_identity(const char* embedding_json);
    char* open_face_enroll_identity(const char* label, const char* embedding_json);
    char* open_face_get_sync_status();
    char* open_face_get_metrics();
    char* open_face_force_purge();
    void  open_face_trigger_sync();
    void  open_face_shutdown();
    void  open_face_free_string(char* s);
}

// Helper: Convert Rust C string to NSString and free it
static NSString* rustStringToNSString(char* rust_str) {
    if (rust_str == NULL) {
        return @"{\"success\":false,\"error\":\"Null result from engine\"}";
    }
    NSString* result = [NSString stringWithUTF8String:rust_str];
    open_face_free_string(rust_str);
    return result;
}

@implementation OpenFace

RCT_EXPORT_MODULE()

// initialize(configJson: string): Promise<string>
RCT_EXPORT_METHOD(initialize:(NSString *)configJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        const char* config = [configJson UTF8String];
        char* result = open_face_initialize(config);
        resolve(rustStringToNSString(result));
    } @catch (NSException *exception) {
        reject(@"INIT_ERROR", exception.reason, nil);
    }
}

// searchIdentity(embeddingJson: string): Promise<string>
RCT_EXPORT_METHOD(searchIdentity:(NSString *)embeddingJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        const char* embedding = [embeddingJson UTF8String];
        char* result = open_face_search_identity(embedding);
        resolve(rustStringToNSString(result));
    } @catch (NSException *exception) {
        reject(@"SEARCH_ERROR", exception.reason, nil);
    }
}

// enrollIdentity(label: string, embeddingJson: string): Promise<string>
RCT_EXPORT_METHOD(enrollIdentity:(NSString *)label
                  embeddingJson:(NSString *)embeddingJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        const char* labelStr = [label UTF8String];
        const char* embedding = [embeddingJson UTF8String];
        char* result = open_face_enroll_identity(labelStr, embedding);
        resolve(rustStringToNSString(result));
    } @catch (NSException *exception) {
        reject(@"ENROLL_ERROR", exception.reason, nil);
    }
}

// getSyncStatus(): Promise<string>
RCT_EXPORT_METHOD(getSyncStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        char* result = open_face_get_sync_status();
        resolve(rustStringToNSString(result));
    } @catch (NSException *exception) {
        reject(@"SYNC_STATUS_ERROR", exception.reason, nil);
    }
}

// getMetrics(): Promise<string>
RCT_EXPORT_METHOD(getMetrics:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        char* result = open_face_get_metrics();
        resolve(rustStringToNSString(result));
    } @catch (NSException *exception) {
        reject(@"METRICS_ERROR", exception.reason, nil);
    }
}

// forcePurge(): Promise<string>
RCT_EXPORT_METHOD(forcePurge:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        char* result = open_face_force_purge();
        resolve(rustStringToNSString(result));
    } @catch (NSException *exception) {
        reject(@"PURGE_ERROR", exception.reason, nil);
    }
}

// triggerSync(): Promise<void>
RCT_EXPORT_METHOD(triggerSync:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        open_face_trigger_sync();
        resolve(nil);
    } @catch (NSException *exception) {
        reject(@"SYNC_ERROR", exception.reason, nil);
    }
}

// shutdown(): Promise<void>
RCT_EXPORT_METHOD(shutdown:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        open_face_shutdown();
        resolve(nil);
    } @catch (NSException *exception) {
        reject(@"SHUTDOWN_ERROR", exception.reason, nil);
    }
}

// Legacy: initializeEngine — kept for backward compatibility
RCT_EXPORT_METHOD(initializeEngine:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        int result = open_face_init();
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
