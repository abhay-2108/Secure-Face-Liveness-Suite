#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import <VisionCamera/Frame.h>

// Declare the external Rust FFI functions
extern "C" {
    int datalake_vision_init();
    char* datalake_vision_process_frame(uint8_t* yuv_data, int width, int height, int stride);
    void datalake_vision_free_string(char* s);
}

@interface DatalakeVisionPlugin : FrameProcessorPlugin
@end

@implementation DatalakeVisionPlugin

- (instancetype)init {
  self = [super init];
  if (self) {
    // Ensure the Rust Memory Arena is initialized
    datalake_vision_init();
  }
  return self;
}

- (id)callback:(Frame *)frame withArguments:(NSDictionary *)arguments {
    CMSampleBufferRef buffer = frame.buffer;
    CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(buffer);
    
    if (CVPixelBufferGetPixelFormatType(imageBuffer) != kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange &&
        CVPixelBufferGetPixelFormatType(imageBuffer) != kCVPixelFormatType_420YpCbCr8BiPlanarFullRange) {
        return @"{\"error\": \"Only YUV format supported\"}";
    }

    CVPixelBufferLockBaseAddress(imageBuffer, 0);
    
    // Get the Y plane (Luminance) for Zero-Copy passing to Rust
    uint8_t *y_plane = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(imageBuffer, 0);
    int width = (int)CVPixelBufferGetWidthOfPlane(imageBuffer, 0);
    int height = (int)CVPixelBufferGetHeightOfPlane(imageBuffer, 0);
    int stride = (int)CVPixelBufferGetBytesPerRowOfPlane(imageBuffer, 0);

    // Call the Rust Edge Engine
    char* result_c_str = datalake_vision_process_frame(y_plane, width, height, stride);
    
    CVPixelBufferUnlockBaseAddress(imageBuffer, 0);
    
    if (result_c_str == NULL) {
        return @"{\"error\": \"Rust engine failure\"}";
    }
    
    NSString *result = [NSString stringWithUTF8String:result_c_str];
    
    // Free the C-string allocated by Rust
    datalake_vision_free_string(result_c_str);
    
    return result;
}

VISION_EXPORT_FRAME_PROCESSOR(DatalakeVisionPlugin, processDatalakeVision)

@end
