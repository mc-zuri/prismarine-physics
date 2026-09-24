// An axis-aligned box. The methods do plain double arithmetic; callers that keep a float32 box round the corners
// themselves.

// Any object with box corners.
export interface BoxLike {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

// An axis-aligned box: two corners, and the few operations the collision needs.
export class Box implements BoxLike {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number

  constructor (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    this.minX = minX
    this.minY = minY
    this.minZ = minZ
    this.maxX = maxX
    this.maxY = maxY
    this.maxZ = maxZ
  }

  static from (box: BoxLike): Box {
    return new Box(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ)
  }

  clone (): Box {
    return Box.from(this)
  }

  // Grows the box towards the motion: a negative component moves the min face, a positive one the max face.
  extend (dx: number, dy: number, dz: number): this {
    if (dx < 0) this.minX += dx
    else this.maxX += dx
    if (dy < 0) this.minY += dy
    else this.maxY += dy
    if (dz < 0) this.minZ += dz
    else this.maxZ += dz
    return this
  }

  offset (dx: number, dy: number, dz: number): this {
    this.minX += dx
    this.minY += dy
    this.minZ += dz
    this.maxX += dx
    this.maxY += dy
    this.maxZ += dz
    return this
  }

  // A strict overlap on all three axes (touching faces do not intersect).
  intersects (other: BoxLike): boolean {
    return this.minX < other.maxX && this.maxX > other.minX &&
      this.minY < other.maxY && this.maxY > other.minY &&
      this.minZ < other.maxZ && this.maxZ > other.minZ
  }
}
