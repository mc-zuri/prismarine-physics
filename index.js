const Vec3 = require('vec3').Vec3
const AABB = require('./lib/aabb')
const math = require('./lib/math')
const features = require('./lib/features')
const attribute = require('./lib/attribute')

// The Bedrock engine is TypeScript, loaded as it is through lib/ts-hooks.js.
function bedrock () {
  require('./lib/ts-hooks')
  return require('./lib/bedrock/index.ts')
}

// A feature lists the major versions it applies to, or a range of game versions: since (inclusive) / before.
function makeSupportFeature (mcData) {
  return feature => features.some(({ name, versions, since, before }) => name === feature && (versions
    ? versions.includes(mcData.version.majorVersion)
    : (!since || mcData.isNewerOrEqualTo(since)) && (!before || mcData.isOlderThan(before))))
}

function Physics (mcData, world) {
  // Bedrock Edition (prismarine-registry reports type 'bedrock') uses its own engine; everything below is Java.
  if (mcData.type === 'bedrock') return bedrock().Physics(mcData, world)

  const supportFeature = makeSupportFeature(mcData)
  const blocksByName = mcData.blocksByName

  // Block Slipperiness
  // https://www.mcpk.wiki/w/index.php?title=Slipperiness
  const blockSlipperiness = {}
  const slimeBlockId = blocksByName.slime_block ? blocksByName.slime_block.id : blocksByName.slime.id
  blockSlipperiness[slimeBlockId] = 0.8
  blockSlipperiness[blocksByName.ice.id] = 0.98
  blockSlipperiness[blocksByName.packed_ice.id] = 0.98
  if (blocksByName.frosted_ice) { // 1.9+
    blockSlipperiness[blocksByName.frosted_ice.id] = 0.98
  }
  if (blocksByName.blue_ice) { // 1.13+
    blockSlipperiness[blocksByName.blue_ice.id] = 0.989
  }

  // Block ids
  const soulsandId = blocksByName.soul_sand.id
  const honeyblockId = blocksByName.honey_block ? blocksByName.honey_block.id : -1 // 1.15+
  const webId = blocksByName.cobweb ? blocksByName.cobweb.id : blocksByName.web.id
  const waterIds = [blocksByName.water.id, blocksByName.flowing_water ? blocksByName.flowing_water.id : -1]
  const lavaIds = [blocksByName.lava.id, blocksByName.flowing_lava ? blocksByName.flowing_lava.id : -1]
  const ladderId = blocksByName.ladder.id
  const vineId = blocksByName.vine.id
  const scaffoldingId = blocksByName.scaffolding ? blocksByName.scaffolding.id : -1 // 1.14+

  // NOTE: Copper trapdoors is coming in 1.21.
  const trapdoorIds = new Set()
  if (blocksByName.iron_trapdoor) { trapdoorIds.add(blocksByName.iron_trapdoor.id) } // 1.8+
  if (blocksByName.acacia_trapdoor) { trapdoorIds.add(blocksByName.acacia_trapdoor.id) } // 1.13+
  if (blocksByName.birch_trapdoor) { trapdoorIds.add(blocksByName.birch_trapdoor.id) } // 1.13+
  if (blocksByName.jungle_trapdoor) { trapdoorIds.add(blocksByName.jungle_trapdoor.id) } // 1.13+
  if (blocksByName.oak_trapdoor) { trapdoorIds.add(blocksByName.oak_trapdoor.id) } // 1.13+
  if (blocksByName.dark_oak_trapdoor) { trapdoorIds.add(blocksByName.dark_oak_trapdoor.id) } // 1.13+
  if (blocksByName.spruce_trapdoor) { trapdoorIds.add(blocksByName.spruce_trapdoor.id) } // 1.13+
  if (blocksByName.crimson_trapdoor) { trapdoorIds.add(blocksByName.crimson_trapdoor.id) } // 1.16+
  if (blocksByName.warped_trapdoor) { trapdoorIds.add(blocksByName.warped_trapdoor.id) } // 1.16+
  if (blocksByName.mangrove_trapdoor) { trapdoorIds.add(blocksByName.mangrove_trapdoor.id) } // 1.19+
  if (blocksByName.cherry_trapdoor) { trapdoorIds.add(blocksByName.cherry_trapdoor.id) } // 1.20+

  const waterLike = new Set()
  if (blocksByName.seagrass) waterLike.add(blocksByName.seagrass.id) // 1.13+
  if (blocksByName.tall_seagrass) waterLike.add(blocksByName.tall_seagrass.id) // 1.13+
  if (blocksByName.kelp) waterLike.add(blocksByName.kelp.id) // 1.13+
  if (blocksByName.kelp_plant) waterLike.add(blocksByName.kelp_plant.id) // 1.13+
  const bubblecolumnId = blocksByName.bubble_column ? blocksByName.bubble_column.id : -1 // 1.13+
  if (blocksByName.bubble_column) waterLike.add(bubblecolumnId)

  const physics = {
    gravity: 0.08, // blocks/tick^2 https://minecraft.gamepedia.com/Entity#Motion_of_entities
    airdrag: Math.fround(1 - 0.02), // actually (1 - drag)
    yawSpeed: 3.0,
    pitchSpeed: 3.0,
    playerSpeed: 0.1,
    sprintSpeed: Math.fround(0.3), // the sprint modifier amount is (double) 0.3F
    sneakSpeed: 0.3,
    stepHeight: Math.fround(0.6), // how much height can the bot step on without jump (a float)
    negligeableVelocity: 0.003, // actually 0.005 for 1.8, but seems fine
    soulsandSpeed: 0.4,
    honeyblockSpeed: 0.4,
    honeyblockJumpSpeed: 0.4,
    ladderMaxSpeed: 0.15,
    ladderClimbSpeed: 0.2,
    playerHalfWidth: Math.fround(0.6) / 2, // the player's dimensions are floats: 0.6F wide, 1.8F tall
    playerHeight: Math.fround(1.8),
    waterInertia: 0.8,
    lavaInertia: 0.5,
    liquidAcceleration: 0.02,
    airborneInertia: 0.91,
    airborneAcceleration: 0.02,
    defaultSlipperiness: 0.6,
    outOfLiquidImpulse: 0.3,
    autojumpCooldown: 10, // ticks (0.5s)
    bubbleColumnSurfaceDrag: {
      down: 0.03,
      maxDown: -0.9,
      up: 0.1,
      maxUp: 1.8
    },
    bubbleColumnDrag: {
      down: 0.03,
      maxDown: -0.3,
      up: 0.06,
      maxUp: 0.7
    },
    slowFalling: 0.125,
    movementSpeedAttribute: mcData.attributesByName.movementSpeed.resource,
    sprintingUUID: '662a6b8d-da3e-4c1c-8813-96ea6097278d' // SPEED_MODIFIER_SPRINTING_UUID is from LivingEntity.java
  }

  if (supportFeature('independentLiquidGravity')) {
    physics.waterGravity = 0.02
    physics.lavaGravity = 0.02
  } else if (supportFeature('proportionalLiquidGravity')) {
    physics.waterGravity = physics.gravity / 16
    physics.lavaGravity = physics.gravity / 4
  } else {
    throw new Error('No liquid gravity settings, have you made sure the liquid gravity features are up to date?')
  }

  // How vanilla rounds: which versions compute what in float (see lib/features.json).
  const f32 = math.f32
  const vanilla = {
    mthSinDouble: supportFeature('mthSinDouble'),
    floatMoveRelative: supportFeature('floatMoveRelative'),
    yawPiOver180: supportFeature('moveRelativeYawPiOver180'),
    groundFriction: supportFeature('frictionCubeOfSlipperiness') ? f32(0.21600002) : supportFeature('frictionConstant16277137') ? f32(0.16277137) : f32(0.16277136),
    normalizeFloatSqrt: supportFeature('vec3NormalizeFloatSqrt'),
    squareMovementInput: supportFeature('squareMovementInput'),
    playerHorizontalThreshold: supportFeature('playerHorizontalVelocityThreshold'),
    velocityThreshold: supportFeature('velocityThreshold005') ? 0.005 : 0.003,
    airSprintSpeed: supportFeature('airSprintSpeedFloatSum') ? f32(f32(0.02) + f32(0.006)) : f32(0.025999999),
    jumpBoostFloatSum: supportFeature('jumpBoostFloatSum'),
    jumpSprintDouble: supportFeature('jumpSprintBoostDouble'),
    jumpKeepsVelocity: supportFeature('jumpKeepsHigherVelocity'),
    voxelCollision: supportFeature('voxelShapeCollision'),
    modernMove: supportFeature('modernMove'),
    candidateStepHeights: supportFeature('candidateStepUpHeights'),
    positionFromBoxCenter: supportFeature('positionFromBoxCenter'),
    moveWhenBlocked: supportFeature('moveWhenFullyBlocked'),
    collisionEpsilonVelocity: supportFeature('collisionEpsilonVelocityReset'),
    webSpeed: f32(0.05) // a cobweb scales the move by (0.25, 0.05F, 0.25)
  }

  // The vanilla rotation in degrees (a float). Callers holding it pass yawDegrees / pitchDegrees: mineflayer's
  // radians lose the turns beyond one revolution, which Mth.sin's table index keeps.
  function yawDegrees (entity) {
    return typeof entity.yawDegrees === 'number' ? f32(entity.yawDegrees) : f32((Math.PI - entity.yaw) * 180 / Math.PI)
  }
  const DEG_TO_RAD_F = f32(0.017453292)
  const PI_F = f32(Math.PI)
  const mthSin = radians => math.mthSin(radians, vanilla.mthSinDouble)
  const mthCos = radians => math.mthCos(radians, vanilla.mthSinDouble)

  function getPlayerBB (pos) {
    const w = physics.playerHalfWidth
    return new AABB(-w, 0, -w, w, physics.playerHeight, w).offset(pos.x, pos.y, pos.z)
  }

  function getSurroundingBBs (world, queryBB) {
    const surroundingBBs = []
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(queryBB.minY) - 1; cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block) {
            const blockPos = block.position
            for (const shape of block.shapes) {
              const blockBB = new AABB(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5])
              blockBB.offset(blockPos.x, blockPos.y, blockPos.z)
              surroundingBBs.push(blockBB)
            }
          }
        }
      }
    }
    return surroundingBBs
  }

  // ---- collision as vanilla computes it ----

  // Shapes.collide / VoxelShape.collideX (1.13+): a face ahead counts within 1e-7, the other two axes must overlap by
  // more than 1e-7, and a movement under 1e-7 is none. Before 1.13, AxisAlignedBB.calculateXOffset (no epsilon).
  const EPSILON = 1.0e-7
  const AXES = {
    x: ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'],
    y: ['minY', 'maxY', 'minX', 'maxX', 'minZ', 'maxZ'],
    z: ['minZ', 'maxZ', 'minX', 'maxX', 'minY', 'maxY']
  }
  function collideAxis (axis, box, shapes, dist) {
    if (!vanilla.voxelCollision) {
      for (const shape of shapes) {
        if (axis === 'x') dist = shape.computeOffsetX(box, dist)
        else if (axis === 'y') dist = shape.computeOffsetY(box, dist)
        else dist = shape.computeOffsetZ(box, dist)
      }
      return dist
    }
    const [min, max, min1, max1, min2, max2] = AXES[axis]
    for (const shape of shapes) {
      if (Math.abs(dist) < EPSILON) return 0
      if (!(box[min1] + EPSILON < shape[max1] && box[max1] - EPSILON >= shape[min1] &&
        box[min2] + EPSILON < shape[max2] && box[max2] - EPSILON >= shape[min2])) continue
      if (dist > 0) {
        if (box[max] - EPSILON < shape[min]) {
          const d = shape[min] - box[max]
          if (d >= -EPSILON) dist = Math.min(dist, d)
        }
      } else if (dist < 0) {
        if (box[min] + EPSILON >= shape[max]) {
          const d = shape[max] - box[min]
          if (d <= EPSILON) dist = Math.max(dist, d)
        }
      }
    }
    return Math.abs(dist) < EPSILON ? 0 : dist
  }

  function expandTowards (box, x, y, z) {
    return box.clone().extend(x, y, z)
  }

  // The block shapes a move of box by (x, y, z) can meet: those inside the swept box (1.14+ keeps only these).
  function collisionShapes (world, box, x, y, z) {
    const swept = expandTowards(box, x, y, z)
    const shapes = getSurroundingBBs(world, swept)
    return vanilla.modernMove ? shapes.filter(shape => shape.intersects(swept)) : shapes
  }

  // Entity.collideWithShapes (1.14+): y first, then the larger horizontal axis.
  function collideWithShapes (x, y, z, box, shapes) {
    if (shapes.length === 0) return { x, y, z }
    box = box.clone()
    if (y !== 0) {
      y = collideAxis('y', box, shapes, y)
      if (y !== 0) box.offset(0, y, 0)
    }
    const zFirst = Math.abs(x) < Math.abs(z)
    if (zFirst && z !== 0) {
      z = collideAxis('z', box, shapes, z)
      if (z !== 0) box.offset(0, 0, z)
    }
    if (x !== 0) {
      x = collideAxis('x', box, shapes, x)
      if (!zFirst && x !== 0) box.offset(x, 0, 0)
    }
    if (!zFirst && z !== 0) z = collideAxis('z', box, shapes, z)
    return { x, y, z }
  }

  function collideBoundingBox (world, x, y, z, box) {
    return collideWithShapes(x, y, z, box, collisionShapes(world, box, x, y, z))
  }

  const horizontalSqr = v => v.x * v.x + v.z * v.z

  // Entity.collide (1.14+), with the step up onto blocks up to stepHeight.
  function collideModern (entity, world, move, box) {
    const moved = (move.x === 0 && move.y === 0 && move.z === 0) ? { ...move } : collideBoundingBox(world, move.x, move.y, move.z, box)
    const collidedX = move.x !== moved.x
    const collidedZ = move.z !== moved.z
    const landing = move.y !== moved.y && move.y < 0
    const step = physics.stepHeight
    if (!(step > 0 && (landing || entity.onGround) && (collidedX || collidedZ))) return moved

    if (vanilla.candidateStepHeights) {
      // 1.21+: try each height a collider's face offers within the step, lowest first.
      const base = landing ? box.clone().offset(0, moved.y, 0) : box
      let query = expandTowards(base, move.x, step, move.z)
      if (!landing) query = expandTowards(query, 0, -9.999999747378752e-6, 0)
      const shapes = collisionShapes(world, query, 0, 0, 0)
      const collidedY = f32(moved.y)
      const heights = new Set()
      for (const shape of shapes) {
        for (const coord of [shape.minY, shape.maxY]) {
          const height = f32(coord - base.minY)
          if (height < 0 || height === collidedY) continue
          if (height > step) break
          heights.add(height)
        }
      }
      for (const height of [...heights].sort((a, b) => a - b)) {
        const stepped = collideWithShapes(move.x, height, move.z, base, shapes)
        if (horizontalSqr(stepped) > horizontalSqr(moved)) {
          const dropped = box.minY - base.minY
          return { x: stepped.x, y: stepped.y - dropped, z: stepped.z }
        }
      }
      return moved
    }

    let stepped = collideBoundingBox(world, move.x, step, move.z, box)
    const up = collideBoundingBox(world, 0, step, 0, expandTowards(box, move.x, 0, move.z))
    if (up.y < step) {
      const across = collideBoundingBox(world, move.x, 0, move.z, box.clone().offset(up.x, up.y, up.z))
      const total = { x: across.x + up.x, y: across.y + up.y, z: across.z + up.z }
      if (horizontalSqr(total) > horizontalSqr(stepped)) stepped = total
    }
    if (horizontalSqr(stepped) > horizontalSqr(moved)) {
      const down = collideBoundingBox(world, 0, -stepped.y + move.y, 0, box.clone().offset(stepped.x, stepped.y, stepped.z))
      return { x: stepped.x + down.x, y: stepped.y + down.y, z: stepped.z + down.z }
    }
    return moved
  }

  // Mth.equal
  const nearlyEqual = (a, b) => Math.abs(b - a) < f32(1.0e-5)

  physics.adjustPositionHeight = (pos) => {
    const playerBB = getPlayerBB(pos)
    const queryBB = playerBB.clone().extend(0, -1, 0)
    const surroundingBBs = getSurroundingBBs(world, queryBB)

    let dy = -1
    for (const blockBB of surroundingBBs) {
      dy = blockBB.computeOffsetY(playerBB, dy)
    }
    pos.y += dy
  }

  function moveEntity (entity, world, dx, dy, dz) {
    const vel = entity.vel
    const pos = entity.pos

    if (entity.isInWeb) {
      dx *= 0.25
      dy *= vanilla.webSpeed
      dz *= 0.25
      vel.x = 0
      vel.y = 0
      vel.z = 0
      entity.isInWeb = false
    }

    let oldVelX = dx
    const oldVelY = dy
    let oldVelZ = dz

    if (entity.control.sneak && entity.onGround) {
      const step = 0.05

      // In the 3 loops bellow, y offset should be -1, but that doesnt reproduce vanilla behavior.
      for (; dx !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, 0, 0)).length === 0; oldVelX = dx) {
        if (dx < step && dx >= -step) dx = 0
        else if (dx > 0) dx -= step
        else dx += step
      }

      for (; dz !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(0, 0, dz)).length === 0; oldVelZ = dz) {
        if (dz < step && dz >= -step) dz = 0
        else if (dz > 0) dz -= step
        else dz += step
      }

      while (dx !== 0 && dz !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, 0, dz)).length === 0) {
        if (dx < step && dx >= -step) dx = 0
        else if (dx > 0) dx -= step
        else dx += step

        if (dz < step && dz >= -step) dz = 0
        else if (dz > 0) dz -= step
        else dz += step

        oldVelX = dx
        oldVelZ = dz
      }
    }

    let playerBB = getPlayerBB(pos)
    if (vanilla.modernMove) {
      const box = playerBB
      const moved = collideModern(entity, world, { x: dx, y: dy, z: dz }, box)
      const movedSqr = moved.x * moved.x + moved.y * moved.y + moved.z * moved.z
      const requestedSqr = dx * dx + dy * dy + dz * dz
      playerBB = box.clone().offset(moved.x, moved.y, moved.z)
      if (movedSqr > 1.0e-7 || (vanilla.moveWhenBlocked && requestedSqr - movedSqr < 1.0e-7)) {
        if (vanilla.positionFromBoxCenter) {
          pos.x = (playerBB.minX + playerBB.maxX) / 2
          pos.y = playerBB.minY
          pos.z = (playerBB.minZ + playerBB.maxZ) / 2
        } else {
          pos.x += moved.x
          pos.y += moved.y
          pos.z += moved.z
        }
      } else {
        playerBB = box
      }
      const collidedX = !nearlyEqual(dx, moved.x)
      const collidedZ = !nearlyEqual(dz, moved.z)
      entity.isCollidedHorizontally = collidedX || collidedZ
      entity.isCollidedVertically = dy !== moved.y
      entity.onGround = entity.isCollidedVertically && dy < 0
      if (vanilla.collisionEpsilonVelocity) {
        if (collidedX) vel.x = 0
        if (collidedZ) vel.z = 0
      } else {
        // 1.14-1.18: each axis resets from the velocity before either reset (x comes back when both collide)
        const before = vel.clone()
        if (dx !== moved.x) { vel.x = 0; vel.y = before.y; vel.z = before.z }
        if (dz !== moved.z) { vel.x = before.x; vel.y = before.y; vel.z = 0 }
      }
      if (dy !== moved.y) afterFallOn(entity, world, vel)
      applyBlockCollisions(entity, world, playerBB)
      return
    }

    const queryBB = playerBB.clone().extend(dx, dy, dz)
    const surroundingBBs = getSurroundingBBs(world, queryBB)
    const oldBB = playerBB.clone()

    dy = collideAxis('y', playerBB, surroundingBBs, dy)
    playerBB.offset(0, dy, 0)

    dx = collideAxis('x', playerBB, surroundingBBs, dx)
    playerBB.offset(dx, 0, 0)

    dz = collideAxis('z', playerBB, surroundingBBs, dz)
    playerBB.offset(0, 0, dz)

    // Step on block if height < stepHeight
    if (physics.stepHeight > 0 &&
      (entity.onGround || (dy !== oldVelY && oldVelY < 0)) &&
      (dx !== oldVelX || dz !== oldVelZ)) {
      const oldVelXCol = dx
      const oldVelYCol = dy
      const oldVelZCol = dz
      const oldBBCol = playerBB.clone()

      dy = physics.stepHeight
      const queryBB = oldBB.clone().extend(oldVelX, dy, oldVelZ)
      const surroundingBBs = getSurroundingBBs(world, queryBB)

      const BB1 = oldBB.clone()
      const BB2 = oldBB.clone()
      const BB_XZ = BB1.clone().extend(dx, 0, dz)

      const dy1 = collideAxis('y', BB_XZ, surroundingBBs, dy)
      const dy2 = collideAxis('y', BB2, surroundingBBs, dy)
      BB1.offset(0, dy1, 0)
      BB2.offset(0, dy2, 0)

      const dx1 = collideAxis('x', BB1, surroundingBBs, oldVelX)
      const dx2 = collideAxis('x', BB2, surroundingBBs, oldVelX)
      BB1.offset(dx1, 0, 0)
      BB2.offset(dx2, 0, 0)

      const dz1 = collideAxis('z', BB1, surroundingBBs, oldVelZ)
      const dz2 = collideAxis('z', BB2, surroundingBBs, oldVelZ)
      BB1.offset(0, 0, dz1)
      BB2.offset(0, 0, dz2)

      const norm1 = dx1 * dx1 + dz1 * dz1
      const norm2 = dx2 * dx2 + dz2 * dz2

      if (norm1 > norm2) {
        dx = dx1
        dy = -dy1
        dz = dz1
        playerBB = BB1
      } else {
        dx = dx2
        dy = -dy2
        dz = dz2
        playerBB = BB2
      }

      dy = collideAxis('y', playerBB, surroundingBBs, dy)
      playerBB.offset(0, dy, 0)

      if (oldVelXCol * oldVelXCol + oldVelZCol * oldVelZCol >= dx * dx + dz * dz) {
        dx = oldVelXCol
        dy = oldVelYCol
        dz = oldVelZCol
        playerBB = oldBBCol
      }
    }

    // Update flags: before 1.14 the position is the center of the moved box
    pos.x = (playerBB.minX + playerBB.maxX) / 2
    pos.y = playerBB.minY
    pos.z = (playerBB.minZ + playerBB.maxZ) / 2
    entity.isCollidedHorizontally = dx !== oldVelX || dz !== oldVelZ
    entity.isCollidedVertically = dy !== oldVelY
    entity.onGround = entity.isCollidedVertically && oldVelY < 0

    if (dx !== oldVelX) vel.x = 0
    if (dz !== oldVelZ) vel.z = 0
    if (dy !== oldVelY) afterFallOn(entity, world, vel)
    applyBlockCollisions(entity, world, playerBB)
  }

  // Block.updateEntityAfterFallOn: slime bounces a falling player back up unless sneaking; others stop it.
  function afterFallOn (entity, world, vel) {
    const blockAtFeet = world.getBlock(entity.pos.offset(0, -0.2, 0))
    if (blockAtFeet && blockAtFeet.type === slimeBlockId && !entity.control.sneak) {
      if (vel.y < 0) vel.y = -vel.y
    } else {
      vel.y = 0
    }
  }

  function applyBlockCollisions (entity, world, playerBB) {
    const vel = entity.vel
    // Finally, apply block collisions (web, soulsand...)
    playerBB = playerBB.clone().contract(0.001, 0.001, 0.001)
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(playerBB.minY); cursor.y <= Math.floor(playerBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(playerBB.minZ); cursor.z <= Math.floor(playerBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(playerBB.minX); cursor.x <= Math.floor(playerBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block) {
            if (supportFeature('velocityBlocksOnCollision')) {
              if (block.type === soulsandId) {
                vel.x *= physics.soulsandSpeed
                vel.z *= physics.soulsandSpeed
              } else if (block.type === honeyblockId) {
                vel.x *= physics.honeyblockSpeed
                vel.z *= physics.honeyblockSpeed
              }
            }
            if (block.type === webId) {
              entity.isInWeb = true
            } else if (block.type === bubblecolumnId) {
              const down = !block.metadata
              const aboveBlock = world.getBlock(cursor.offset(0, 1, 0))
              const bubbleDrag = (aboveBlock && aboveBlock.type === 0 /* air */) ? physics.bubbleColumnSurfaceDrag : physics.bubbleColumnDrag
              if (down) {
                vel.y = Math.max(bubbleDrag.maxDown, vel.y - bubbleDrag.down)
              } else {
                vel.y = Math.min(bubbleDrag.maxUp, vel.y + bubbleDrag.up)
              }
            }
          }
        }
      }
    }
    if (supportFeature('velocityBlocksOnTop')) {
      const blockBelow = world.getBlock(entity.pos.floored().offset(0, -0.5, 0))
      if (blockBelow) {
        if (blockBelow.type === soulsandId) {
          vel.x *= physics.soulsandSpeed
          vel.z *= physics.soulsandSpeed
        } else if (blockBelow.type === honeyblockId) {
          vel.x *= physics.honeyblockSpeed
          vel.z *= physics.honeyblockSpeed
        }
      }
    }
  }

  function getLookingVector (entity) {
    // given a yaw pitch, we need the looking vector

    // yaw is right handed rotation about y (up) starting from -z (north)
    // pitch is -90 looking down, 90 looking up, 0 looking at horizon
    // lets get its coordinate system.
    // let x' = -z (north)
    // let y' = -x (west)
    // let z' = y (up)

    // the non normalized looking vector in x', y', z' space is
    // x' is cos(yaw)
    // y' is sin(yaw)
    // z' is tan(pitch)

    // substituting back in x, y, z, we get the looking vector in the normal x, y, z space
    // -z = cos(yaw) => z = -cos(yaw)
    // -x = sin(yaw) => x = -sin(yaw)
    // y = tan(pitch)

    // normalizing the vectors, we divide each by |sqrt(x*x + y*y + z*z)|
    // x*x + z*z = sin^2 + cos^2 = 1
    // so |sqrt(xx+yy+zz)| = |sqrt(1+tan^2(pitch))|
    //     = |sqrt(1+sin^2(pitch)/cos^2(pitch))|
    //     = |sqrt((cos^2+sin^2)/cos^2(pitch))|
    //     = |sqrt(1/cos^2(pitch))|
    //     = |+/- 1/cos(pitch)|
    //     = 1/cos(pitch) since pitch in [-90, 90]

    // the looking vector is therefore
    // x = -sin(yaw) * cos(pitch)
    // y = tan(pitch) * cos(pitch) = sin(pitch)
    // z = -cos(yaw) * cos(pitch)

    const yaw = entity.yaw
    const pitch = entity.pitch
    const sinYaw = Math.sin(yaw)
    const cosYaw = Math.cos(yaw)
    const sinPitch = Math.sin(pitch)
    const cosPitch = Math.cos(pitch)
    const lookX = -sinYaw * cosPitch
    const lookY = sinPitch
    const lookZ = -cosYaw * cosPitch
    const lookDir = new Vec3(lookX, lookY, lookZ)
    return {
      yaw,
      pitch,
      sinYaw,
      cosYaw,
      sinPitch,
      cosPitch,
      lookX,
      lookY,
      lookZ,
      lookDir
    }
  }

  // Entity.moveRelative: the input (xxa to the left, zza forward) scaled to speed and turned by the yaw. Before 1.14
  // all in float (moveFlying); since, a double input vector normalized when longer than 1, turned by float sin/cos.
  function applyHeading (entity, xxa, zza, speed) {
    const vel = entity.vel
    const yaw = yawDegrees(entity)
    if (vanilla.floatMoveRelative) {
      let f = f32(f32(xxa * xxa) + f32(zza * zza))
      if (f < f32(1.0e-4)) return
      f = f32(Math.sqrt(f))
      if (f < 1) f = 1
      f = f32(speed / f)
      xxa = f32(xxa * f)
      zza = f32(zza * f)
      const radians = vanilla.yawPiOver180 ? f32(f32(yaw * PI_F) / 180) : f32(yaw * DEG_TO_RAD_F)
      const sin = mthSin(radians)
      const cos = mthCos(radians)
      vel.x += f32(f32(xxa * cos) - f32(zza * sin))
      vel.z += f32(f32(zza * cos) + f32(xxa * sin))
      return
    }
    const lengthSqr = xxa * xxa + zza * zza
    if (lengthSqr < 1.0e-7) return
    if (lengthSqr > 1) {
      // Vec3.normalize: the length through Mth.sqrt (a float) before 1.17
      const length = vanilla.normalizeFloatSqrt ? f32(Math.sqrt(lengthSqr)) : Math.sqrt(lengthSqr)
      xxa /= length
      zza /= length
    }
    xxa *= speed
    zza *= speed
    const radians = f32(yaw * DEG_TO_RAD_F)
    const sin = mthSin(radians)
    const cos = mthCos(radians)
    vel.x += xxa * cos - zza * sin
    vel.z += zza * cos + xxa * sin
  }

  // The movement input as vanilla hands it to travel (xxa to the left, zza forward, floats).
  function movementInput (entity) {
    const control = entity.control
    let xxa = (control.left ? 1 : 0) - (control.right ? 1 : 0)
    let zza = (control.forward ? 1 : 0) - (control.back ? 1 : 0)
    const slow = control.sneak ? sneakFactor(entity) : 1
    if (vanilla.squareMovementInput) {
      // KeyboardInput normalizes the impulse; LocalPlayer.modifyInput scales it and stretches it to the unit square.
      if (xxa === 0 && zza === 0) return { xxa: 0, zza: 0 }
      let length = f32(Math.sqrt(f32(f32(xxa * xxa) + f32(zza * zza))))
      xxa = f32(xxa / length)
      zza = f32(zza / length)
      const input = f32(0.98)
      xxa = f32(xxa * input)
      zza = f32(zza * input)
      if (slow !== 1) {
        xxa = f32(xxa * slow)
        zza = f32(zza * slow)
      }
      length = f32(Math.sqrt(f32(f32(xxa * xxa) + f32(zza * zza))))
      if (length <= 0) return { xxa, zza }
      const unit = f32(1 / length)
      const ux = f32(xxa * unit)
      const uz = f32(zza * unit)
      const ax = Math.abs(ux)
      const az = Math.abs(uz)
      const ratio = az > ax ? f32(ax / az) : f32(az / ax)
      const toSquare = f32(Math.sqrt(f32(1 + f32(ratio * ratio))))
      const scale = Math.min(f32(length * toSquare), 1)
      return { xxa: f32(ux * scale), zza: f32(uz * scale) }
    }
    xxa = f32(xxa * slow)
    zza = f32(zza * slow)
    return { xxa: f32(xxa * f32(0.98)), zza: f32(zza * f32(0.98)) }
  }

  function sneakFactor (entity) {
    return f32(physics.sneakSpeed)
  }

  const climbableTrapdoorFeature = supportFeature('climbableTrapdoor')
  function isOnLadder (world, pos) {
    const block = world.getBlock(pos)
    if (!block) { return false }
    if (block.type === ladderId || block.type === vineId) { return true }
    if (scaffoldingId !== -1 && block.type === scaffoldingId) { return true }

    // Since 1.9, when a trapdoor satisfies the following conditions, it also becomes climbable:
    //  1. The trapdoor is placed directly above a ladder.
    //  2. The trapdoor is opened.
    //  3. The trapdoor and the ladder directly below it face the same direction.
    if (climbableTrapdoorFeature && trapdoorIds.has(block.type)) {
      const blockBelow = world.getBlock(pos.offset(0, -1, 0))
      if (blockBelow.type !== ladderId) { return false } // condition 1.
      const blockProperties = block._properties
      if (!blockProperties.open) { return false } // condition 2.
      if (blockProperties.facing !== blockBelow.getProperties().facing) { return false } // condition 3
      return true
    }

    return false
  }

  function doesNotCollide (world, pos) {
    const pBB = getPlayerBB(pos)
    return !getSurroundingBBs(world, pBB).some(x => pBB.intersects(x)) && getWaterInBB(world, pBB).length === 0
  }

  function moveEntityWithHeading (entity, world, strafe, forward) {
    const vel = entity.vel
    const pos = entity.pos

    const gravityMultiplier = (vel.y <= 0 && entity.slowFalling > 0) ? physics.slowFalling : 1

    if (entity.isInWater || entity.isInLava) {
      // Water / Lava movement
      const lastY = pos.y
      let acceleration = physics.liquidAcceleration
      const inertia = entity.isInWater ? physics.waterInertia : physics.lavaInertia
      let horizontalInertia = inertia

      if (entity.isInWater) {
        let strider = Math.min(entity.depthStrider, 3)
        if (!entity.onGround) {
          strider *= 0.5
        }
        if (strider > 0) {
          horizontalInertia += (0.546 - horizontalInertia) * strider / 3
          acceleration += (0.7 - acceleration) * strider / 3
        }

        if (entity.dolphinsGrace > 0) horizontalInertia = 0.96
      }

      applyHeading(entity, strafe, forward, acceleration)
      moveEntity(entity, world, vel.x, vel.y, vel.z)
      vel.y *= inertia
      vel.y -= (entity.isInWater ? physics.waterGravity : physics.lavaGravity) * gravityMultiplier
      vel.x *= horizontalInertia
      vel.z *= horizontalInertia

      if (entity.isCollidedHorizontally && doesNotCollide(world, pos.offset(vel.x, vel.y + 0.6 - pos.y + lastY, vel.z))) {
        vel.y = physics.outOfLiquidImpulse // jump out of liquid
      }
    } else if (entity.elytraFlying) {
      const {
        pitch,
        sinPitch,
        cosPitch,
        lookDir
      } = getLookingVector(entity)
      const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
      const cosPitchSquared = cosPitch * cosPitch
      vel.y += physics.gravity * gravityMultiplier * (-1.0 + cosPitchSquared * 0.75)
      // cosPitch is in [0, 1], so cosPitch > 0.0 is just to protect against
      // divide by zero errors
      if (vel.y < 0.0 && cosPitch > 0.0) {
        const movingDownSpeedModifier = vel.y * (-0.1) * cosPitchSquared
        vel.x += lookDir.x * movingDownSpeedModifier / cosPitch
        vel.y += movingDownSpeedModifier
        vel.z += lookDir.z * movingDownSpeedModifier / cosPitch
      }

      if (pitch > 0.0 && cosPitch > 0.0) {
        const lookDownSpeedModifier = horizontalSpeed * sinPitch * 0.04
        vel.x += -lookDir.x * lookDownSpeedModifier / cosPitch
        vel.y += lookDownSpeedModifier * 3.2
        vel.z += -lookDir.z * lookDownSpeedModifier / cosPitch
      }

      if (cosPitch > 0.0) {
        vel.x += (lookDir.x / cosPitch * horizontalSpeed - vel.x) * 0.1
        vel.z += (lookDir.z / cosPitch * horizontalSpeed - vel.z) * 0.1
      }

      vel.x *= 0.99
      vel.y *= 0.98
      vel.z *= 0.99
      moveEntity(entity, world, vel.x, vel.y, vel.z)

      if (entity.onGround) {
        entity.elytraFlying = false
      }
    } else {
      // Normal movement
      let acceleration = 0.0
      let inertia = 0.0
      const blockUnder = world.getBlock(pos.offset(0, -1, 0))
      const slipperiness = f32(blockUnder ? (blockSlipperiness[blockUnder.type] || physics.defaultSlipperiness) : physics.defaultSlipperiness)
      if (entity.onGround) {
        let playerSpeedAttribute
        if (entity.attributes && entity.attributes[physics.movementSpeedAttribute]) {
          // Use server-side player attributes
          playerSpeedAttribute = entity.attributes[physics.movementSpeedAttribute]
        } else {
          // Create an attribute if the player does not have it
          playerSpeedAttribute = attribute.createAttributeValue(physics.playerSpeed)
        }
        // Client-side sprinting (don't rely on server-side sprinting)
        // setSprinting in LivingEntity.java
        playerSpeedAttribute = attribute.deleteAttributeModifier(playerSpeedAttribute, physics.sprintingUUID) // always delete sprinting (if it exists)
        if (entity.control.sprint) {
          if (!attribute.checkAttributeModifier(playerSpeedAttribute, physics.sprintingUUID)) {
            playerSpeedAttribute = attribute.addAttributeModifier(playerSpeedAttribute, {
              uuid: physics.sprintingUUID,
              amount: physics.sprintSpeed,
              operation: 2
            })
          }
        }
        // Calculate what the speed is (0.1 if no modification)
        const attributeSpeed = f32(attribute.getAttributeValue(playerSpeedAttribute))
        inertia = f32(slipperiness * f32(0.91))
        // 1.14+: getFrictionInfluencedSpeed, speed * (0.21600002F / f^3) of the slipperiness; before, of it times 0.91
        const f = vanilla.floatMoveRelative ? inertia : slipperiness
        acceleration = f32(attributeSpeed * f32(vanilla.groundFriction / f32(f32(f * f) * f)))
        if (acceleration < 0) acceleration = 0 // acceleration should not be negative
      } else {
        acceleration = entity.control.sprint ? vanilla.airSprintSpeed : f32(physics.airborneAcceleration)
        inertia = f32(physics.airborneInertia)
      }

      applyHeading(entity, strafe, forward, acceleration)

      if (isOnLadder(world, pos)) {
        vel.x = math.clamp(-physics.ladderMaxSpeed, vel.x, physics.ladderMaxSpeed)
        vel.z = math.clamp(-physics.ladderMaxSpeed, vel.z, physics.ladderMaxSpeed)
        vel.y = Math.max(vel.y, entity.control.sneak ? 0 : -physics.ladderMaxSpeed)
      }

      moveEntity(entity, world, vel.x, vel.y, vel.z)

      if (isOnLadder(world, pos) && (entity.isCollidedHorizontally ||
        (supportFeature('climbUsingJump') && entity.control.jump))) {
        vel.y = physics.ladderClimbSpeed // climb ladder
      }

      // Apply friction and gravity
      if (entity.levitation > 0) {
        vel.y += (0.05 * entity.levitation - vel.y) * 0.2
      } else {
        vel.y -= physics.gravity * gravityMultiplier
      }
      vel.y *= physics.airdrag
      vel.x *= inertia
      vel.z *= inertia
    }
  }

  function isMaterialInBB (world, queryBB, types) {
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(queryBB.minY); cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block && types.includes(block.type)) return true
        }
      }
    }
    return false
  }

  function getLiquidHeightPcent (block) {
    return (getRenderedDepth(block) + 1) / 9
  }

  function getRenderedDepth (block) {
    if (!block) return -1
    if (waterLike.has(block.type)) return 0
    if (block.isWaterlogged) return 0
    if (!waterIds.includes(block.type)) return -1
    const meta = block.metadata
    return meta >= 8 ? 0 : meta
  }

  function getFlow (world, block) {
    const curlevel = getRenderedDepth(block)
    const flow = new Vec3(0, 0, 0)
    for (const [dx, dz] of [[0, 1], [-1, 0], [0, -1], [1, 0]]) {
      const adjBlock = world.getBlock(block.position.offset(dx, 0, dz))
      const adjLevel = getRenderedDepth(adjBlock)
      if (adjLevel < 0) {
        if (adjBlock && adjBlock.boundingBox !== 'empty') {
          const adjLevel = getRenderedDepth(world.getBlock(block.position.offset(dx, -1, dz)))
          if (adjLevel >= 0) {
            const f = adjLevel - (curlevel - 8)
            flow.x += dx * f
            flow.z += dz * f
          }
        }
      } else {
        const f = adjLevel - curlevel
        flow.x += dx * f
        flow.z += dz * f
      }
    }

    if (block.metadata >= 8) {
      for (const [dx, dz] of [[0, 1], [-1, 0], [0, -1], [1, 0]]) {
        const adjBlock = world.getBlock(block.position.offset(dx, 0, dz))
        const adjUpBlock = world.getBlock(block.position.offset(dx, 1, dz))
        if ((adjBlock && adjBlock.boundingBox !== 'empty') || (adjUpBlock && adjUpBlock.boundingBox !== 'empty')) {
          flow.normalize().translate(0, -6, 0)
        }
      }
    }

    return flow.normalize()
  }

  function getWaterInBB (world, bb) {
    const waterBlocks = []
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(bb.minY); cursor.y <= Math.floor(bb.maxY); cursor.y++) {
      for (cursor.z = Math.floor(bb.minZ); cursor.z <= Math.floor(bb.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(bb.minX); cursor.x <= Math.floor(bb.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block && (waterIds.includes(block.type) || waterLike.has(block.type) || block.isWaterlogged)) {
            const waterLevel = cursor.y + 1 - getLiquidHeightPcent(block)
            if (Math.ceil(bb.maxY) >= waterLevel) waterBlocks.push(block)
          }
        }
      }
    }
    return waterBlocks
  }

  function isInWaterApplyCurrent (world, bb, vel) {
    const acceleration = new Vec3(0, 0, 0)
    const waterBlocks = getWaterInBB(world, bb)
    const isInWater = waterBlocks.length > 0
    for (const block of waterBlocks) {
      const flow = getFlow(world, block)
      acceleration.add(flow)
    }

    const len = acceleration.norm()
    if (len > 0) {
      vel.x += acceleration.x / len * 0.014
      vel.y += acceleration.y / len * 0.014
      vel.z += acceleration.z / len * 0.014
    }
    return isInWater
  }

  physics.simulatePlayer = (entity, world) => {
    const vel = entity.vel
    const pos = entity.pos

    const waterBB = getPlayerBB(pos).contract(0.001, 0.401, 0.001)
    const lavaBB = getPlayerBB(pos).contract(0.1, 0.4, 0.1)

    entity.isInWater = isInWaterApplyCurrent(world, waterBB, vel)
    entity.isInLava = isMaterialInBB(world, lavaBB, lavaIds)

    // Reset velocity component if it falls under the threshold (1.21.5+: the player's horizontal speed as a whole)
    if (vanilla.playerHorizontalThreshold) {
      if (vel.x * vel.x + vel.z * vel.z < 9.0e-6) {
        vel.x = 0
        vel.z = 0
      }
    } else {
      if (Math.abs(vel.x) < vanilla.velocityThreshold) vel.x = 0
      if (Math.abs(vel.z) < vanilla.velocityThreshold) vel.z = 0
    }
    if (Math.abs(vel.y) < vanilla.velocityThreshold) vel.y = 0

    // Handle inputs
    if (entity.control.jump || entity.jumpQueued) {
      if (entity.jumpTicks > 0) entity.jumpTicks--
      if (entity.isInWater || entity.isInLava) {
        vel.y += 0.04
      } else if (entity.onGround && entity.jumpTicks === 0) {
        const blockBelow = world.getBlock(entity.pos.floored().offset(0, -0.5, 0))
        const power = f32(f32(0.42) * ((blockBelow && blockBelow.type === honeyblockId) ? f32(physics.honeyblockJumpSpeed) : 1))
        const boost = entity.jumpBoost > 0 ? f32(f32(0.1) * entity.jumpBoost) : 0
        const jump = vanilla.jumpBoostFloatSum ? f32(power + boost) : power + boost
        vel.y = vanilla.jumpKeepsVelocity ? Math.max(jump, vel.y) : jump
        if (entity.control.sprint) {
          const radians = f32(yawDegrees(entity) * DEG_TO_RAD_F)
          if (vanilla.jumpSprintDouble) {
            vel.x += -mthSin(radians) * 0.2
            vel.z += mthCos(radians) * 0.2
          } else {
            vel.x += f32(-mthSin(radians) * f32(0.2))
            vel.z += f32(mthCos(radians) * f32(0.2))
          }
        }
        entity.jumpTicks = physics.autojumpCooldown
      }
    } else {
      entity.jumpTicks = 0 // reset autojump cooldown
    }
    entity.jumpQueued = false

    const { xxa: strafe, zza: forward } = movementInput(entity)

    entity.elytraFlying = entity.elytraFlying && entity.elytraEquipped && !entity.onGround && !entity.levitation

    if (entity.fireworkRocketDuration > 0) {
      if (!entity.elytraFlying) {
        entity.fireworkRocketDuration = 0
      } else {
        const { lookDir } = getLookingVector(entity)
        vel.x += lookDir.x * 0.1 + (lookDir.x * 1.5 - vel.x) * 0.5
        vel.y += lookDir.y * 0.1 + (lookDir.y * 1.5 - vel.y) * 0.5
        vel.z += lookDir.z * 0.1 + (lookDir.z * 1.5 - vel.z) * 0.5
        --entity.fireworkRocketDuration
      }
    }

    moveEntityWithHeading(entity, world, strafe, forward)

    return entity
  }

  return physics
}

