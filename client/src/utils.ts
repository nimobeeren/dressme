type Primitive = string | number | boolean | null | undefined;

type DeepCamelCase<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
    ? Array<DeepCamelCase<U>>
    : T extends Record<string, any>
      ? { [K in keyof T as CamelCase<K & string>]: DeepCamelCase<T[K]> }
      : T;

type CamelCase<S extends string> = S extends `${infer P}_${infer Rest}`
  ? `${P}${Capitalize<CamelCase<Rest>>}`
  : S;

/**
 * Changes all object keys from snake_case to camelCase. Deals with nested objects and arrays as you
 * would expect.
 */
export function nestedSnakeToCamelCase<T>(input: T): DeepCamelCase<T> {
  if (Array.isArray(input)) {
    return input.map((item) => nestedSnakeToCamelCase(item)) as DeepCamelCase<T>;
  } else if (input && typeof input === "object") {
    return Object.keys(input).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()) as keyof T;
      (acc as any)[camelKey] = nestedSnakeToCamelCase((input as any)[key]);
      return acc;
    }, {} as any);
  }
  return input as DeepCamelCase<T>;
}
