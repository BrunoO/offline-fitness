import {
  storeIntValue,
  retrieveIntValue,
  storeValue,
  retrieveValue,
  storeStringValue,
  retrieveStringValue,
  storeMultiActivities,
  storeActivity,
  removeActivity,
  getAllActivitiesKeys,
  loadAllActivities,
  removeAllActivities,
  removeAppKeys
} from '@/shared/services/storage';
import { Activity } from '@/shared/types/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants';

import { simpleLogger } from '@/shared/services/SimpleLogger';

// Mock AsyncStorage & SimpleLogger
jest.mock('@/shared/services/SimpleLogger');
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  multiSet: jest.fn(),
  multiGet: jest.fn(),
  getAllKeys: jest.fn(),
  multiRemove: jest.fn(),
  removeItem: jest.fn()
}));

const mockedSimpleLogger = simpleLogger as jest.Mocked<typeof simpleLogger>;

describe('storage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('storeIntValue and retrieveIntValue', () => {
    it('should store and retrieve an integer value', async () => {
      const key = 'test_int_key';
      const value = 123;

      await storeIntValue(key, value);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(key, JSON.stringify(value));

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(value));
      const retrievedValue = await retrieveIntValue(key);
      expect(retrievedValue).toBe(value);
    });

    it('should return 0 for retrieveIntValue if key does not exist', async () => {
      const key = 'non_existent_key';
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const retrievedValue = await retrieveIntValue(key);
      expect(retrievedValue).toBe(0);
    });

    it('should log an error if storing an int value fails', async () => {
      const key = 'test_int_key';
      const value = 123;
      const error = new Error('Storage failed');
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(error);

      await storeIntValue(key, value);

      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR saving key ${key} ${error}`);
    });

    it('should log an error and return 0 if retrieving an int value fails', async () => {
      const key = 'test_int_key';
      const error = new Error('Storage failed');
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(error);

      const result = await retrieveIntValue(key);

      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR retrieving key ${key}${error}`);
      expect(result).toBe(0);
    });
  });

  describe('storeValue and retrieveValue', () => {
    type StoreKey = Parameters<typeof storeValue>[0];
    type StoreVal = Parameters<typeof storeValue>[1];

    it('should store and retrieve an object value', async () => {
      const key = 'test_obj_key';
      const value = { a: 1, b: 'test' };

      await storeValue(key as unknown as StoreKey, value as unknown as StoreVal);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(key, JSON.stringify(value));

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(value));
      const retrievedValue = await retrieveValue(key as unknown as StoreKey);
      expect(retrievedValue).toEqual(value);
    });

    it('should return undefined for retrieveValue if key does not exist', async () => {
      const key = 'non_existent_key';
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const retrievedValue = await retrieveValue(key as unknown as StoreKey);
      expect(retrievedValue).toBe(undefined);
    });

    it('should log an error if storing a value fails', async () => {
      const key = 'test_obj_key';
      const value = { a: 1 };
      const error = new Error('Storage failed');
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(error);

      await storeValue(key as unknown as StoreKey, value as unknown as StoreVal);

      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR saving key ${key} ${error}`);
    });

    it('should log an error and return undefined if retrieving a value fails', async () => {
      const key = 'test_obj_key';
      const error = new Error('Storage failed');
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(error);

      const result = await retrieveValue(key as unknown as StoreKey);

      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR retrieving key ${key} ${error}`);
      expect(result).toBe(undefined);
    });
  });

  describe('storeStringValue and retrieveStringValue', () => {
    it('should store and retrieve a string value', async () => {
      const key = 'test_str_key';
      const value = 'hello world';

      await storeStringValue(key, value);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(key, JSON.stringify(value));

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(value));
      const retrievedValue = await retrieveStringValue(key);
      expect(retrievedValue).toBe(value);
    });

    it('should return "" for retrieveStringValue if key does not exist', async () => {
      const key = 'non_existent_key';
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const retrievedValue = await retrieveStringValue(key);
      expect(retrievedValue).toBe('');
    });

    it('should log an error if storing a string value fails', async () => {
      const key = 'test_str_key';
      const value = 'hello';
      const error = new Error('Storage failed');
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(error);

      await storeStringValue(key, value);

      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR saving key ${key} ${error}`);
    });

    it('should log an error and return "" if retrieving a string value fails', async () => {
      const key = 'test_str_key';
      const error = new Error('Storage failed');
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(error);

      const result = await retrieveStringValue(key);

      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR retrieving key ${key} ${error}`);
      expect(result).toBe('');
    });
  });

  describe('activity storage', () => {
    const activity1 = { id: '1', name: 'Morning Run' } as unknown as Activity;
    const activity2 = { id: '2', name: 'Evening Walk' } as unknown as Activity;
    const activityKey1 = `${STORAGE_KEYS.ACTIVITY_PREFIX}1`;
    const activityKey2 = `${STORAGE_KEYS.ACTIVITY_PREFIX}2`;

    it('should store multiple activities', async () => {
      const activities = [activity1, activity2];
      await storeMultiActivities(activities);
      expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
        [activityKey1, JSON.stringify(activity1)],
        [activityKey2, JSON.stringify(activity2)]
      ]);
    });

    it('should store a single activity', async () => {
      await storeActivity(activity1);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(activityKey1, JSON.stringify(activity1));
    });

    it('should remove a single activity', async () => {
      await removeActivity(activity1);
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(activityKey1);
    });

    it('should get all activity keys', async () => {
      const allKeys = [activityKey1, activityKey2, 'some_other_key'];
      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(allKeys);
      const activityKeys = await getAllActivitiesKeys();
      expect(activityKeys).toEqual([activityKey1, activityKey2]);
    });

    it('should load all activities', async () => {
      const activities = [activity1, activity2];
      const activityEntries: [string, string][] = [
        [activityKey1, JSON.stringify(activity1)],
        [activityKey2, JSON.stringify(activity2)]
      ];
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue(activityEntries);

      const loadedActivities = await loadAllActivities([activityKey1, activityKey2]);
      expect(loadedActivities).toEqual(activities);
    });

    it('should handle swim activities when loading', async () => {
      const swimActivity = { id: '3', type: 'Swim', elapsed_time: 1000, moving_time: 0 };
      const swimActivityKey = `${STORAGE_KEYS.ACTIVITY_PREFIX}3`;
      const activityEntries: [string, string][] = [[swimActivityKey, JSON.stringify(swimActivity)]];
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue(activityEntries);

      const loadedActivities = await loadAllActivities([swimActivityKey]);
      expect(loadedActivities[0].moving_time).toBe(swimActivity.elapsed_time);
    });

    it('should remove all activities', async () => {
      const allKeys = [activityKey1, activityKey2, 'some_other_key'];
      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(allKeys);
      await removeAllActivities();
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([activityKey1, activityKey2]);
    });

    it('should log an error if multiSet fails', async () => {
      const activities = [activity1, activity2];
      const error = new Error('Storage failed');
      (AsyncStorage.multiSet as jest.Mock).mockRejectedValue(error);
      await storeMultiActivities(activities);
      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR saving activities ${error}`);
    });

    it('should log an error if setItem fails for a single activity', async () => {
      const error = new Error('Storage failed');
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(error);
      await storeActivity(activity1);
      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR saving activity ${error}`);
    });

    it('should log an error if removeItem fails', async () => {
      const error = new Error('Storage failed');
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValue(error);
      await removeActivity(activity1);
      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR removing activity ${error}`);
    });

    it('should log an error and return an empty array if getAllKeys fails', async () => {
      const error = new Error('Storage failed');
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(error);
      const result = await getAllActivitiesKeys();
      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(`ERROR getting keys ${error}`);
      expect(result).toEqual([]);
    });

    it('should log an error and return an empty array if multiGet fails', async () => {
      const error = new Error('Storage failed');
      (AsyncStorage.multiGet as jest.Mock).mockRejectedValue(error);
      const result = await loadAllActivities([activityKey1]);
      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(
        `ERROR loading all activities ${error}`
      );
      expect(result).toEqual([]);
    });

    it('should log an error if removeAllActivities fails', async () => {
      const error = new Error('Storage failed');
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(error);
      await removeAllActivities();
      expect(mockedSimpleLogger.error).toHaveBeenCalledWith(
        'error while removing activities ',
        error
      );
    });
  });

  describe('removeAppKeys', () => {
    it('should remove all keys', async () => {
      const allKeys = ['key1', 'key2', 'key3'];
      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(allKeys);
      await removeAppKeys();
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(allKeys);
    });

    it('should log an error if removeAppKeys fails', async () => {
      const error = new Error('Storage failed');
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(error);
      await removeAppKeys();
      expect(mockedSimpleLogger.error).toHaveBeenCalledWith('error while removing keys ', error);
    });
  });

});
