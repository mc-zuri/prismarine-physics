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
  const byTag = test => new Set(mcData.blocksArray.filter(b => test(b.name)).map(b => b.id))
  const fenceIds = byTag(name => name.endsWith('fence'))
  const wallIds = byTag(name => name.endsWith('_wall') && !name.includes('sign') && !name.includes('banner') && !name.includes('torch') && !name.includes('head') && !name.includes('skull') && !name.includes('fan'))
  const gateIds = byTag(name => name.endsWith('fence_gate'))
  const airId = blocksByName.air.id
  const berryBushId = blocksByName.sweet_berry_bush ? blocksByName.sweet_berry_bush.id : -1 // 1.14+
  const powderSnowId = blocksByName.powder_snow ? blocksByName.powder_snow.id : -1 // 1.17+
  // Entity.makeStuckInBlock multipliers (x, y, z)
  const STUCK_IN_WEB = [0.25, Math.fround(0.05), 0.25]
  const STUCK_IN_BERRY_BUSH = [Math.fround(0.8), 0.75, Math.fround(0.8)]
  const STUCK_IN_POWDER_SNOW = [Math.fround(0.9), 1.5, Math.fround(0.9)]
  const bedIds = new Set(mcData.blocksArray.filter(b => b.name === 'bed' || b.name.endsWith('_bed')).map(b => b.id))
  const soulsandId = blocksByName.soul_sand.id
  const soulSoilId = blocksByName.soul_soil ? blocksByName.soul_soil.id : -1 // 1.16+
  const honeyblockId = blocksByName.honey_block ? blocksByName.honey_block.id : -1 // 1.15+
  const webId = blocksByName.cobweb ? blocksByName.cobweb.id : blocksByName.web.id
  const waterIds = [blocksByName.water.id, blocksByName.flowing_water ? blocksByName.flowing_water.id : -1]
  const lavaIds = [blocksByName.lava.id, blocksByName.flowing_lava ? blocksByName.flowing_lava.id : -1]
  const ladderId = blocksByName.ladder.id
  const scaffoldingId = blocksByName.scaffolding ? blocksByName.scaffolding.id : -1 // 1.14+
  // BlockTags.CLIMBABLE (scaffolding apart): ladders, vines, and the nether (1.16+) and cave (1.17+) vines
  const climbableIds = new Set(['ladder', 'vine', 'weeping_vines', 'weeping_vines_plant', 'twisting_vines', 'twisting_vines_plant', 'cave_vines', 'cave_vines_plant']
    .filter(name => blocksByName[name]).map(name => blocksByName[name].id))

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
    honeyblockJumpSpeed: 0.5,
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
    waterSprintSlowdown: supportFeature('proportionalLiquidGravity'),
    waterMovementEfficiency: supportFeature('waterMovementEfficiency'),
    proportionalLiquidGravity: supportFeature('proportionalLiquidGravity'),
    fluidFallingBeforeMove: supportFeature('modernMove'),
    climbFloatVertical: supportFeature('modernMove'),
    crouchLag: supportFeature('crouchLag'),
    bedBounce: supportFeature('bedBounce'),
    elytraDoubleCos: supportFeature('elytraDoubleCos'),
    elytraSquareOnly: supportFeature('elytraSquareOnly'),
    clientStartsGliding: supportFeature('crouchLag'),
    crouchPose: supportFeature('modernMove'),
    sprintState: supportFeature('sprintState'),
    sprintState13: !supportFeature('modernMove'),
    sprintByForwardImpulse: supportFeature('squareMovementInput'),
    sprintStopsWhenSlow: supportFeature('sprintStopsWhenSlow'),
    sprintNotWhileGliding: supportFeature('sprintNotWhileGliding'),
    minorCollision: supportFeature('minorHorizontalCollision'),
    eyeFluidOffset: supportFeature('eyeFluidOffset'),
    eyeFluidLegacy: supportFeature('proportionalLiquidGravity') && !supportFeature('lavaFluidHeight'),
    playerAttributes: supportFeature('playerPhysicsAttributes'),
    sneakingSpeedAttribute: supportFeature('waterMovementEfficiency'),
    blockSpeedFactor: supportFeature('blockSpeedFactor'),
    fluidHeights: supportFeature('proportionalLiquidGravity'),
    lavaFluidHeight: supportFeature('lavaFluidHeight'),
    lavaInsideBlocks: supportFeature('modernMove'),
    minimumFluidPush: supportFeature('lavaFluidHeight'),
    unifiedFluidInteraction: supportFeature('unifiedFluidInteraction'),
    worldBorderCollider: supportFeature('worldBorderCollider'),
    insideBlocksAlongPath: supportFeature('insideBlocksAlongPath'),
    insideBlocksAxisSteps: supportFeature('insideBlocksAxisSteps'),
    axisOrderByRequested: supportFeature('insideBlocksAlongPath'),
    insideBlocksEndIntersect: supportFeature('insideBlocksEndIntersect'),
    bubbleSurfaceByShape: supportFeature('bubbleSurfaceByShape'),
    supportingBlock: supportFeature('supportingBlock'),
    effectsAfterTravel: supportFeature('blockEffectsAfterTravel'),
    movementEfficiency: supportFeature('movementEfficiency'),
    blockBelowHalf: supportFeature('blockBelowHalfBlock'),
    blockBelowOnPos: supportFeature('blockBelowOnPos')
  }

  // An attribute the caller holds (entity.attributes, keyed like mineflayer by the resource name), else the default.
  function attributeValue (entity, name, fallback) {
    const def = mcData.attributesByName[name]
    const held = def && entity.attributes && entity.attributes[def.resource]
    return held ? attribute.getAttributeValue(held) : fallback
  }

  // 1.20.5+ player attributes: gravity, jump strength, step height; 1.21+: sneaking speed
  const gravityOf = entity => vanilla.playerAttributes ? attributeValue(entity, 'gravity', physics.gravity) : physics.gravity
  const stepHeightOf = entity => vanilla.playerAttributes ? f32(attributeValue(entity, 'stepHeight', physics.stepHeight)) : physics.stepHeight

  // Entity.calculateViewVector from the vanilla rotation (Mth trig, float products)
  function viewVector (entity) {
    const pitch = f32(pitchDegrees(entity) * DEG_TO_RAD_F)
    const yaw = f32(-yawDegrees(entity) * DEG_TO_RAD_F)
    const cosYaw = mthCos(yaw)
    const sinYaw = mthSin(yaw)
    const cosPitch = mthCos(pitch)
    const sinPitch = mthSin(pitch)
    return new Vec3(f32(sinYaw * cosPitch), -sinPitch, f32(cosYaw * cosPitch))
  }

  function pitchDegrees (entity) {
    return typeof entity.pitchDegrees === 'number' ? f32(entity.pitchDegrees) : f32(-entity.pitch * 180 / Math.PI)
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

  // The player's pose (1.14+) sets its height: 1.8F standing, 1.5F crouching, 0.6F swimming, crawling or gliding.
  const POSE_HEIGHT = { standing: Math.fround(1.8), crouching: Math.fround(1.5), swimming: Math.fround(0.6), fall_flying: Math.fround(0.6), spin_attack: Math.fround(0.6) }
  const POSE_EYE_HEIGHT = { standing: Math.fround(1.62), crouching: Math.fround(1.27), swimming: Math.fround(0.4), fall_flying: Math.fround(0.4), spin_attack: Math.fround(0.4) }
  let boxHeight = physics.playerHeight

  function getPlayerBB (pos, height = boxHeight) {
    const w = physics.playerHalfWidth
    return new AABB(-w, 0, -w, w, height, w).offset(pos.x, pos.y, pos.z)
  }

  // The moving player, for blocks whose collision depends on it (EntityCollisionContext): where its feet are when the
  // move starts and whether it is descending (sneaking).
  let collisionContext = null

  const SCAFFOLDING_STABLE = [[0, 0.875, 0, 1, 1, 1], [0, 0, 0, 0.125, 1, 0.125], [0.875, 0, 0, 1, 1, 0.125], [0, 0, 0.875, 0.125, 1, 1], [0.875, 0, 0.875, 1, 1, 1]]
  const SCAFFOLDING_UNSTABLE_BOTTOM = [[0, 0, 0, 1, 0.125, 1]]

  function collisionShapesOf (block, blockPos) {
    if (block.type === scaffoldingId && collisionContext) {
      // ScaffoldingBlock.getCollisionShape: solid from above unless descending; a bottom piece shows its base slab
      const above = shapeTop => collisionContext.bottom > blockPos.y + shapeTop - 9.999999747378752e-6
      if (above(1) && !collisionContext.descending) return SCAFFOLDING_STABLE
      const props = block.getProperties()
      return String(props.distance) !== '0' && (props.bottom === true || props.bottom === 'true') && above(0) ? SCAFFOLDING_UNSTABLE_BOTTOM : []
    }
    return block.shapes
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
            for (const shape of collisionShapesOf(block, blockPos)) {
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

  // The player's box. Before 1.17 vanilla keeps the box across ticks, moves it and takes the position from its
  // center; while the position is still that center (nobody moved the player), the kept box is the one to use.
  function entityBox (entity) {
    const box = entity.javaBox
    const pos = entity.pos
    if (box && (vanilla.positionFromBoxCenter || !vanilla.modernMove) && (box.minX + box.maxX) / 2 === pos.x &&
      box.minY === pos.y && (box.minZ + box.maxZ) / 2 === pos.z) return box.clone()
    return getPlayerBB(pos)
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
    return dist
  }

  function expandTowards (box, x, y, z) {
    return box.clone().extend(x, y, z)
  }

  // The block shapes a move of box by (x, y, z) can meet: those inside the swept box (1.14+ keeps only these).
  function collisionShapes (world, box, x, y, z) {
    const swept = expandTowards(box, x, y, z)
    const shapes = getSurroundingBBs(world, swept)
    if (!vanilla.modernMove) return shapes
    const inside = shapes.filter(shape => shape.intersects(swept))
    // 1.14-1.16: the world border's shape is always among the colliders (while inside it), so a move under 1e-7 is
    // dropped even in open space. It stands far away here (the engine does not model the border itself).
    if (vanilla.worldBorderCollider) inside.push(WORLD_BORDER)
    return inside
  }
  const WORLD_BORDER = new AABB(3.0e7, -1.0e9, 3.0e7, 3.0e7 + 1, 1.0e9, 3.0e7 + 1)

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

  function legacyShapes (world, queryBB) {
    const shapes = getSurroundingBBs(world, queryBB)
    return vanilla.voxelCollision ? shapes.filter(shape => shape.intersects(queryBB)) : shapes
  }

  // Entity.collide (1.14+), with the step up onto blocks up to stepHeight.
  function collideModern (entity, world, move, box) {
    const moved = (move.x === 0 && move.y === 0 && move.z === 0) ? { ...move } : collideBoundingBox(world, move.x, move.y, move.z, box)
    const collidedX = move.x !== moved.x
    const collidedZ = move.z !== moved.z
    const landing = move.y !== moved.y && move.y < 0
    const step = stepHeightOf(entity)
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
    collisionContext = { bottom: entity.pos.y, descending: !!entity.control.sneak }
    try {
      moveEntityInContext(entity, world, dx, dy, dz)
    } finally {
      collisionContext = null
    }
  }

  function moveEntityInContext (entity, world, dx, dy, dz) {
    const vel = entity.vel
    const pos = entity.pos

    // A cobweb, berry bush or powder snow touched at the end of the last move (the stuck speed multiplier) scales this
    // one and stops the velocity; isInWeb tells whether this move was slowed. Callers that only keep isInWeb pass it
    // as a cobweb still to act.
    let stuck = entity.stuckSpeedMultiplier
    if (stuck === undefined) stuck = entity.isInWeb ? STUCK_IN_WEB : null
    entity.isInWeb = !!stuck
    entity.stuckSpeedMultiplier = null
    if (stuck) {
      dx *= stuck[0]
      dy *= stuck[1]
      dz *= stuck[2]
      vel.x = 0
      vel.y = 0
      vel.z = 0
    }

    let oldVelX = dx
    const oldVelY = dy
    let oldVelZ = dz

    if (entity.control.sneak && entity.onGround) {
      const step = 0.05

      // In the 3 loops bellow, y offset should be -1, but that doesnt reproduce vanilla behavior.
      for (; dx !== 0 && getSurroundingBBs(world, entityBox(entity).offset(dx, 0, 0)).length === 0; oldVelX = dx) {
        if (dx < step && dx >= -step) dx = 0
        else if (dx > 0) dx -= step
        else dx += step
      }

      for (; dz !== 0 && getSurroundingBBs(world, entityBox(entity).offset(0, 0, dz)).length === 0; oldVelZ = dz) {
        if (dz < step && dz >= -step) dz = 0
        else if (dz > 0) dz -= step
        else dz += step
      }

      while (dx !== 0 && dz !== 0 && getSurroundingBBs(world, entityBox(entity).offset(dx, 0, dz)).length === 0) {
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

    let playerBB = entityBox(entity)
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
          entity.javaBox = playerBB.clone()
        } else {
          const from = pos.clone()
          pos.x += moved.x
          pos.y += moved.y
          pos.z += moved.z
          if (entity.movementsThisTick) entity.movementsThisTick.push({ from, to: pos.clone(), requested: vanilla.axisOrderByRequested ? { x: dx, y: dy, z: dz } : moved })
        }
      } else {
        playerBB = box
      }
      const collidedX = !nearlyEqual(dx, moved.x)
      const collidedZ = !nearlyEqual(dz, moved.z)
      entity.isCollidedHorizontally = collidedX || collidedZ
      entity.minorHorizontalCollision = vanilla.minorCollision && entity.isCollidedHorizontally && isHorizontalCollisionMinor(entity, moved)
      entity.isCollidedVertically = dy !== moved.y
      entity.onGround = entity.isCollidedVertically && dy < 0
      if (vanilla.supportingBlock) checkSupportingBlock(entity, world, playerBB, moved)
      waterAfterMove(entity, world)
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
      if (!vanilla.effectsAfterTravel) stepOn(entity, world)
      applyBlockCollisions(entity, world, playerBB)
      return
    }

    const queryBB = playerBB.clone().extend(dx, dy, dz)
    // 1.13: only the shapes inside the swept box (VoxelShapes drop a move under 1e-7 only against one)
    const surroundingBBs = legacyShapes(world, queryBB)
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
      const surroundingBBs = legacyShapes(world, queryBB)

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
    entity.javaBox = playerBB.clone()
    entity.isCollidedHorizontally = dx !== oldVelX || dz !== oldVelZ
    entity.isCollidedVertically = dy !== oldVelY
    entity.onGround = entity.isCollidedVertically && oldVelY < 0
    waterAfterMove(entity, world)

    if (dx !== oldVelX) vel.x = 0
    if (dz !== oldVelZ) vel.z = 0
    if (dy !== oldVelY) afterFallOn(entity, world, vel)
    stepOn(entity, world)
    applyBlockCollisions(entity, world, playerBB)
  }

  // LivingEntity.checkFallDamage: a player not yet in water looks again where the move ended (and is pushed)
  function waterAfterMove (entity, world) {
    if (entity.isInWater) return
    if (vanilla.unifiedFluidInteraction) {
      // 26.1: the whole fluid interaction again, lava included
      updateFluids(entity, world)
      return
    }
    if (vanilla.fluidHeights) entity.isInWater = updateFluid(entity, world, entityBox(entity), 'water', 0.014).found
    else entity.isInWater = isInWaterApplyCurrent(world, getPlayerBB(entity.pos).contract(0.001, 0.401, 0.001), entity.vel)
  }

  // Block.updateEntityAfterFallOn: slime bounces a falling player back up unless sneaking; others stop it.
  function afterFallOn (entity, world, vel) {
    const blockAtFeet = world.getBlock(getOnPos(entity, f32(0.2)))
    if (blockAtFeet && blockAtFeet.type === slimeBlockId && !entity.control.sneak) {
      if (vel.y < 0) vel.y = -vel.y
    } else if (blockAtFeet && vanilla.bedBounce && bedIds.has(blockAtFeet.type) && !entity.control.sneak) {
      // beds bounce a falling player back up at 0.66F of its speed (1.12+)
      if (vel.y < 0) vel.y = -vel.y * f32(0.66)
    } else {
      vel.y = 0
    }
  }

  // The blocks inside the box (web, bubble columns, soul sand before 1.15), then the block speed factor. Since 1.21.2
  // the blocks act after the whole travel (applyEffectsFromBlocks), not here.
  function applyBlockCollisions (entity, world, playerBB) {
    if (!vanilla.effectsAfterTravel) insideBlocks(entity, world, cellsInBox(playerBB.clone().contract(0.001, 0.001, 0.001)))
    speedFactor(entity, world)
  }

  // 1.21.2+ (Entity.checkInsideBlocks after the travel): each move of the tick is walked axis by axis in the order
  // the collision took them, and a block acts once, when the box (deflated by 1e-5) at the end of a step touches it
  // (any block passed through when a step is longer than a block).
  function insideBlocksAlongMovements (entity, world, startPos) {
    const movements = entity.movementsThisTick && entity.movementsThisTick.length
      ? entity.movementsThisTick
      : [{ from: startPos, to: entity.pos.clone() }]
    entity.movementsThisTick = undefined
    const visited = new Set()
    const deflate = 9.999999747378752e-6
    const check = (from, to) => {
      // BlockGetter.forEachBlockIntersectedBetween: the cells of the box where the step began, then those where it
      // ended, each walked from the corner the step leaves, along the step's axis order
      const box = getPlayerBB(to).contract(deflate, deflate, deflate)
      const step = to.minus(from)
      const long = step.x * step.x + step.y * step.y + step.z * step.z > 0.9999900000002526 * 0.9999900000002526
      const cells = !vanilla.insideBlocksAlongPath || step.x * step.x + step.y * step.y + step.z * step.z < f32(1.0e-5) * f32(1.0e-5)
        ? cellsBetweenClosed(box)
        : [...cellsInDirection(getPlayerBB(from).contract(deflate, deflate, deflate), step), ...cellsInDirection(box, step)]
      insideBlocks(entity, world, cells, visited, long || !vanilla.insideBlocksEndIntersect ? null : box)
    }
    for (const { from, to, requested } of movements) {
      const d = to.minus(from)
      // 1.21.5+: axis by axis, in the order of the collided move (1.21.9+: of the requested one)
      if (vanilla.insideBlocksAxisSteps && requested && (d.x !== 0 || d.y !== 0 || d.z !== 0)) {
        let at = from
        const order = Math.abs(requested.x) < Math.abs(requested.z) ? ['y', 'z', 'x'] : ['y', 'x', 'z']
        for (const axis of order) {
          if (d[axis] === 0) continue
          const next = at.clone()
          next[axis] += d[axis]
          check(at, next)
          at = next
        }
      } else {
        check(from, to)
      }
    }
  }

  // BlockPos.betweenClosed: x fastest, then y, then z
  function cellsBetweenClosed (box) {
    const cells = []
    for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ); z++) {
      for (let y = Math.floor(box.minY); y <= Math.floor(box.maxY); y++) {
        for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX); x++) cells.push(new Vec3(x, y, z))
      }
    }
    return cells
  }

  // BlockPos.betweenCornersInDirection: from the corner the direction leaves, the axes in its step order (y, then the
  // larger horizontal one), the first outermost
  function cellsInDirection (box, direction) {
    const min = { x: Math.floor(box.minX), y: Math.floor(box.minY), z: Math.floor(box.minZ) }
    const max = { x: Math.floor(box.maxX), y: Math.floor(box.maxY), z: Math.floor(box.maxZ) }
    const order = Math.abs(direction.x) < Math.abs(direction.z) ? ['y', 'z', 'x'] : ['y', 'x', 'z']
    const range = axis => {
      const values = []
      for (let v = min[axis]; v <= max[axis]; v++) values.push(v)
      return direction[axis] >= 0 ? values : values.reverse()
    }
    const [first, second, third] = order.map(range)
    const cells = []
    for (const a of first) {
      for (const b of second) {
        for (const c of third) {
          const cell = new Vec3(0, 0, 0)
          cell[order[0]] = a
          cell[order[1]] = b
          cell[order[2]] = c
          cells.push(cell)
        }
      }
    }
    return cells
  }

  // Entity.checkInsideBlocks before 1.21.2: x, then y, then z
  function cellsInBox (box) {
    const cells = []
    for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX); x++) {
      for (let y = Math.floor(box.minY); y <= Math.floor(box.maxY); y++) {
        for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ); z++) cells.push(new Vec3(x, y, z))
      }
    }
    return cells
  }

  // The blocks the box touches act on the player. With visited (1.21.2+), a block counts once per tick, and only if it
  // touches endBox when one is given.
  function insideBlocks (entity, world, cells, visited, endBox) {
    const vel = entity.vel
    for (const cursor of cells) {
      const block = world.getBlock(cursor)
      if (visited) {
        if (!block || block.type === airId) continue
        const key = cursor.x + ',' + cursor.y + ',' + cursor.z
        if (visited.has(key)) continue
        visited.add(key)
        if (endBox && !endBox.intersects(new AABB(cursor.x, cursor.y, cursor.z, cursor.x + 1, cursor.y + 1, cursor.z + 1))) continue
      }
      if (!block) continue
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
        entity.stuckSpeedMultiplier = STUCK_IN_WEB
      } else if (block.type === berryBushId) {
        entity.stuckSpeedMultiplier = STUCK_IN_BERRY_BUSH
      } else if (block.type === powderSnowId) {
        // only while the player's feet are in powder snow
        const feet = world.getBlock(entity.pos)
        if (feet && feet.type === powderSnowId) entity.stuckSpeedMultiplier = STUCK_IN_POWDER_SNOW
      } else if (block.type === bubblecolumnId) {
        const down = !block.metadata
        const aboveBlock = world.getBlock(cursor.offset(0, 1, 0))
        // at the surface: air above; 1.21.5+: no collision and no fluid above
        const surface = vanilla.bubbleSurfaceByShape
          ? !aboveBlock || (aboveBlock.shapes.length === 0 && !fluidOf(aboveBlock, 'water') && !fluidOf(aboveBlock, 'lava'))
          : !aboveBlock || aboveBlock.type === airId
        const bubbleDrag = surface ? physics.bubbleColumnSurfaceDrag : physics.bubbleColumnDrag
        if (down) {
          vel.y = Math.max(bubbleDrag.maxDown, vel.y - bubbleDrag.down)
        } else {
          vel.y = Math.min(bubbleDrag.maxUp, vel.y + bubbleDrag.up)
        }
      }
    }
  }

  function speedFactor (entity, world) {
    const vel = entity.vel
    if (vanilla.blockSpeedFactor) {
      // Entity.getBlockSpeedFactor at the end of the move (1.15+): the block the player is in, else (unless water)
      // the one below that affects its movement
      let factor = blockFactor(entity, world, block => (block.type === soulsandId || block.type === honeyblockId) ? f32(physics.soulsandSpeed) : 1, true)
      const below = blockBelowAffectingMovement(entity, world)
      const onSoulSpeedBlock = !!below && (below.type === soulsandId || below.type === soulSoilId)
      if (vanilla.movementEfficiency) {
        // 1.21+: lerp toward 1 by the movement_efficiency attribute (soul speed sets it on soul blocks)
        const key = mcData.attributesByName.movementEfficiency.resource
        const efficiency = entity.attributes && entity.attributes[key]
          ? f32(attribute.getAttributeValue(entity.attributes[key]))
          : (entity.soulSpeed > 0 && onSoulSpeedBlock ? 1 : 0)
        factor = f32(factor + f32(efficiency * f32(1 - factor)))
      } else if (entity.soulSpeed > 0 && onSoulSpeedBlock) {
        factor = 1 // soul speed boots ignore the soul sand slowdown
      }
      vel.x *= factor
      vel.z *= factor
    }
  }

  // The block under the player that sets its friction, speed and jump factors (getBlockPosBelowThatAffectsMyMovement):
  // one block below before 1.15, 0.5000001 below the feet since (1.20+: 0.500001F).
  function blockBelowAffectingMovement (entity, world) {
    if (vanilla.blockBelowOnPos) return world.getBlock(getOnPos(entity, f32(0.500001)))
    const pos = entity.pos
    return world.getBlock(new Vec3(pos.x, Math.floor(pos.y - (vanilla.blockBelowHalf ? 0.5000001 : 1)), pos.z))
  }

  // Entity.getOnPos(offset): the block offset under the feet; 1.20+ in the column of the supporting block (the one the
  // player stands on, kept from the last landing), except that fences, walls and gates count as they are.
  function getOnPos (entity, offset) {
    const pos = entity.pos
    const support = vanilla.supportingBlock ? entity.supportingBlockPos : null
    if (!support) return new Vec3(Math.floor(pos.x), Math.floor(pos.y - offset), Math.floor(pos.z))
    if (!(offset > f32(1.0e-5))) return support.clone()
    const block = world.getBlock(support)
    if (block && ((offset <= 0.5 && fenceIds.has(block.type)) || wallIds.has(block.type) || gateIds.has(block.type))) return support.clone()
    return new Vec3(support.x, Math.floor(pos.y - offset), support.z)
  }

  // Entity.checkSupportingBlock (1.20+): among the blocks the underside of the box touches, the one whose center is
  // closest to the position (ties to the greater); when none, under where the box was before the horizontal move.
  function checkSupportingBlock (entity, world, box, movement) {
    if (!entity.onGround) {
      entity.onGroundNoBlocks = false
      entity.supportingBlockPos = null
      return
    }
    const underside = new AABB(box.minX, box.minY - 1.0e-6, box.minZ, box.maxX, box.minY, box.maxZ)
    let found = findSupportingBlock(entity, world, underside)
    if (!found && !entity.onGroundNoBlocks) {
      if (movement) {
        found = findSupportingBlock(entity, world, underside.clone().offset(-movement.x, 0, -movement.z))
        entity.supportingBlockPos = found
      }
    } else {
      entity.supportingBlockPos = found
    }
    entity.onGroundNoBlocks = !found
  }

  function findSupportingBlock (entity, world, box) {
    let best = null
    let bestDistance = Number.MAX_VALUE
    const pos = entity.pos
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(box.minY) - 1; cursor.y <= Math.floor(box.maxY); cursor.y++) {
      for (cursor.z = Math.floor(box.minZ); cursor.z <= Math.floor(box.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(box.minX); cursor.x <= Math.floor(box.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (!block || !block.shapes.some(shape => new AABB(...shape).offset(cursor.x, cursor.y, cursor.z).intersects(box))) continue
          const dx = cursor.x + 0.5 - pos.x
          const dy = cursor.y + 0.5 - pos.y
          const dz = cursor.z + 0.5 - pos.z
          const distance = dx * dx + dy * dy + dz * dz
          if (distance < bestDistance || (distance === bestDistance && (!best || compareBlockPos(best, cursor) < 0))) {
            best = cursor.clone()
            bestDistance = distance
          }
        }
      }
    }
    return best
  }

  // Vec3i.compareTo: y, then z, then x
  function compareBlockPos (a, b) {
    if (a.y !== b.y) return a.y - b.y
    return a.z !== b.z ? a.z - b.z : a.x - b.x
  }

  // Block.stepOn while on the ground: slime slows the walk to 0.4 + |vy| * 0.2 unless sneaking. Inside the move before
  // 1.21.2, after the whole travel since (applyEffectsFromBlocks).
  function stepOn (entity, world) {
    if (!entity.onGround || entity.control.sneak) return
    const block = world.getBlock(getOnPos(entity, f32(0.2)))
    if (block && block.type === slimeBlockId && Math.abs(entity.vel.y) < 0.1) {
      const scale = 0.4 + Math.abs(entity.vel.y) * 0.2
      entity.vel.x *= scale
      entity.vel.z *= scale
    }
  }

  // A block factor (speed or jump): the block at the player's position, when it is 1 that of the block below.
  function blockFactor (entity, world, factorOf, skipWater) {
    const inBlock = world.getBlock(entity.pos)
    const own = inBlock ? factorOf(inBlock) : 1
    if (own !== 1 || (skipWater && inBlock && (waterIds.includes(inBlock.type) || inBlock.type === bubblecolumnId))) return own
    const below = blockBelowAffectingMovement(entity, world)
    return below ? factorOf(below) : 1
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
    // Since 1.15 the slowdown comes from the crouching state, which the tick takes from the sneak key of the tick
    // before (LocalPlayer.aiStep reads it before the input updates); before, from the key itself.
    const slow = isMovingSlowly(entity) ? sneakFactor(entity) : 1
    if (vanilla.squareMovementInput) {
      // KeyboardInput normalizes the impulse; LocalPlayer.modifyInput scales it and stretches it to the unit square.
      if (xxa === 0 && zza === 0) return { xxa: 0, zza: 0 }
      let length = f32(Math.sqrt(f32(f32(xxa * xxa) + f32(zza * zza))))
      xxa = f32(xxa / length)
      zza = f32(zza / length)
      const input = f32(0.98)
      xxa = f32(xxa * input)
      zza = f32(zza * input)
      if (entity.usingItem) {
        // an item in use slows the input (itemUseSpeedMultiplier, 0.2F)
        xxa = f32(xxa * ITEM_USE_SLOWDOWN)
        zza = f32(zza * ITEM_USE_SLOWDOWN)
      }
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
    // an item in use scales the impulse by 0.2F, after the sneak factor (before it on 1.21.4)
    const using = entity.usingItem ? ITEM_USE_SLOWDOWN : 1
    if (vanilla.sprintStopsWhenSlow) {
      xxa = f32(f32(xxa * using) * slow)
      zza = f32(f32(zza * using) * slow)
    } else {
      xxa = f32(f32(xxa * slow) * using)
      zza = f32(f32(zza * slow) * using)
    }
    return { xxa: f32(xxa * f32(0.98)), zza: f32(zza * f32(0.98)) }
  }

  const ITEM_USE_SLOWDOWN = Math.fround(0.2)

  function sneakFactor (entity) {
    if (vanilla.sneakingSpeedAttribute) return f32(attributeValue(entity, 'playerSneakingSpeed', attributeValue(entity, 'sneakingSpeed', physics.sneakSpeed)))
    return f32(physics.sneakSpeed)
  }

  const climbableTrapdoorFeature = supportFeature('climbableTrapdoor')
  function isOnLadder (world, pos) {
    const block = world.getBlock(pos)
    if (!block) { return false }
    if (climbableIds.has(block.type)) { return true }
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

  // The movement speed attribute as a float (getSpeed), with the client's own sprint modifier.
  function landSpeed (entity) {
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
    if (isSprinting(entity)) {
      if (!attribute.checkAttributeModifier(playerSpeedAttribute, physics.sprintingUUID)) {
        playerSpeedAttribute = attribute.addAttributeModifier(playerSpeedAttribute, {
          uuid: physics.sprintingUUID,
          amount: physics.sprintSpeed,
          operation: 2
        })
      }
    }
    // Calculate what the speed is (0.1 if no modification)
    return f32(attribute.getAttributeValue(playerSpeedAttribute))
  }

  function moveEntityWithHeading (entity, world, strafe, forward) {
    const vel = entity.vel
    const pos = entity.pos

    // LivingEntity.getEffectiveGravity: slow falling caps it at 0.01 while falling
    const baseGravity = gravityOf(entity)
    const effectiveGravity = (vel.y <= 0 && entity.slowFalling > 0) ? Math.min(baseGravity, 0.01) : baseGravity

    if (entity.isInWater || entity.isInLava) {
      // Water / Lava movement
      const lastY = pos.y
      // Falling when the tick started (1.14+), for the fluid falling adjustment
      const falling = vel.y <= 0
      const sprinting = isSprinting(entity)
      if (entity.isInWater) {
        // The water slowdown and acceleration are floats (0.8F, 0.9F sprinting since 1.13, 0.02F); depth strider
        // moves them toward 0.54600006F and the speed in float.
        let inertia = f32(vanilla.waterSprintSlowdown && sprinting ? 0.9 : physics.waterInertia)
        let acceleration = f32(physics.liquidAcceleration)
        if (vanilla.waterMovementEfficiency) {
          // 1.21+: the water_movement_efficiency attribute, depth strider adding 0.33333334F per level
          let efficiency = f32(attributeValue(entity, 'waterMovementEfficiency', Math.min(f32(f32(0.33333334) * entity.depthStrider), 1)))
          if (!entity.onGround) efficiency = f32(efficiency * f32(0.5))
          if (efficiency > 0) {
            inertia = f32(inertia + f32(f32(f32(0.54600006) - inertia) * efficiency))
            acceleration = f32(acceleration + f32(f32(landSpeed(entity) - acceleration) * efficiency))
          }
        } else {
          let strider = f32(Math.min(entity.depthStrider, 3))
          if (!entity.onGround) strider = f32(strider * f32(0.5))
          if (strider > 0) {
            inertia = f32(inertia + f32(f32(f32(f32(0.54600006) - inertia) * strider) / 3))
            acceleration = f32(acceleration + f32(f32(f32(landSpeed(entity) - acceleration) * strider) / 3))
          }
        }
        if (entity.dolphinsGrace > 0) inertia = f32(0.96)

        applyHeading(entity, strafe, forward, acceleration)
        moveEntity(entity, world, vel.x, vel.y, vel.z)
        vel.x *= inertia
        vel.y *= f32(physics.waterInertia)
        vel.z *= inertia
        if (vanilla.proportionalLiquidGravity) {
          // getFluidFallingAdjustedMovement: gravity / 16, or -0.003 when that is about where it would settle
          if (!sprinting) {
            const gravity = effectiveGravity
            const isFalling = vanilla.fluidFallingBeforeMove ? falling : vel.y <= 0
            if (isFalling && Math.abs(vel.y - 0.005) >= 0.003 && Math.abs(vel.y - gravity / 16) < 0.003) vel.y = -0.003
            else vel.y -= gravity / 16
          }
        } else {
          vel.y -= physics.waterGravity
        }
      } else {
        applyHeading(entity, strafe, forward, f32(physics.liquidAcceleration))
        moveEntity(entity, world, vel.x, vel.y, vel.z)
        const gravity = effectiveGravity
        if (vanilla.lavaFluidHeight && entity.lavaHeight <= 0.4) {
          // 1.16+: in lava no deeper than the jump threshold, the water-like drag and falling adjustment
          vel.x *= physics.lavaInertia
          vel.y *= f32(physics.waterInertia)
          vel.z *= physics.lavaInertia
          if (!sprinting) {
            if (falling && Math.abs(vel.y - 0.005) >= 0.003 && Math.abs(vel.y - gravity / 16) < 0.003) vel.y = -0.003
            else vel.y -= gravity / 16
          }
        } else {
          vel.x *= physics.lavaInertia
          vel.y *= physics.lavaInertia
          vel.z *= physics.lavaInertia
        }
        vel.y -= vanilla.proportionalLiquidGravity ? gravity / 4 : physics.lavaGravity
      }

      if (entity.isCollidedHorizontally && doesNotCollide(world, pos.offset(vel.x, vel.y + f32(0.6) - pos.y + lastY, vel.z))) {
        vel.y = f32(physics.outOfLiquidImpulse) // jump out of liquid
      }
    } else if (entity.elytraFlying) {
      // LivingEntity.updateFallFlyingMovement: the look vector and pitch in float, the lift from cos(pitch)^2 (a float
      // through Mth.cos until 1.18, Math.cos since)
      const look = viewVector(entity)
      const pitch = f32(pitchDegrees(entity) * DEG_TO_RAD_F)
      const lookHorizontal = Math.sqrt(look.x * look.x + look.z * look.z)
      const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
      const lookLength = Math.sqrt(look.x * look.x + look.y * look.y + look.z * look.z)
      let lift
      if (vanilla.elytraDoubleCos) {
        const cos = Math.cos(pitch)
        lift = vanilla.elytraSquareOnly ? cos * cos : cos * cos * Math.min(1, lookLength / 0.4)
      } else {
        const cos = mthCos(pitch)
        lift = f32(cos * cos * Math.min(1, lookLength / 0.4))
      }
      vel.y += effectiveGravity * (-1.0 + lift * 0.75)
      if (vel.y < 0 && lookHorizontal > 0) {
        const down = vel.y * -0.1 * lift
        vel.x += look.x * down / lookHorizontal
        vel.y += down
        vel.z += look.z * down / lookHorizontal
      }
      if (pitch < 0 && lookHorizontal > 0) {
        const up = horizontalSpeed * -mthSin(pitch) * 0.04
        vel.x += -look.x * up / lookHorizontal
        vel.y += up * 3.2
        vel.z += -look.z * up / lookHorizontal
      }
      if (lookHorizontal > 0) {
        vel.x += (look.x / lookHorizontal * horizontalSpeed - vel.x) * 0.1
        vel.z += (look.z / lookHorizontal * horizontalSpeed - vel.z) * 0.1
      }
      vel.x *= f32(0.99)
      vel.y *= f32(0.98)
      vel.z *= f32(0.99)
      moveEntity(entity, world, vel.x, vel.y, vel.z)
      // 1.15+ the client ends the glide on the ground at the start of the next tick (updateFallFlying); before, the
      // server ends it, which is approximated by ending it on landing
      if (!vanilla.clientStartsGliding && entity.onGround) entity.elytraFlying = false
    } else {
      // Normal movement
      let acceleration = 0.0
      let inertia = 0.0
      const blockUnder = blockBelowAffectingMovement(entity, world)
      const slipperiness = f32(blockUnder ? (blockSlipperiness[blockUnder.type] || physics.defaultSlipperiness) : physics.defaultSlipperiness)
      if (entity.onGround) {
        const attributeSpeed = landSpeed(entity)
        inertia = f32(slipperiness * f32(0.91))
        // 1.14+: getFrictionInfluencedSpeed, speed * (0.21600002F / f^3) of the slipperiness; before, of it times 0.91
        const f = vanilla.floatMoveRelative ? inertia : slipperiness
        acceleration = f32(attributeSpeed * f32(vanilla.groundFriction / f32(f32(f * f) * f)))
        if (acceleration < 0) acceleration = 0 // acceleration should not be negative
      } else {
        acceleration = isSprinting(entity) ? vanilla.airSprintSpeed : f32(physics.airborneAcceleration)
        inertia = f32(physics.airborneInertia)
      }

      applyHeading(entity, strafe, forward, acceleration)

      if (isOnLadder(world, pos)) {
        // clamped to 0.15F; vertically to -0.15F since 1.14, -0.15 before
        const max = f32(physics.ladderMaxSpeed)
        vel.x = math.clamp(-max, vel.x, max)
        vel.z = math.clamp(-max, vel.z, max)
        vel.y = Math.max(vel.y, vanilla.climbFloatVertical ? -max : -physics.ladderMaxSpeed)
        // sneaking stops the slide down, except inside scaffolding
        const inBlock = world.getBlock(pos)
        if (vel.y < 0 && entity.control.sneak && !(inBlock && inBlock.type === scaffoldingId)) vel.y = 0
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
        vel.y -= effectiveGravity
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

  // ---- fluids as FluidState sees them (1.13+) ----

  // { amount, falling } of the block's fluid of that kind, or null
  function fluidOf (block, kind) {
    if (!block) return null
    if (kind === 'water') {
      if (waterLike.has(block.type) || block.isWaterlogged) return { amount: 8, falling: false }
      if (!waterIds.includes(block.type)) return null
    } else if (!lavaIds.includes(block.type)) return null
    const level = block.metadata
    return level === 0 ? { amount: 8, falling: false } : level >= 8 ? { amount: 8, falling: true } : { amount: 8 - level, falling: false }
  }

  const ownHeight = fluid => fluid ? f32(fluid.amount / 9) : 0

  // FlowingFluid.getHeight: 1 under the same fluid, else its own height
  function fluidHeight (world, pos, fluid, kind) {
    return fluidOf(world.getBlock(pos.offset(0, 1, 0)), kind) ? 1 : ownHeight(fluid)
  }

  const HORIZONTAL = [[0, -1], [1, 0], [0, 1], [-1, 0]] // north, east, south, west

  // FlowingFluid.getFlow
  function fluidFlow (world, pos, fluid, kind) {
    let x = 0
    let z = 0
    const own = ownHeight(fluid)
    for (const [dx, dz] of HORIZONTAL) {
      const neighborPos = pos.offset(dx, 0, dz)
      const neighborBlock = world.getBlock(neighborPos)
      const neighbor = fluidOf(neighborBlock, kind)
      // affectsFlow: the same fluid or none
      if (!neighbor && isOtherFluid(neighborBlock, kind)) continue
      let height = ownHeight(neighbor)
      let d = 0
      if (height === 0) {
        if (!neighborBlock || neighborBlock.shapes.length === 0) {
          const belowBlock = world.getBlock(neighborPos.offset(0, -1, 0))
          const below = fluidOf(belowBlock, kind)
          if (below || !isOtherFluid(belowBlock, kind)) {
            height = ownHeight(below)
            if (height > 0) d = f32(own - f32(height - f32(0.8888889)))
          }
        }
      } else if (height > 0) {
        d = f32(own - height)
      }
      if (d !== 0) {
        x += f32(dx * d)
        z += f32(dz * d)
      }
    }
    let flow = new Vec3(x, 0, z)
    if (fluid.falling) {
      for (const [dx, dz] of HORIZONTAL) {
        if (isSolidFace(world, pos.offset(dx, 0, dz), kind) || isSolidFace(world, pos.offset(dx, 1, dz), kind)) {
          flow = normalize(flow).translate(0, -6, 0)
          break
        }
      }
    }
    return normalize(flow)
  }

  function isOtherFluid (block, kind) {
    return !!fluidOf(block, kind === 'water' ? 'lava' : 'water')
  }

  function isSolidFace (world, pos, kind) {
    const block = world.getBlock(pos)
    if (!block || fluidOf(block, kind)) return false
    if (block.type === blocksByName.ice.id) return false
    return block.shapes.length === 1 && block.shapes[0].every((v, i) => v === (i < 3 ? 0 : 1))
  }

  // Vec3.normalize (the length in float before 1.17)
  function normalize (v) {
    const lengthSqr = v.x * v.x + v.y * v.y + v.z * v.z
    const length = vanilla.normalizeFloatSqrt ? f32(Math.sqrt(lengthSqr)) : Math.sqrt(lengthSqr)
    return length < 1.0e-4 ? new Vec3(0, 0, 0) : new Vec3(v.x / length, v.y / length, v.z / length)
  }

  // Entity.updateFluidHeightAndDoFluidPushing: whether the fluid reaches the box (deflated by 0.001), how high above
  // its bottom, and the current's push on the velocity.
  function updateFluid (entity, world, box, kind, speed) {
    // 26.1 (EntityFluidInteraction): the top in double, the height from the undeflated bottom, in the fluid only when
    // above it, and no current under 1e-5 squared
    const unified = vanilla.unifiedFluidInteraction
    const bottom = box.minY
    box = box.clone().contract(0.001, 0.001, 0.001)
    let height = 0
    let found = false
    let flow = new Vec3(0, 0, 0)
    let count = 0
    const cursor = new Vec3(0, 0, 0)
    for (cursor.x = Math.floor(box.minX); cursor.x < Math.ceil(box.maxX); cursor.x++) {
      for (cursor.y = Math.floor(box.minY); cursor.y < Math.ceil(box.maxY); cursor.y++) {
        for (cursor.z = Math.floor(box.minZ); cursor.z < Math.ceil(box.maxZ); cursor.z++) {
          const fluid = fluidOf(world.getBlock(cursor), kind)
          if (!fluid) continue
          const top = unified ? cursor.y + fluidHeight(world, cursor, fluid, kind) : f32(cursor.y + fluidHeight(world, cursor, fluid, kind))
          if (top < box.minY) continue
          found = true
          height = Math.max(top - (unified ? bottom : box.minY), height)
          let push = fluidFlow(world, cursor.clone(), fluid, kind)
          if (height < 0.4) push = push.scaled(height)
          flow = flow.plus(push)
          count++
        }
      }
    }
    if (unified) found = height > 0
    if (unified ? count !== 0 && !(flow.x * flow.x + flow.y * flow.y + flow.z * flow.z < 9.999999747378752e-6) : flow.norm() > 0) {
      if (count > 0) flow = flow.scaled(1 / count)
      flow = flow.scaled(speed)
      const vel = entity.vel
      if (vanilla.minimumFluidPush && Math.abs(vel.x) < 0.003 && Math.abs(vel.z) < 0.003 && flow.norm() < 0.0045000000000000005) {
        flow = normalize(flow).scaled(0.0045000000000000005)
      }
      vel.x += flow.x
      vel.y += flow.y
      vel.z += flow.z
    }
    return { found, height }
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

  // Water then lava, with their currents (1.16+)
  function updateFluids (entity, world) {
    const box = entityBox(entity)
    const water = updateFluid(entity, world, box, 'water', 0.014)
    entity.isInWater = water.found
    entity.waterHeight = water.height
    const lava = updateFluid(entity, world, box, 'lava', 0.0023333333333333335)
    entity.isInLava = lava.height > 0
    entity.lavaHeight = lava.height
  }

  // ---- sprinting (LocalPlayer.aiStep) ----

  // The sprint state (vanilla's isSprinting) when tracked, else the sprint key.
  const isSprinting = entity => vanilla.sprintState ? !!entity.sprinting : !!entity.control.sprint

  // Whether the eyes are in water (Entity.updateFluidOnEyes / isEyeInFluid).
  function eyeInWater (entity, world) {
    const pos = entity.pos
    const eyeHeight = vanilla.crouchPose ? POSE_EYE_HEIGHT[entity.pose || 'standing'] || f32(1.62) : f32(1.62)
    let eyeY = pos.y + eyeHeight
    if (vanilla.eyeFluidOffset) eyeY -= 0.1111111119389534 // 1.16-1.20
    const cell = new Vec3(Math.floor(pos.x), Math.floor(eyeY), Math.floor(pos.z))
    const fluid = fluidOf(world.getBlock(cell), 'water')
    if (!fluid) return false
    const height = fluidHeight(world, cell, fluid, 'water')
    if (vanilla.eyeFluidLegacy) return eyeY < f32(f32(cell.y + height) + f32(0.11111111)) // 1.13-1.15
    return f32(cell.y + height) > eyeY
  }

  // LocalPlayer.isHorizontalCollisionMinor (1.18+): the move went within 8 degrees of the input's direction.
  function isHorizontalCollisionMinor (entity, moved) {
    const radians = f32(yawDegrees(entity) * DEG_TO_RAD_F)
    const sin = mthSin(radians)
    const cos = mthCos(radians)
    const xxa = entity.xxa || 0
    const zza = entity.zza || 0
    const x = xxa * cos - zza * sin
    const z = zza * cos + xxa * sin
    const inputSqr = x * x + z * z
    const movedSqr = moved.x * moved.x + moved.z * moved.z
    if (inputSqr < 9.999999747378752e-6 || movedSqr < 9.999999747378752e-6) return false
    return Math.acos((x * moved.x + z * moved.z) / Math.sqrt(inputSqr * movedSqr)) < 0.13962633907794952
  }

  // The sprint state from the keys, before the tick moves (only the sprint key starts it; the double tap is left out).
  function updateSprinting (entity, world) {
    const control = entity.control
    const forwardKeys = (control.forward ? 1 : 0) - (control.back ? 1 : 0)
    const food = entity.food === undefined || entity.food > 6
    const blind = entity.blindness > 0
    const inWater = entity.isInWater
    const underWater = vanilla.fluidHeights && inWater && eyeInWater(entity, world)
    const collided = entity.isCollidedHorizontally && !(vanilla.minorCollision && entity.minorHorizontalCollision)
    const slow = isMovingSlowly(entity)
    let sprinting = !!entity.sprinting

    if (!vanilla.fluidHeights) {
      // before 1.13: the forward input (0.3 while sneaking) must be at least 0.8
      const forward = f32(f32(forwardKeys * (control.sneak ? f32(0.3) : 1)) * (entity.usingItem ? ITEM_USE_SLOWDOWN : 1))
      if (!sprinting && forward >= 0.8 && food && !blind && !entity.usingItem && control.sprint) sprinting = true
      if (sprinting && (forward < 0.8 || entity.isCollidedHorizontally || !food)) sprinting = false
    } else if (vanilla.sprintByForwardImpulse) {
      // 1.21.5+: any forward impulse; not in shallow water, not sneaking unless under water
      const hasForward = forwardKeys > 0
      const possible = !blind && food
      const shallow = inWater && !underWater
      if (!sprinting && hasForward && possible && !shallow && !entity.usingItem && !(entity.elytraFlying && !underWater) && (!slow || underWater) && control.sprint) sprinting = true
      if (sprinting && (!possible || shallow || !hasForward || collided)) sprinting = false
    } else {
      // 1.13-1.21.4: at least 0.8 forward to start (any under water), any forward to keep
      const using = entity.usingItem ? ITEM_USE_SLOWDOWN : 1
      const sneak = slow ? sneakFactor(entity) : 1
      const forward = vanilla.sprintStopsWhenSlow ? f32(f32(forwardKeys * using) * sneak) : f32(f32(forwardKeys * sneak) * using)
      const hasForward = forward > f32(1.0e-5)
      if (vanilla.sprintStopsWhenSlow && (slow || blind || entity.elytraFlying || (entity.usingItem && !underWater))) sprinting = false
      const enough = underWater ? hasForward : forward >= 0.8
      const canStart = !sprinting && enough && food && !blind && !entity.usingItem && !(vanilla.sprintNotWhileGliding && entity.elytraFlying) &&
        (!vanilla.sprintStopsWhenSlow || !slow || underWater)
      if ((!inWater || underWater) && canStart && control.sprint) sprinting = true
      if (sprinting) {
        const stop = vanilla.sprintState13 ? forward < 0.8 || !food : !hasForward || !food
        if (stop || collided || (inWater && !underWater)) sprinting = false
      }
    }
    entity.sprinting = sprinting
  }

  // ---- pose (1.14+) ----

  // LocalPlayer.isMovingSlowly: crouching (1.15+ the flag set at the tick start; the key before), or crawling
  function isMovingSlowly (entity) {
    const crawling = vanilla.crouchPose && entity.pose === 'swimming' && !entity.isInWater
    if (!vanilla.crouchLag) return !!entity.control.sneak || crawling
    return !!entity.crouching || crawling
  }

  // Player.canPlayerFitWithinBlocksAndEntitiesWhen: the pose's box, deflated by 1e-7, touches no block
  function fitsPose (entity, world, pose) {
    const box = getPlayerBB(entity.pos, POSE_HEIGHT[pose]).contract(1.0e-7, 1.0e-7, 1.0e-7)
    const saved = collisionContext
    collisionContext = { bottom: entity.pos.y, descending: !!entity.control.sneak }
    try {
      return !getSurroundingBBs(world, box).some(shape => shape.intersects(box))
    } finally {
      collisionContext = saved
    }
  }

  // LocalPlayer.aiStep: crouching from the sneak key of the tick before, or forced where standing does not fit
  function updateCrouching (entity, world) {
    const shift = !!entity.isCrouching // the sneak key the last tick ended with
    entity.crouching = !(entity.pose === 'swimming' && entity.isInWater) && fitsPose(entity, world, 'crouching') &&
      (shift || !fitsPose(entity, world, 'standing'))
  }

  // Player.updatePlayerPose at the end of the tick
  function updatePose (entity, world) {
    if (!fitsPose(entity, world, 'swimming')) return
    const desired = entity.elytraFlying ? 'fall_flying' : entity.control.sneak ? 'crouching' : 'standing'
    const pose = fitsPose(entity, world, desired) ? desired : fitsPose(entity, world, 'crouching') ? 'crouching' : 'swimming'
    if (pose !== entity.pose) entity.javaBox = null // the box is rebuilt for the new size
    entity.pose = pose
  }

  // Which jump the jump key makes: true swims up (jumpInLiquid), false jumps from the ground, null neither.
  function fluidJump (entity) {
    const threshold = 0.4 // getFluidJumpThreshold: the player's eyes are above 0.4
    if (vanilla.lavaFluidHeight) {
      // 1.16+: by the height of the fluid the player is in
      const height = entity.isInLava ? entity.lavaHeight : entity.waterHeight
      const deepWater = entity.isInWater && height > 0
      if (deepWater && !(entity.onGround && !(height > threshold))) return true
      if (entity.isInLava && !(entity.onGround && !(height > threshold))) return true
      return (entity.onGround || (deepWater && height <= threshold)) ? false : null
    }
    if (vanilla.fluidHeights) {
      // 1.13-1.15: swims in water deeper than 0.4 (or when not on the ground), then lava, else jumps in shallow water
      const height = entity.waterHeight
      if (height > 0 && (!entity.onGround || height > threshold)) return true
      if (entity.isInLava) return true
      return (entity.onGround || (height > 0 && height <= threshold)) ? false : null
    }
    if (entity.isInWater || entity.isInLava) return true
    return entity.onGround ? false : null
  }

  physics.simulatePlayer = (entity, world) => {
    const vel = entity.vel
    const pos = entity.pos
    const startPos = pos.clone()
    boxHeight = vanilla.crouchPose ? POSE_HEIGHT[entity.pose] || physics.playerHeight : physics.playerHeight
    entity.movementsThisTick = vanilla.effectsAfterTravel ? [] : undefined

    if (vanilla.fluidHeights) {
      // 1.13+: the fluid heights in the box deflated by 0.001 (Entity.updateFluidHeightAndDoFluidPushing)
      const box = entityBox(entity)
      if (vanilla.lavaFluidHeight) {
        updateFluids(entity, world)
      } else {
        const water = updateFluid(entity, world, box, 'water', 0.014)
        entity.isInWater = water.found
        entity.waterHeight = water.height
      }
      if (!vanilla.lavaFluidHeight && !vanilla.lavaInsideBlocks) {
        entity.isInLava = isMaterialInBB(world, box.clone().contract(0.1, 0.4, 0.1), lavaIds)
      }
      // 1.14-1.15: isInLava stays as the last move's block checks left it
    } else {
      const waterBB = getPlayerBB(pos).contract(0.001, 0.401, 0.001)
      const lavaBB = getPlayerBB(pos).contract(0.1, 0.4, 0.1)
      entity.isInWater = isInWaterApplyCurrent(world, waterBB, vel)
      entity.isInLava = isMaterialInBB(world, lavaBB, lavaIds)
    }

    if (vanilla.crouchLag) updateCrouching(entity, world)
    if (vanilla.sprintState) updateSprinting(entity, world)

    // 1.15+: pressing jump in the air with an elytra starts gliding at once (LocalPlayer.aiStep, tryToStartFallFlying);
    // before, the server starts it
    if (vanilla.clientStartsGliding && entity.control.jump && !entity.jumpHeld && !entity.elytraFlying && entity.elytraEquipped &&
      !entity.onGround && !entity.isInWater && !entity.levitation && !isOnLadder(world, entity.pos)) {
      entity.elytraFlying = true
    }

    // 1.13+: sneaking in water sinks (LocalPlayer.aiStep, goDownInWater)
    if (vanilla.fluidHeights && entity.isInWater && entity.control.sneak) vel.y -= f32(0.04)

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
      const liquidJump = fluidJump(entity)
      if (liquidJump) {
        vel.y += f32(0.04)
      } else if (liquidJump === false && entity.jumpTicks === 0) {
        // honey's jump factor 0.5F (the block the player is in, else the one below)
        const jumpFactor = blockFactor(entity, world, block => block.type === honeyblockId ? f32(physics.honeyblockJumpSpeed) : 1, false)
        const strength = vanilla.playerAttributes ? f32(attributeValue(entity, 'jumpStrength', f32(0.42))) : f32(0.42)
        const power = f32(strength * jumpFactor)
        const boost = entity.jumpBoost > 0 ? f32(f32(0.1) * entity.jumpBoost) : 0
        const jump = vanilla.jumpBoostFloatSum ? f32(power + boost) : power + boost
        // 1.20.5+: no jump at all without jump power
        const jumps = !(vanilla.jumpSprintDouble && jump <= f32(1.0e-5))
        if (jumps) vel.y = vanilla.jumpKeepsVelocity ? Math.max(jump, vel.y) : jump
        if (jumps && isSprinting(entity)) {
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
    entity.xxa = strafe
    entity.zza = forward

    // 1.15+ only the server ends a glide (the flag it syncs); before, the engine ends it like the server would
    if (!vanilla.clientStartsGliding) entity.elytraFlying = entity.elytraFlying && entity.elytraEquipped && !entity.onGround && !entity.levitation

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

    if (vanilla.effectsAfterTravel) {
      stepOn(entity, world)
      insideBlocksAlongMovements(entity, world, startPos)
    }

    if (!vanilla.lavaFluidHeight) {
      // Before 1.16 the lava state is that of where the tick ended: checked on demand (shrunk box) before 1.14, set by
      // the blocks inside the box after the move on 1.14-1.15.
      const box = entityBox(entity).clone()
      entity.isInLava = vanilla.lavaInsideBlocks
        ? isMaterialInBB(world, box.contract(0.001, 0.001, 0.001), lavaIds)
        : isMaterialInBB(world, box.contract(0.1, 0.4, 0.1), lavaIds)
    }

    // The jump key the next tick compares with
    entity.jumpHeld = !!entity.control.jump

    // The sneak key the next tick's crouching comes from
    entity.isCrouching = !!entity.control.sneak && !entity.elytraFlying
    if (vanilla.crouchPose) updatePose(entity, world)

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
    this.stuckSpeedMultiplier = bot.entity.stuckSpeedMultiplier
    this.isCrouching = bot.entity.isCrouching ?? false
    this.jumpHeld = bot.entity.jumpHeld ?? false
    this.pose = bot.entity.javaPose
    this.crouching = bot.entity.crouching ?? false
    // The sprint state (vanilla's isSprinting): the sprint key starts it, the game's conditions stop it
    this.sprinting = bot.entity.sprinting ?? false
    this.minorHorizontalCollision = bot.entity.minorHorizontalCollision ?? false
    // The block the player stands on (1.20+) and whether its last landing found none
    this.supportingBlockPos = bot.entity.supportingBlockPos ?? null
    this.onGroundNoBlocks = bot.entity.onGroundNoBlocks ?? false
    this.isCollidedHorizontally = bot.entity.isCollidedHorizontally
    this.isCollidedVertically = bot.entity.isCollidedVertically
    this.elytraFlying = bot.entity.elytraFlying
    this.jumpTicks = bot.jumpTicks
    this.jumpQueued = bot.jumpQueued
    this.fireworkRocketDuration = bot.fireworkRocketDuration
    // Bedrock engine state (float32 collision box, swim pose, pending block slowdowns); undefined on Java.
    this.bedrock = bot.bedrockPhysicsState
    // The Java engine's kept bounding box (before 1.17 vanilla moves the box and centers the position on it).
    this.javaBox = bot.javaPhysicsBox
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
    this.blindness = getEffectLevel(mcData, 'Blindness', effects)
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
    bot.entity.stuckSpeedMultiplier = this.stuckSpeedMultiplier
    bot.entity.isCrouching = this.isCrouching
    bot.entity.jumpHeld = this.jumpHeld
    bot.entity.javaPose = this.pose
    bot.entity.crouching = this.crouching
    bot.entity.sprinting = this.sprinting
    bot.entity.minorHorizontalCollision = this.minorHorizontalCollision
    bot.entity.supportingBlockPos = this.supportingBlockPos
    bot.entity.onGroundNoBlocks = this.onGroundNoBlocks
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
    if (this.javaBox !== undefined) bot.javaPhysicsBox = this.javaBox
  }
}

// The Bedrock classes load with the engine on first use, so requiring the package for Java needs neither the engine
// nor the Node.js it runs on.
module.exports = { Physics, PlayerState }
for (const name of ['BedrockRewind', 'BedrockSession']) {
  Object.defineProperty(module.exports, name, { enumerable: true, get: () => bedrock()[name] })
}
