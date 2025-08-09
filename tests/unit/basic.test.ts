/**
 * 기본 테스트 - 테스트 환경 검증용
 */

describe('Basic Tests', () => {
  it('should run basic tests', () => {
    expect(true).toBe(true);
  });

  it('should have correct environment', () => {
    expect(process.env['NODE_ENV']).toBe('test');
  });

  it('should handle simple calculations', () => {
    expect(2 + 2).toBe(4);
    expect('hello'.length).toBe(5);
  });

  it('should work with arrays', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
  });

  it('should work with objects', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj.name).toBe('test');
    expect(obj).toHaveProperty('value', 42);
  });
});