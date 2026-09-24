// A TypeScript module for test/ts-hooks.test.js: a type-only import, an interface and annotations, all of which the
// load hook strips, and a function reporting the line it runs on.
import type { Vec3 } from 'vec3'

interface Pair { a: number, b: number }

export function sum (pair: Pair): number {
  return pair.a + pair.b
}

export function lineHere (): number {
  return Number(/:(\d+):\d+\)?$/.exec(new Error('probe').stack!.split('\n')[1]!)![1])
}

export type Point = Vec3
