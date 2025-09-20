/**
 * Redis serialization utilities for handling complex objects including Date objects
 */

export interface ISerializer {
  serialize<T>(value: T): string;
  deserialize<T>(value: string): T;
}

/**
 * RedisSerializer handles serialization and deserialization of complex objects
 * with special handling for Date objects and nested structures
 */
export class RedisSerializer implements ISerializer {
  private static readonly DATE_PREFIX = '__DATE__:';
  
  /**
   * Serializes a value to a JSON string with Date object handling
   * @param value The value to serialize
   * @returns JSON string representation
   */
  serialize<T>(value: T): string {
    // Pre-process the value to handle Date objects before JSON.stringify
    const processedValue = this.preprocessDates(value);
    return JSON.stringify(processedValue);
  }
  
  /**
   * Deserializes a JSON string back to its original form with Date object restoration
   * @param value The JSON string to deserialize
   * @returns The deserialized object
   */
  deserialize<T>(value: string): T {
    return JSON.parse(value, this.dateReviver);
  }
  
  /**
   * Recursively processes an object to convert Date objects to special string format
   * @param obj The object to process
   * @returns The processed object with Date objects converted
   */
  private preprocessDates(obj: any): any {
    if (obj instanceof Date) {
      // Handle invalid dates by preserving them as invalid Date objects
      if (isNaN(obj.getTime())) {
        return RedisSerializer.DATE_PREFIX + 'Invalid Date';
      }
      return RedisSerializer.DATE_PREFIX + obj.toISOString();
    }
    
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.preprocessDates(item));
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.preprocessDates(value);
    }
    
    return result;
  }
  
  /**
   * JSON reviver function that converts special Date strings back to Date objects
   * @param key The property key
   * @param value The property value
   * @returns The transformed value
   */
  private dateReviver = (key: string, value: any): any => {
    if (typeof value === 'string' && value.startsWith(RedisSerializer.DATE_PREFIX)) {
      const dateString = value.substring(RedisSerializer.DATE_PREFIX.length);
      if (dateString === 'Invalid Date') {
        return new Date('invalid');
      }
      return new Date(dateString);
    }
    return value;
  }
}

/**
 * Default serializer instance for use throughout the application
 */
export const defaultSerializer = new RedisSerializer();