// Bedrock's wire effect ids (MobEffectPacket, what mineflayer keys bot.entity.effects by); minecraft-data's Bedrock
// effect table carries the Java numbering, which differs from levitation on.
const BEDROCK_EFFECT_IDS = { Speed: 1, Slowness: 2, JumpBoost: 8, Blindness: 15, Levitation: 24, SlowFalling: 27, Weaving: 33 }

function getEffectLevel (mcData, effectName, effects) {
  if (mcData.type === 'bedrock') {
    const id = BEDROCK_EFFECT_IDS[effectName]
    const effectInfo = id === undefined ? undefined : (effects[id] ?? effects[String(id)])
    return effectInfo ? effectInfo.amplifier + 1 : 0
  }
  const effectDescriptor = mcData.effectsByName?.[effectName]
  if (!effectDescriptor) {
    return 0
  }
  const effectInfo = effects[effectDescriptor.id]
  if (!effectInfo) {
    return 0
  }
  return effectInfo.amplifier + 1
}

function getEnchantmentLevel (mcData, enchantmentName, enchantments) {
  const enchantmentDescriptor = mcData.enchantmentsByName?.[enchantmentName]
  if (!enchantmentDescriptor) {
    return 0
  }

  for (const enchInfo of enchantments) {
    if (typeof enchInfo.id === 'string') {
      if (enchInfo.id.includes(enchantmentName)) {
        return enchInfo.lvl
      }
    } else if (enchInfo.id === enchantmentDescriptor.id) {
      return enchInfo.lvl
    }
  }
  return 0
}

