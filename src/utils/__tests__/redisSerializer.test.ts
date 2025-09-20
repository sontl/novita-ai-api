import { RedisSerializer, defaultSerializer } from '../redisSerializer';

describe('RedisSerializer', () => {
  let serializer: RedisSerializer;

  beforeEach(() => {
    serializer = new RedisSerializer();
  });

  describe('serialize', () => {
    it('should serialize simple primitive values', () => {
      expect(serializer.serialize('hello')).toBe('"hello"');
      expect(serializer.serialize(42)).toBe('42');
      expect(serializer.serialize(true)).toBe('true');
      expect(serializer.serialize(null)).toBe('null');
    });

    it('should serialize simple objects', () => {
      const obj = { name: 'test', value: 123 };
      const serialized = serializer.serialize(obj);
      expect(serialized).toBe('{"name":"test","value":123}');
    });

    it('should serialize arrays', () => {
      const arr = [1, 'two', true, null];
      const serialized = serializer.serialize(arr);
      expect(serialized).toBe('[1,"two",true,null]');
    });

    it('should serialize Date objects with special prefix', () => {
      const date = new Date('2023-12-01T10:30:00.000Z');
      const serialized = serializer.serialize(date);
      expect(serialized).toBe('"__DATE__:2023-12-01T10:30:00.000Z"');
    });

    it('should serialize objects containing Date objects', () => {
      const obj = {
        id: 'test-id',
        createdAt: new Date('2023-12-01T10:30:00.000Z'),
        updatedAt: new Date('2023-12-01T11:30:00.000Z'),
        name: 'Test Object'
      };
      
      const serialized = serializer.serialize(obj);
      const expected = JSON.stringify({
        id: 'test-id',
        createdAt: '__DATE__:2023-12-01T10:30:00.000Z',
        updatedAt: '__DATE__:2023-12-01T11:30:00.000Z',
        name: 'Test Object'
      });
      
      expect(serialized).toBe(expected);
    });

    it('should serialize nested objects with Date objects', () => {
      const obj = {
        user: {
          id: 'user-1',
          profile: {
            createdAt: new Date('2023-12-01T10:30:00.000Z'),
            lastLogin: new Date('2023-12-01T11:30:00.000Z')
          }
        },
        metadata: {
          timestamp: new Date('2023-12-01T12:30:00.000Z')
        }
      };
      
      const serialized = serializer.serialize(obj);
      expect(serialized).toContain('__DATE__:2023-12-01T10:30:00.000Z');
      expect(serialized).toContain('__DATE__:2023-12-01T11:30:00.000Z');
      expect(serialized).toContain('__DATE__:2023-12-01T12:30:00.000Z');
    });

    it('should serialize arrays containing Date objects', () => {
      const arr = [
        new Date('2023-12-01T10:30:00.000Z'),
        'string',
        { date: new Date('2023-12-01T11:30:00.000Z') }
      ];
      
      const serialized = serializer.serialize(arr);
      expect(serialized).toContain('__DATE__:2023-12-01T10:30:00.000Z');
      expect(serialized).toContain('__DATE__:2023-12-01T11:30:00.000Z');
    });
  });

  describe('deserialize', () => {
    it('should deserialize simple primitive values', () => {
      expect(serializer.deserialize('"hello"')).toBe('hello');
      expect(serializer.deserialize('42')).toBe(42);
      expect(serializer.deserialize('true')).toBe(true);
      expect(serializer.deserialize('null')).toBe(null);
    });

    it('should deserialize simple objects', () => {
      const serialized = '{"name":"test","value":123}';
      const deserialized = serializer.deserialize(serialized);
      expect(deserialized).toEqual({ name: 'test', value: 123 });
    });

    it('should deserialize arrays', () => {
      const serialized = '[1,"two",true,null]';
      const deserialized = serializer.deserialize(serialized);
      expect(deserialized).toEqual([1, 'two', true, null]);
    });

    it('should deserialize Date objects from special prefix', () => {
      const serialized = '"__DATE__:2023-12-01T10:30:00.000Z"';
      const deserialized = serializer.deserialize<Date>(serialized);
      expect(deserialized).toBeInstanceOf(Date);
      expect(deserialized.toISOString()).toBe('2023-12-01T10:30:00.000Z');
    });

    it('should deserialize objects containing Date objects', () => {
      const serialized = JSON.stringify({
        id: 'test-id',
        createdAt: '__DATE__:2023-12-01T10:30:00.000Z',
        updatedAt: '__DATE__:2023-12-01T11:30:00.000Z',
        name: 'Test Object'
      });
      
      const deserialized = serializer.deserialize<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
      }>(serialized);
      expect(deserialized.id).toBe('test-id');
      expect(deserialized.name).toBe('Test Object');
      expect(deserialized.createdAt).toBeInstanceOf(Date);
      expect(deserialized.updatedAt).toBeInstanceOf(Date);
      expect(deserialized.createdAt.toISOString()).toBe('2023-12-01T10:30:00.000Z');
      expect(deserialized.updatedAt.toISOString()).toBe('2023-12-01T11:30:00.000Z');
    });

    it('should deserialize nested objects with Date objects', () => {
      const obj = {
        user: {
          id: 'user-1',
          profile: {
            createdAt: '__DATE__:2023-12-01T10:30:00.000Z',
            lastLogin: '__DATE__:2023-12-01T11:30:00.000Z'
          }
        },
        metadata: {
          timestamp: '__DATE__:2023-12-01T12:30:00.000Z'
        }
      };
      
      const serialized = JSON.stringify(obj);
      const deserialized = serializer.deserialize<{
        user: {
          id: string;
          profile: {
            createdAt: Date;
            lastLogin: Date;
          };
        };
        metadata: {
          timestamp: Date;
        };
      }>(serialized);
      
      expect(deserialized.user.profile.createdAt).toBeInstanceOf(Date);
      expect(deserialized.user.profile.lastLogin).toBeInstanceOf(Date);
      expect(deserialized.metadata.timestamp).toBeInstanceOf(Date);
      expect(deserialized.user.profile.createdAt.toISOString()).toBe('2023-12-01T10:30:00.000Z');
    });

    it('should not transform strings that contain DATE prefix but are not at the start', () => {
      const obj = {
        message: 'This contains __DATE__:2023-12-01T10:30:00.000Z in the middle',
        prefix: 'prefix__DATE__:2023-12-01T10:30:00.000Z'
      };
      
      const serialized = JSON.stringify(obj);
      const deserialized = serializer.deserialize<{
        message: string;
        prefix: string;
      }>(serialized);
      
      expect(typeof deserialized.message).toBe('string');
      expect(typeof deserialized.prefix).toBe('string');
      expect(deserialized.message).toBe('This contains __DATE__:2023-12-01T10:30:00.000Z in the middle');
    });
  });

  describe('round-trip serialization', () => {
    it('should maintain data integrity for complex objects with Dates', () => {
      const originalObj = {
        id: 'test-123',
        name: 'Complex Object',
        createdAt: new Date('2023-12-01T10:30:00.000Z'),
        metadata: {
          lastModified: new Date('2023-12-01T11:30:00.000Z'),
          tags: ['tag1', 'tag2'],
          config: {
            enabled: true,
            timeout: 5000,
            scheduledAt: new Date('2023-12-01T12:30:00.000Z')
          }
        },
        items: [
          { id: 1, timestamp: new Date('2023-12-01T13:30:00.000Z') },
          { id: 2, timestamp: new Date('2023-12-01T14:30:00.000Z') }
        ]
      };
      
      const serialized = serializer.serialize(originalObj);
      const deserialized = serializer.deserialize<typeof originalObj>(serialized);
      
      expect(deserialized.id).toBe(originalObj.id);
      expect(deserialized.name).toBe(originalObj.name);
      expect(deserialized.createdAt).toBeInstanceOf(Date);
      expect(deserialized.createdAt.getTime()).toBe(originalObj.createdAt.getTime());
      expect(deserialized.metadata.lastModified).toBeInstanceOf(Date);
      expect(deserialized.metadata.config.scheduledAt).toBeInstanceOf(Date);
      expect(deserialized.items[0]?.timestamp).toBeInstanceOf(Date);
      expect(deserialized.items[1]?.timestamp).toBeInstanceOf(Date);
    });

    it('should handle edge cases with Date objects', () => {
      const originalObj = {
        validDate: new Date('2023-12-01T10:30:00.000Z'),
        invalidDate: new Date('invalid'),
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        dateString: '2023-12-01T10:30:00.000Z'
      };
      
      const serialized = serializer.serialize(originalObj);
      const deserialized = serializer.deserialize<typeof originalObj>(serialized);
      
      expect(deserialized.validDate).toBeInstanceOf(Date);
      expect(deserialized.invalidDate).toBeInstanceOf(Date);
      expect(isNaN(deserialized.invalidDate.getTime())).toBe(true);
      expect(deserialized.nullValue).toBe(null);
      expect(deserialized.undefinedValue).toBeUndefined();
      expect(deserialized.emptyString).toBe('');
      expect(typeof deserialized.dateString).toBe('string');
    });
  });

  describe('defaultSerializer', () => {
    it('should export a default serializer instance', () => {
      expect(defaultSerializer).toBeInstanceOf(RedisSerializer);
    });

    it('should work the same as a new instance', () => {
      const obj = { date: new Date('2023-12-01T10:30:00.000Z'), value: 'test' };
      
      const serialized1 = serializer.serialize(obj);
      const serialized2 = defaultSerializer.serialize(obj);
      
      expect(serialized1).toBe(serialized2);
      
      const deserialized1 = serializer.deserialize(serialized1);
      const deserialized2 = defaultSerializer.deserialize(serialized2);
      
      expect(deserialized1).toEqual(deserialized2);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid JSON during deserialization', () => {
      expect(() => {
        serializer.deserialize('invalid json');
      }).toThrow();
    });

    it('should handle circular references gracefully during serialization', () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Create circular reference
      
      expect(() => {
        serializer.serialize(obj);
      }).toThrow();
    });
  });
});