const { Vec3 } = require('vec3')
const AABB = require('./aabb')
const math = require('./math')

// The tick of a boat the client controls (Boat.tick, from 1.21.2 AbstractBoat.tick): its status, the float, the paddles
// from its rider's keys, the move. `ctx` holds the physics' collision and fluid helpers.
module.exports = function boatPhysics (ctx) {
  const { mcData, getSurroundingBBs, collideAxes, isWaterBlock, getRenderedDepth, waterLike, blockSlipperiness, flags } = ctx
  const f = Math.fround
  const version = mcData.version
  // a boat is 1.375F by 0.5625F
  const HALF_WIDTH = 0.6875
  const HEIGHT = 0.5625
  // up to 1.20.4 the boat falls by -0.04F and floats by 0.06153846016296973 (0.04F / 0.65); from 1.20.5 by its
  // gravity, 0.04, and 0.04 / 0.65
  const gravityInFloat = version['<']('1.20.5')
  const GRAVITY = gravityInFloat ? f(0.04) : 0.04
  const BUOYANCY = gravityInFloat ? 0.06153846016296973 : 0.04 / 0.65
  // from 1.21.1 a boat that drops into water rises to its surface only when there is room
  const surfacingChecksRoom = version['>=']('1.21.1')
  // Mth.sin and Mth.cos take a double index from 1.21.11
  const sinIndexInDouble = version['>=']('1.21.11')
  const lilyPadIds = new Set(['lily_pad', 'waterlily'].filter(name => mcData.blocksByName[name]).map(name => mcData.blocksByName[name].id))

  function boxOf (boat) {
    if (boat.box) return boat.box
    const { x, y, z } = boat.pos
    return new AABB(x - HALF_WIDTH, y, z - HALF_WIDTH, x + HALF_WIDTH, y + HEIGHT, z + HALF_WIDTH)
  }

  // FluidState.getHeight for water: 1 under water of its own, else its amount over 9 (8 for a source and falling water)
  function waterHeight (world, x, y, z) {
    const block = world.getBlock(new Vec3(x, y, z))
    if (!isWaterBlock(block)) return null
    if (isWaterBlock(world.getBlock(new Vec3(x, y + 1, z)))) return 1
    return f((8 - getRenderedDepth(block)) / 9)
  }
  function isWaterSource (world, x, y, z) {
    const block = world.getBlock(new Vec3(x, y, z))
    return waterLike.has(block.type) || !!block.isWaterlogged || block.metadata === 0
  }

  // isUnderwater: water above the top of the box (0.001 up): under flowing water when any is not a source
  function underwaterStatus (boat, world) {
    const box = boxOf(boat)
    const top = box.maxY + 0.001
    let under = false
    for (let x = Math.floor(box.minX); x < Math.ceil(box.maxX); x++) {
      for (let y = Math.floor(box.maxY); y < Math.ceil(top); y++) {
        for (let z = Math.floor(box.minZ); z < Math.ceil(box.maxZ); z++) {
          const height = waterHeight(world, x, y, z)
          if (height !== null && top < f(y + height)) {
            if (!isWaterSource(world, x, y, z)) return 'under_flowing_water'
            under = true
          }
        }
      }
    }
    return under ? 'under_water' : null
  }

  // checkInWater: the highest water surface in the layer of the box's bottom (0.001 up), and whether the bottom is below it
  function checkInWater (boat, world) {
    const box = boxOf(boat)
    let inWater = false
    boat.waterLevel = -Number.MAX_VALUE
    for (let x = Math.floor(box.minX); x < Math.ceil(box.maxX); x++) {
      for (let y = Math.floor(box.minY); y < Math.ceil(box.minY + 0.001); y++) {
        for (let z = Math.floor(box.minZ); z < Math.ceil(box.maxZ); z++) {
          const height = waterHeight(world, x, y, z)
          if (height === null) continue
          const level = f(y + height)
          boat.waterLevel = Math.max(level, boat.waterLevel)
          inWater = inWater || box.minY < level
        }
      }
    }
    return inWater
  }

  // getGroundFriction: the mean friction of the blocks whose collision shapes reach the 0.001 under the box (not lily
  // pads), the corner columns and the top and bottom of the edge columns left out
  function groundFriction (boat, world) {
    const box = boxOf(boat)
    const under = new AABB(box.minX, box.minY - 0.001, box.minZ, box.maxX, box.minY, box.maxZ)
    const x0 = Math.floor(under.minX) - 1
    const x1 = Math.ceil(under.maxX) + 1
    const y0 = Math.floor(under.minY) - 1
    const y1 = Math.ceil(under.maxY) + 1
    const z0 = Math.floor(under.minZ) - 1
    const z1 = Math.ceil(under.maxZ) + 1
    let sum = 0
    let count = 0
    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        const edges = (x === x0 || x === x1 - 1 ? 1 : 0) + (z === z0 || z === z1 - 1 ? 1 : 0)
        if (edges === 2) continue
        for (let y = y0; y < y1; y++) {
          if (edges > 0 && (y === y0 || y === y1 - 1)) continue
          const block = world.getBlock(new Vec3(x, y, z))
          if (!block || lilyPadIds.has(block.type)) continue
          if (!block.shapes.some(([a, b, c, d, e, g]) => new AABB(a + x, b + y, c + z, d + x, e + y, g + z).intersects(under))) continue
          sum = f(sum + f(blockSlipperiness[block.type] ?? 0.6))
          count++
        }
      }
    }
    return f(sum / count)
  }

  // getWaterLevelAbove: the surface of the water over the box's top, from its layer up to where the last move came from
  function waterLevelAbove (boat, world) {
    const box = boxOf(boat)
    const y0 = Math.floor(box.maxY)
    const y1 = Math.ceil(box.maxY - boat.lastYd)
    for (let y = y0; y < y1; y++) {
      let height = 0
      for (let x = Math.floor(box.minX); x < Math.ceil(box.maxX) && height < 1; x++) {
        for (let z = Math.floor(box.minZ); z < Math.ceil(box.maxZ) && height < 1; z++) {
          const h = waterHeight(world, x, y, z)
          if (h !== null) height = Math.max(height, h)
        }
      }
      if (height < 1) return f(y + height)
    }
    return f(y1 + 1)
  }

  function statusOf (boat, world) {
    const under = underwaterStatus(boat, world)
    if (under) {
      boat.waterLevel = boxOf(boat).maxY
      return under
    }
    if (checkInWater(boat, world)) return 'in_water'
    const friction = groundFriction(boat, world)
    if (friction > 0) {
      boat.landFriction = friction
      return 'on_land'
    }
    return 'in_air'
  }

  function noCollision (world, box) {
    return !getSurroundingBBs(world, box).some(other => other.intersects(box))
  }

  // floatBoat
  function floatBoat (boat, world) {
    let gravity = -GRAVITY
    let buoyancy = 0
    let decay = f(0.05)
    if (boat.oldStatus === 'in_air' && boat.status !== 'in_air' && boat.status !== 'on_land') {
      boat.waterLevel = boat.pos.y + HEIGHT
      const y = f(waterLevelAbove(boat, world) - f(HEIGHT)) + 0.101
      const box = boxOf(boat).clone().offset(0, y - boat.pos.y, 0)
      if (!surfacingChecksRoom || noCollision(world, box)) {
        boat.pos.y = y
        if (boat.box) boat.box = box
        boat.vel.y = 0
        boat.lastYd = 0
      }
      boat.status = 'in_water'
      return
    }
    if (boat.status === 'in_water') {
      buoyancy = (boat.waterLevel - boat.pos.y) / HEIGHT
      decay = f(0.9)
    } else if (boat.status === 'under_flowing_water') {
      gravity = -7.0e-4
      decay = f(0.9)
    } else if (boat.status === 'under_water') {
      buoyancy = 0.009999999776482582
      decay = f(0.45)
    } else if (boat.status === 'in_air') {
      decay = f(0.9)
    } else if (boat.status === 'on_land') {
      decay = boat.landFriction
      if (boat.controlledByPlayer) boat.landFriction = f(boat.landFriction / 2)
    }
    boat.vel.x *= decay
    boat.vel.y += gravity
    boat.vel.z *= decay
    boat.deltaRotation = f(boat.deltaRotation * decay)
    if (buoyancy > 0) boat.vel.y = (boat.vel.y + buoyancy * BUOYANCY) * 0.75
  }

  // controlBoat: the rider's keys turn the boat by its rotation rate and paddle it
  function controlBoat (boat) {
    const { left, right, forward, back } = boat.controls
    let acceleration = 0
    if (left) boat.deltaRotation = f(boat.deltaRotation - 1)
    if (right) boat.deltaRotation = f(boat.deltaRotation + 1)
    if (right !== left && !forward && !back) acceleration = f(acceleration + f(0.005))
    boat.yaw = f(boat.yaw + boat.deltaRotation)
    if (forward) acceleration = f(acceleration + f(0.04))
    if (back) acceleration = f(acceleration - f(0.005))
    boat.vel.x += f(math.mthSin(f(-boat.yaw * f(0.017453292)), sinIndexInDouble) * acceleration)
    boat.vel.z += f(math.mthCos(f(boat.yaw * f(0.017453292)), sinIndexInDouble) * acceleration)
    boat.paddles = [(right && !left) || forward, (left && !right) || forward]
  }

  // Entity.move (MoverType.SELF) of the boat: no step, the blocks' collision boxes
  function moveBoat (boat, world) {
    const { x: dx, y: dy, z: dz } = boat.vel
    const box = boxOf(boat).clone()
    const boxes = getSurroundingBBs(world, box.clone().extend(dx, dy, dz))
    const before = box.clone()
    const moved = collideAxes(boxes, box, dx, dy, dz)
    // from 1.14 a move of 1.0E-7 or less squared is dropped, unless (from 1.21.2) nothing shortened it
    const movedSqr = moved.dx * moved.dx + moved.dy * moved.dy + moved.dz * moved.dz
    const moves = !flags.moveThreshold || movedSqr > 1.0e-7 || (flags.appliesUnobstructedTinyMove && dx * dx + dy * dy + dz * dz - movedSqr < 1.0e-7)
    if (!moves) {
      if (flags.positionFromBox) boat.box = before
    } else if (flags.positionFromBox) {
      const whole = flags.moveThreshold ? before.clone().offset(moved.dx, moved.dy, moved.dz) : box
      boat.box = whole
      boat.pos.set((whole.minX + whole.maxX) / 2, whole.minY, (whole.minZ + whole.maxZ) / 2)
    } else {
      boat.pos.set(boat.pos.x + moved.dx, boat.pos.y + moved.dy, boat.pos.z + moved.dz)
    }
    const collidedX = flags.collisionTolerance ? !(Math.abs(moved.dx - dx) < 9.999999747378752e-6) : moved.dx !== dx
    const collidedZ = flags.collisionTolerance ? !(Math.abs(moved.dz - dz) < 9.999999747378752e-6) : moved.dz !== dz
    boat.isCollidedHorizontally = collidedX || collidedZ
    boat.isCollidedVertically = moved.dy !== dy
    boat.onGround = boat.isCollidedVertically && dy < 0
    // checkFallDamage keeps the motion asked for
    boat.lastYd = dy
    const stopX = flags.collisionStopsMotion ? collidedX : moved.dx !== dx
    const stopZ = flags.collisionStopsMotion ? collidedZ : moved.dz !== dz
    if (stopX && !(flags.cornerKeepsMotionX && stopZ)) boat.vel.x = 0
    if (stopZ) boat.vel.z = 0
    if (boat.isCollidedVertically) boat.vel.y = flags.fallStopMultiplies ? boat.vel.y * 0 : 0
  }

  function simulateBoat (boat, world) {
    boat.oldStatus = boat.status
    boat.status = statusOf(boat, world)
    floatBoat(boat, world)
    controlBoat(boat)
    moveBoat(boat, world)
    return boat
  }
  // Boat.isUnderWater: under water or under flowing water, for a boat at the position
  simulateBoat.isUnderWater = (pos, world) => underwaterStatus({ pos }, world) !== null
  return simulateBoat
}