class PlayerState {
  constructor (bot, control) {
    // Prefer the bot's registry (works for both editions; Bedrock's bot.version is a bare id that minecraft-data would
    // resolve to the wrong edition). Fall back to minecraft-data for bare non-mineflayer callers.
    const mcData = bot.registry ?? require('minecraft-data')(bot.version)
    const nbt = require('prismarine-nbt')

    // Input / Outputs
    this.pos = bot.entity.position.clone()
    this.vel = bot.entity.velocity.clone()
    this.onGround = bot.entity.onGround
    this.isInWater = bot.entity.isInWater
    this.isInLava = bot.entity.isInLava
    this.isInWeb = bot.entity.isInWeb
    this.isCollidedHorizontally = bot.entity.isCollidedHorizontally
    this.isCollidedVertically = bot.entity.isCollidedVertically
    this.elytraFlying = bot.entity.elytraFlying
    this.jumpTicks = bot.jumpTicks
    this.jumpQueued = bot.jumpQueued
    this.fireworkRocketDuration = bot.fireworkRocketDuration
    // Bedrock engine state (float32 collision box, swim pose, pending block slowdowns); undefined on Java.
    this.bedrock = bot.bedrockPhysicsState
    // Bedrock-only inputs (ignored by the Java engine): creative flight (the server-granted ability, mineflayer's
    // bot.abilities from UpdateAbilities, or bot.flying), the client's own fly toggle when tracked separately,
    // the ability fly speeds, and the item-use movement slowdown.
    const abilities = bot.abilities || {}
    const abilityFlags = abilities.flags || {}
    // The abilities are the server's alone (update_abilities, the layers merged): the client takes none from the game
    // mode, and the server restates them a second or so after the mode changes.
    const mode = bot.game ? bot.game.gameMode : undefined
    this.flying = bot.flying !== undefined ? !!bot.flying : !!abilityFlags.flying
    this.flyIntent = bot.flyIntent
    this.flySpeed = typeof abilities.flySpeed === 'number' ? abilities.flySpeed : undefined
    this.verticalFlySpeed = typeof abilities.verticalFlySpeed === 'number' ? abilities.verticalFlySpeed : undefined
    this.usingItem = !!bot.usingHeldItem
    // Bedrock-only inputs of the client's sprint and flight triggers: the may-fly ability, the food level (a sprint
    // needs more than 6) and blindness (no sprint).
    this.mayFly = !!(abilityFlags.mayFly || abilityFlags.may_fly)
    this.noClip = !!(abilityFlags.noClip || abilityFlags.no_clip)
    // Instant build (the creative ability): a held jump then ends no glide, and boosts it.
    this.instabuild = !!(abilityFlags.instabuild || abilityFlags.instant_build)
    // The game mode (mineflayer's bot.game.gameMode, the default already resolved to the world's): the creative hover
    // damping and the spectator's standing pose.
    this.gameMode = mode
    // Whether the client holds the player immobile: the server's NO_AI actor flag, sleeping, or no health left.
    const actorFlags = (bot.entity.metadata && bot.entity.metadata.flags) || {}
    this.immobile = !!actorFlags.no_ai || !!bot.isSleeping || (typeof bot.health === 'number' && bot.health <= 0)
    this.food = bot.food
    // A riptide launch this tick (the released trident's Riptide level) and the mobs the spin hit this tick; the
    // Bedrock engine consumes both.
    this.riptideLaunch = bot.riptideLaunch || 0
    this.spinHits = bot.spinHits || 0
    // A firework rocket the bot used this tick (consumed by the tick): the glide boost the client gives itself.
    this.fireworkUsed = !!bot.fireworkUsed
    // An item use the bot started this tick (consumed by the tick): the packet's start_using_item.
    this.itemUseStarted = !!bot.itemUseStarted
    // The vehicle the bot rides (the Bedrock engine's, kept by mineflayer's vehicles plugin as bot.bedrockVehicle).
    this.vehicle = bot.bedrockVehicle || undefined
    // The big-wave roll of a boat the bot steers (a uniform draw in [0, 1)), where the caller supplies the client's.
    this.bigWaveRoll = typeof bot.bedrockBigWaveRoll === 'function' ? bot.bedrockBigWaveRoll : undefined
    // The client's core random state (a recording's), from which the boat draws the roll itself.
    this.randomState = bot.bedrockRandomState

    // Input only (not modified)
    this.attributes = bot.entity.attributes
    this.yaw = bot.entity.yaw
    this.pitch = bot.entity.pitch
    this.control = control

    // effects
    const effects = bot.entity.effects

    this.jumpBoost = getEffectLevel(mcData, 'JumpBoost', effects)
    this.speed = getEffectLevel(mcData, 'Speed', effects)
    this.slowness = getEffectLevel(mcData, 'Slowness', effects)

    this.dolphinsGrace = getEffectLevel(mcData, 'DolphinsGrace', effects)
    this.slowFalling = getEffectLevel(mcData, 'SlowFalling', effects)
    this.levitation = getEffectLevel(mcData, 'Levitation', effects)
    this.blindness = mcData.type === 'bedrock' ? getEffectLevel(mcData, 'Blindness', effects) : 0
    this.weaving = mcData.type === 'bedrock' ? getEffectLevel(mcData, 'Weaving', effects) : 0

    // armour enchantments
    const boots = bot.inventory.slots[8]
    if (boots && boots.nbt) {
      const simplifiedNbt = nbt.simplify(boots.nbt)
      const enchantments = simplifiedNbt.Enchantments ?? simplifiedNbt.ench ?? []
      this.depthStrider = getEnchantmentLevel(mcData, 'depth_strider', enchantments)
      this.soulSpeed = getEnchantmentLevel(mcData, 'soul_speed', enchantments)
    } else {
      this.depthStrider = 0
      this.soulSpeed = 0
    }
    // leather boots: powder snow holds the player up (Bedrock)
    this.leatherBoots = !!boots && boots.name === 'leather_boots'
    // Swift Sneak on the leggings: the sneaking move is scaled less
    const leggings = bot.inventory.slots[7]
    if (leggings && leggings.nbt) {
      const simplifiedNbt = nbt.simplify(leggings.nbt)
      this.swiftSneak = getEnchantmentLevel(mcData, 'swift_sneak', simplifiedNbt.Enchantments ?? simplifiedNbt.ench ?? [])
    } else {
      this.swiftSneak = 0
    }

    // extra elytra requirements
    const item = bot.inventory.slots[6]
    this.elytraEquipped = item != null && item.name === 'elytra'
  }

