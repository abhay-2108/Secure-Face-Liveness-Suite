module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|webp|svg|ttf|otf)$': '<rootDir>/__mocks__/fileMock.js',
  },
};
