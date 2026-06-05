import { useState, useCallback, useRef } from 'react';
import { useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';
import { useSharedValue, Worklets } from 'react-native-worklets-core';
import type { FrameResult } from 'react-native-open-face';

type OnFrameProcessed = (result: FrameResult) => void;

export function useFaceCamera(onFrameProcessed: OnFrameProcessed) {
  // Shared values for worklets
  const flashState = useSharedValue(0); // 0=none, 1=dark, 2=lit
  const isBackCamera = useSharedValue(0);
  const processorActive = useSharedValue(0); // 0=off, 1=on. Controls the ML worklet pipeline.

  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');

  // To prevent React state updates from thrashing the JS thread,
  // we can optionally throttle the callback.
  const lastStateUpdateRef = useRef(Date.now());
  const stableFramesCountRef = useRef(0);

  const toggleCamera = useCallback(() => {
    const newVal = isBackCamera.value === 0 ? 1 : 0;
    isBackCamera.value = newVal;
    setCameraPosition(newVal === 0 ? 'front' : 'back');
  }, [isBackCamera]);

  const handleFrameResultJS = Worklets.createRunOnJS((resultStr: string) => {
    try {
      const result: FrameResult = JSON.parse(resultStr);
      onFrameProcessed(result);
    } catch {
      // Ignored malformed JSON
    }
  });

  const plugin = VisionCameraProxy.initFrameProcessorPlugin('processOpenFace', {});

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    // Physically sever the camera feed if the processor is inactive
    // This prevents segfaults during init and thermal crashes post-success
    if (processorActive.value === 0) return;

    const effectiveFlash = isBackCamera.value === 1 ? -1 : flashState.value;
    let resultStr: string | undefined;

    // @ts-ignore
    if (global.processOpenFace) {
      // @ts-ignore
      resultStr = global.processOpenFace(frame, { flashState: effectiveFlash, orientation: frame.orientation });
    } else if (plugin) {
      resultStr = plugin.call(frame, { flashState: effectiveFlash, orientation: frame.orientation }) as string | undefined;
    }

    if (resultStr && typeof resultStr === 'string') {
      handleFrameResultJS(resultStr);
    }
  }, [handleFrameResultJS, plugin]);

  return {
    cameraPosition,
    toggleCamera,
    frameProcessor,
    flashState,
    processorActive,
  };
}