  apply (bot) {
    bot.entity.position = this.pos
    bot.entity.velocity = this.vel
    bot.entity.onGround = this.onGround
    bot.entity.isInWater = this.isInWater
    bot.entity.isInLava = this.isInLava
    bot.entity.isInWeb = this.isInWeb
    bot.entity.isCollidedHorizontally = this.isCollidedHorizontally
    bot.entity.isCollidedVertically = this.isCollidedVertically
    bot.entity.elytraFlying = this.elytraFlying
    bot.jumpTicks = this.jumpTicks
    bot.jumpQueued = this.jumpQueued
    bot.fireworkRocketDuration = this.fireworkRocketDuration
    bot.riptideLaunch = this.riptideLaunch
    bot.spinHits = this.spinHits
    bot.fireworkUsed = this.fireworkUsed
    bot.itemUseStarted = this.itemUseStarted
    if (bot.bedrockVehicle) bot.bedrockVehicle = this.vehicle
    if (this.bedrock !== undefined) bot.bedrockPhysicsState = this.bedrock
  }
}

// The Bedrock classes load with the engine on first use, so requiring the package for Java needs neither the engine
// nor the Node.js it runs on.
module.exports = { Physics, PlayerState }
for (const name of ['BedrockRewind', 'BedrockSession']) {
  Object.defineProperty(module.exports, name, { enumerable: true, get: () => bedrock()[name] })
}
