export default {
  getString: jest.fn().mockResolvedValue(''),
  setString: jest.fn().mockResolvedValue(undefined),
  hasString: jest.fn().mockResolvedValue(false),
  hasURL: jest.fn().mockResolvedValue(false),
  hasImage: jest.fn().mockResolvedValue(false),
  getImage: jest.fn().mockResolvedValue(null),
  setImage: jest.fn().mockResolvedValue(undefined),
  getURL: jest.fn().mockResolvedValue(''),
  setURL: jest.fn().mockResolvedValue(undefined),
  addListener: jest.fn(),
  removeListeners: jest.fn()
};
