import { replaceBigInts as replaceBigIntsBase } from "ponder";

export function replaceBigInts<T>(value: T) {
  return replaceBigIntsBase(value, (x) => `${String(x)}n`);
}

export function replaceBigIntStringsToBigInts<T>(value: T) {
  const isBigIntString = (s: string) => /^-?\d+n$/.test(s);

  const convert = (val: unknown): unknown => {
    if (typeof val === "string") {
      return isBigIntString(val) ? BigInt(val.slice(0, -1)) : val;
    }

    if (Array.isArray(val)) {
      return val.map((item) => convert(item));
    }

    if (val !== null && typeof val === "object") {
      const entries = Object.entries(val as Record<string, unknown>).map(
        ([key, v]) => [key, convert(v)]
      );
      return Object.fromEntries(entries);
    }

    return val;
  };

  return convert(value) as T;
}
