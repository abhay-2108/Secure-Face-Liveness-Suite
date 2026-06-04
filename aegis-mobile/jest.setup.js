jest.mock('react-native-vision-camera', () => ({
  Camera: (props) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, props);
  },
  useCameraDevice: () => ({ id: 'test-camera', position: 'front' }),
  useCameraPermission: () => ({
    hasPermission: true,
    requestPermission: jest.fn(() => Promise.resolve(true)),
  }),
  useFrameProcessor: (processor) => processor,
  VisionCameraProxy: {
    initFrameProcessorPlugin: () => ({
      call: jest.fn(() => null),
    }),
  },
}));

jest.mock('react-native-worklets-core', () => ({
  useSharedValue: (initialValue) => ({ value: initialValue }),
  Worklets: {
    createRunOnJS: (fn) => fn,
  },
}));

jest.mock('react-native-open-face', () => ({
  OpenFace: {
    isInitialized: false,
    initialize: jest.fn(() => Promise.resolve({ success: true })),
    getMetrics: jest.fn(() => Promise.resolve({
      arenaLockedMb: 40,
      modelSizeMb: 0,
      hnswLatencyMs: 0,
      inferenceLatencyMs: 0,
      detectionLatencyMs: 0,
      livenessLatencyMs: 0,
      recognitionLatencyMs: 0,
      preprocessLatencyMs: 0,
      syncStatus: 'offline',
      indexSize: 0,
    })),
    enrollIdentity: jest.fn(() => Promise.resolve({ success: true, identityId: 'test-id' })),
    shutdown: jest.fn(() => Promise.resolve()),
    triggerSync: jest.fn(),
  },
}));
