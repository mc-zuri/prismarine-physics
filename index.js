const Vec3 = require('vec3').Vec3
const AABB = require('./lib/aabb')
const math = require('./lib/math')
const javaMath = require('./lib/java-math')
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
  const pointedDripstoneId = blocksByName.pointed_dripstone ? blocksByName.pointed_dripstone.id : -1 // 1.17+
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
    legacyPlayerSize: supportFeature('legacyPlayerSize'),
    legacyViewVector: supportFeature('legacyViewVector'),
    elytraLegacyLift: supportFeature('elytraLegacyLift'),
    legacyWorldBorder: supportFeature('legacyWorldBorder'),
    autoJump: supportFeature('autoJump'),
    javaBoats: supportFeature('javaBoats'),
    riddenDamping: supportFeature('riddenDamping'),
    airSpeedLastTick: supportFeature('airSpeedLastTick'),
    clientRearingLegacy: supportFeature('clientRearingLegacy'),
    passengerSprintVehicle: supportFeature('passengerSprintVehicle'),
    passengerNoPushOut: supportFeature('passengerNoPushOut'),
    passengerNoCrouch: supportFeature('passengerNoCrouch'),
    shiftKeyWhileGliding: supportFeature('shiftKeyWhileGliding'),
    entityAttachments: supportFeature('entityAttachments'),
    attachmentPoints: supportFeature('passengerAttachmentPoints'),
    autoJumpJumpFactor: supportFeature('autoJumpJumpFactor'),
    autoJumpFloatFastInvSqrt: supportFeature('autoJumpFloatFastInvSqrt'),
    autoJumpExactInvSqrt: supportFeature('autoJumpExactInvSqrt'),
    moveWhenBlocked: supportFeature('moveWhenFullyBlocked'),
    collisionEpsilonVelocity: supportFeature('collisionEpsilonVelocityReset'),
    waterSprintSlowdown: supportFeature('proportionalLiquidGravity'),
    waterMovementEfficiency: supportFeature('waterMovementEfficiency'),
    proportionalLiquidGravity: supportFeature('proportionalLiquidGravity'),
    fluidFallingBeforeMove: supportFeature('modernMove'),
    climbFloatVertical: supportFeature('modernMove'),
    crouchLag: supportFeature('crouchLag'),
    insideBlocksInset1e7: supportFeature('insideBlocksInset1e7'),
    swiftSneak: supportFeature('swiftSneak'),
    restitution: supportFeature('restitutionBounce'),
    backOffThinBox: supportFeature('playerPhysicsAttributes'),
    backOffAboveGround: supportFeature('lavaFluidHeight'),
    backOffOnlyDown: supportFeature('sprintNotWhileGliding'),
    pushOutOfBlocks: supportFeature('lavaFluidHeight'),
    thinLadder: supportFeature('velocityThreshold005'),
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
    eyeInWaterLag: supportFeature('lavaFluidHeight'),
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
  const stepHeightOf = entity => entity.stepHeight !== undefined ? f32(entity.stepHeight) : vanilla.playerAttributes ? f32(attributeValue(entity, 'stepHeight', physics.stepHeight)) : physics.stepHeight

  // Entity.calculateViewVector from the vanilla rotation (Mth trig, float products)
  function viewVector (entity) {
    if (vanilla.legacyViewVector) {
      // before 1.13: the yaw turned by PI, the pitch's cosine negated
      const turned = f32(f32(-yawDegrees(entity) * DEG_TO_RAD_F) - PI_F)
      const negPitch = f32(-pitchDegrees(entity) * DEG_TO_RAD_F)
      const negCosPitch = -mthCos(negPitch)
      return new Vec3(f32(mthSin(turned) * negCosPitch), mthSin(negPitch), f32(mthCos(turned) * negCosPitch))
    }
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
  let boxHalfWidth = physics.playerHalfWidth
  let boxScale = 1 // 1.20.5+ the scale attribute scales the dimensions

  function getPlayerBB (pos, height = boxHeight) {
    const w = boxHalfWidth
    return new AABB(-w, 0, -w, w, height, w).offset(pos.x, pos.y, pos.z)
  }

  // The moving player, for blocks whose collision depends on it (EntityCollisionContext): where its feet are when the
  // move starts and whether it is descending (sneaking).
  let collisionContext = null

  const SCAFFOLDING_STABLE = [[0, 0.875, 0, 1, 1, 1], [0, 0, 0, 0.125, 1, 0.125], [0.875, 0, 0, 1, 1, 0.125], [0, 0, 0.875, 0.125, 1, 1], [0.875, 0, 0.875, 1, 1, 1]]
  const SCAFFOLDING_UNSTABLE_BOTTOM = [[0, 0, 0, 1, 0.125, 1]]

  // Mth.getSeed with Java's long arithmetic
  function blockSeed (x, y, z) {
    let l = BigInt.asIntN(64, BigInt(Math.imul(x, 3129871)) ^ (BigInt(z) * 116129781n) ^ BigInt(y))
    l = BigInt.asIntN(64, l * l * 42317861n + l * 11n)
    return l >> 16n
  }

  // BlockBehaviour offsetType XZ: a per-position shift of up to maxOffset
  function horizontalOffset (x, z, maxOffset) {
    const seed = blockSeed(x, 0, z)
    const clamp = v => Math.max(-maxOffset, Math.min(maxOffset, v))
    return [clamp((f32(Number(seed & 15n) / 15) - 0.5) * 0.5), clamp((f32(Number((seed >> 8n) & 15n) / 15) - 0.5) * 0.5)]
  }

  // PointedDripstoneBlock.getShape (its collision shape): a column by thickness, shifted by the block's offset
  function pointedDripstoneShapes (block, blockPos) {
    const props = block.getProperties()
    const up = props.vertical_direction === 'up'
    const column = { tip_merge: [6, 0, 16], tip: up ? [6, 0, 11] : [6, 5, 16], frustum: [8, 0, 16], middle: [10, 0, 16], base: [12, 0, 16] }[props.thickness] || [6, 0, 16]
    const [size, minY, maxY] = column
    const [ox, oz] = horizontalOffset(blockPos.x, blockPos.z, 0.125)
    const lo = (16 - size) / 2 / 16
    const hi = (16 + size) / 2 / 16
    return [[lo + ox, minY / 16, lo + oz, hi + ox, maxY / 16, hi + oz]]
  }

  function collisionContextOf (entity) {
    return { x: entity.pos.x, z: entity.pos.z, bottom: entity.pos.y, descending: !!entity.control.sneak, fallDistance: entity.fallDistance || 0, walksOnPowderSnow: !!entity.leatherBoots, entities: entity.entities, standsOnLava: !!entity.standsOnLava }
  }

  const POWDER_SNOW_FALLING = [[0, 0, 0, 1, 0.8999999761581421, 1]]
  const FULL_BLOCK = [[0, 0, 0, 1, 1, 1]]

  function collisionShapesOf (block, blockPos) {
    if (block.type === powderSnowId && collisionContext) {
      // PowderSnowBlock.getCollisionShape: solid under a player falling more than 2.5 blocks (0.9 tall), or under
      // leather boots from above unless descending; else nothing
      if (collisionContext.fallDistance > 2.5) return POWDER_SNOW_FALLING
      if (collisionContext.walksOnPowderSnow && collisionContext.bottom > blockPos.y + 1 - 9.999999747378752e-6 && !collisionContext.descending) return FULL_BLOCK
      return []
    }
    if (block.type === scaffoldingId && collisionContext) {
      // ScaffoldingBlock.getCollisionShape: solid from above unless descending; a bottom piece shows its base slab
      const above = shapeTop => collisionContext.bottom > blockPos.y + shapeTop - 9.999999747378752e-6
      if (above(1) && !collisionContext.descending) return SCAFFOLDING_STABLE
      const props = block.getProperties()
      return String(props.distance) !== '0' && (props.bottom === true || props.bottom === 'true') && above(0) ? SCAFFOLDING_UNSTABLE_BOTTOM : []
    }
    if (block.type === pointedDripstoneId) return pointedDripstoneShapes(block, blockPos)
    if (collisionContext && collisionContext.standsOnLava && lavaIds.includes(block.type) && block.metadata === 0 &&
      collisionContext.bottom > blockPos.y + 0.5 - 9.999999747378752e-6 && !lavaIds.includes((world.getBlock(blockPos.offset(0, 1, 0)) || {}).type)) {
      // LiquidBlock.getCollisionShape: a lava source holds a strider above its lower half
      return [[0, 0, 0, 1, 0.5, 1]]
    }
    if (vanilla.thinLadder && block.type === ladderId) {
      // before 1.9 a ladder is 0.125 thick (0.1875 since)
      return block.shapes.map(shape => shape.map(v => v === 0.8125 ? 0.875 : v === 0.1875 ? 0.125 : v))
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
            const blockShapes = collisionShapesOf(block, blockPos)
            // (a block of several boxes is one voxel shape: its boxes split along every face of the others)
            const grid = blockShapes.length > 1 ? { x: [], y: [], z: [] } : null
            for (const shape of blockShapes) {
              const blockBB = new AABB(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5])
              blockBB.offset(blockPos.x, blockPos.y, blockPos.z)
              if (grid) {
                grid.x.push(blockBB.minX, blockBB.maxX)
                grid.y.push(blockBB.minY, blockBB.maxY)
                grid.z.push(blockBB.minZ, blockBB.maxZ)
                blockBB.grid = grid
              }
              surroundingBBs.push(blockBB)
            }
          }
        }
      }
    }
    return surroundingBBs
  }

  // The player's box. Before 1.17 vanilla keeps the box across ticks, moves it and takes the position from its
  // center; while the position is still the one the box was kept at (nobody moved the player), the kept box is the
  // one to use. (A resized box keeps its corner, so its center may be an ulp off the position.)
  function entityBox (entity) {
    const box = entity.javaBox
    const pos = entity.pos
    if (box && (vanilla.positionFromBoxCenter || !vanilla.modernMove) && (box.at
      ? box.at[0] === pos.x && box.at[1] === pos.y && box.at[2] === pos.z
      : (box.minX + box.maxX) / 2 === pos.x && box.minY === pos.y && (box.minZ + box.maxZ) / 2 === pos.z)) return box.clone()
    return getPlayerBB(pos)
  }

  function keepBox (entity, box) {
    const kept = box.clone()
    kept.at = [entity.pos.x, entity.pos.y, entity.pos.z]
    entity.javaBox = kept
  }

  // EntityPlayer.updateSize at the end of the tick (1.9-1.13): 1.65 tall sneaking, 0.6 gliding (1.13: swimming); the
  // box keeps its lower corner and grows to the new size, unless that box would collide.
  const LEGACY_HEIGHT = { standing: Math.fround(1.8), crouching: Math.fround(1.65), fall_flying: Math.fround(0.6), swimming: Math.fround(0.6) }
  function updateLegacySize (entity, world) {
    const desired = entity.elytraFlying ? 'fall_flying' : (vanilla.fluidHeights && entity.swimming) ? 'swimming' : entity.control.sneak ? 'crouching' : 'standing'
    const current = LEGACY_HEIGHT[entity.pose] ? entity.pose : 'standing'
    if (LEGACY_HEIGHT[desired] === LEGACY_HEIGHT[current]) return
    const box = entityBox(entity)
    const width = Math.fround(0.6)
    const resized = new AABB(box.minX, box.minY, box.minZ, box.minX + width, box.minY + LEGACY_HEIGHT[desired], box.minZ + width)
    if (collidesWithBlocks(world, resized)) return
    entity.pose = desired
    keepBox(entity, resized)
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
      // (a box the moving one already reaches into still stops it at the voxel faces of its block's other boxes)
      const grid = shape.grid && shape.grid[axis]
      if (dist > 0) {
        let face = box[max] - EPSILON < shape[min] ? shape[min] : null
        if (face === null && grid) for (const g of grid) if (g > shape[min] && g < shape[max] && box[max] - EPSILON < g && (face === null || g < face)) face = g
        if (face !== null) {
          const d = face - box[max]
          if (d >= -EPSILON) dist = Math.min(dist, d)
        }
      } else if (dist < 0) {
        let face = box[min] + EPSILON >= shape[max] ? shape[max] : null
        if (face === null && grid) for (const g of grid) if (g > shape[min] && g < shape[max] && box[min] + EPSILON >= g && (face === null || g > face)) face = g
        if (face !== null) {
          const d = face - box[min]
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
    // The world border (the default one, 29999984 out) collides too: always while inside it on 1.14-1.17 (so a move
    // under 1e-7 is dropped even in open space), only near it since (WorldBorder.isInsideCloseToBorder)
    if (vanilla.worldBorderCollider || (collisionContext && closeToBorder(collisionContext, swept))) inside.push(...WORLD_BORDER)
    inside.push(...entityCollisions(swept))
    return inside
  }

  // ---- other entities ----

  // The entities a player collides with as if they were blocks (canBeCollidedWith): boats and rafts, shulkers. The
  // caller lists the entities around the player as entity.entities ([{ type, pos }]).
  const isSolidEntity = type => /boat$|raft$/.test(type) || type === 'shulker'
  // The box the player collides with: where the entity was when the player moved (entity.solidBox when the caller
  // knows it differs from its box after its own tick)
  const solidBox = other => other.solidBox ? new AABB(...other.solidBox) : otherEntityBox(other)
  function otherEntityBox (other) {
    if (other.box) return new AABB(...other.box) // the box the caller knows
    const p = other.pos
    if (/boat$|raft$/.test(other.type)) {
      const half = f32(1.375) / 2
      return new AABB(p.x - half, p.y, p.z - half, p.x + half, p.y + f32(0.5625), p.z + half)
    }
    const data = mcData.entitiesByName[other.type] || { width: 1, height: 1 }
    const half = f32(data.width) / 2
    return new AABB(p.x - half, p.y, p.z - half, p.x + half, p.y + f32(data.height), p.z + half)
  }

  // Level.getEntityCollisions: the boxes of the solid entities touching the swept box (none for a box under 1e-7)
  function entityCollisions (swept) {
    const entities = collisionContext && collisionContext.entities
    if (!entities || !entities.length) return []
    const size = ((swept.maxX - swept.minX) + (swept.maxY - swept.minY) + (swept.maxZ - swept.minZ)) / 3
    if (size < 1.0e-7) return []
    const reach = swept.clone().expand(1.0e-7, 1.0e-7, 1.0e-7)
    return entities.filter(other => isSolidEntity(other.type)).map(solidBox).filter(box => box.intersects(reach))
  }

  // AbstractBoat.tick (after the player's): a boat pushes the entities in its box grown by 0.2 sideways (0.01 lower)
  // whose feet are no higher than its bottom, away from its center (Entity.push).
  function pushedByBoats (entity) {
    if (!entity.entities) return
    const box = getPlayerBB(entity.pos)
    for (const other of entity.entities) {
      if (!/boat$|raft$/.test(other.type)) continue
      const boat = otherEntityBox(other)
      const reach = new AABB(boat.minX - 0.20000000298023224, boat.minY + 0.009999999776482582, boat.minZ - 0.20000000298023224,
        boat.maxX + 0.20000000298023224, boat.maxY - 0.009999999776482582, boat.maxZ + 0.20000000298023224)
      if (!reach.intersects(box) || !(box.minY <= boat.minY)) continue
      pushAway(entity, other)
    }
    pushedByMobs(entity, box)
  }

  // Entity.push(Entity): 0.05 away from the other's center, by the square root of the larger distance (no more than 1)
  function pushAway (entity, other) {
    let dx = entity.pos.x - other.pos.x
    let dz = entity.pos.z - other.pos.z
    let distance = Math.max(Math.abs(dx), Math.abs(dz))
    if (!(distance >= f32(0.01))) return
    distance = vanilla.normalizeFloatSqrt ? f32(Math.sqrt(distance)) : Math.sqrt(distance) // (Mth.sqrt in float before 1.17)
    dx /= distance
    dz /= distance
    const scale = Math.min(1, 1 / distance)
    dx *= scale
    dz *= scale
    entity.vel.x += dx * f32(0.05)
    entity.vel.z += dz * f32(0.05)
  }

  // LivingEntity.pushEntities on the client: each mob (after the player's tick) pushes the player whose box its own
  // touches
  const PUSHING_KINDS = new Set(['animal', 'mob', 'hostile', 'passive', 'ambient', 'water_creature'])
  function pushedByMobs (entity, box) {
    for (const other of entity.entities) {
      const data = mcData.entitiesByName[other.type]
      if (!data || !PUSHING_KINDS.has(data.type) || other.type === 'shulker') continue
      if (!otherEntityBox(other).intersects(box)) continue
      pushAway(entity, other)
    }
  }
  const BORDER = 29999984
  const WORLD_BORDER = [
    new AABB(-Infinity, -Infinity, -Infinity, -BORDER, Infinity, Infinity), new AABB(BORDER, -Infinity, -Infinity, Infinity, Infinity, Infinity),
    new AABB(-Infinity, -Infinity, -Infinity, Infinity, Infinity, -BORDER), new AABB(-Infinity, -Infinity, BORDER, Infinity, Infinity, Infinity)
  ]
  // World.getCollisionBoxes (1.8-1.13): for a player inside the world border, the cells outside it are stone.
  function legacyBorderShapes (box) {
    const context = collisionContext
    if (!context || !(context.x > -BORDER - 1 && context.x < BORDER + 1 && context.z > -BORDER - 1 && context.z < BORDER + 1)) return []
    const x0 = Math.floor(box.minX) - 1
    const x1 = Math.ceil(box.maxX) + 1
    const z0 = Math.floor(box.minZ) - 1
    const z1 = Math.ceil(box.maxZ) + 1
    if (x0 + 1 > -BORDER && x1 - 1 < BORDER && z0 + 1 > -BORDER && z1 - 1 < BORDER) return []
    const out = []
    const y0 = Math.floor(box.minY) - 1
    const y1 = Math.ceil(box.maxY) + 1
    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        if (x + 1 > -BORDER && x < BORDER && z + 1 > -BORDER && z < BORDER) continue
        for (let y = y0; y < y1; y++) out.push(new AABB(x, y, z, x + 1, y + 1, z + 1))
      }
    }
    return out
  }
  function closeToBorder (context, box) {
    const margin = Math.max(Math.max(box.maxX - box.minX, box.maxZ - box.minZ), 1)
    const distance = Math.min(context.x + BORDER, BORDER - context.x, context.z + BORDER, BORDER - context.z)
    return distance < margin * 2 && context.x >= -BORDER - margin && context.x < BORDER + margin && context.z >= -BORDER - margin && context.z < BORDER + margin
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

  function legacyShapes (world, queryBB) {
    const shapes = getSurroundingBBs(world, queryBB)
    if (vanilla.legacyWorldBorder) shapes.push(...legacyBorderShapes(queryBB))
    // (World.getCollisionBoxes: the solid entities' boxes too)
    const entities = collisionContext && collisionContext.entities
    if (entities) shapes.push(...entities.filter(other => isSolidEntity(other.type)).map(solidBox).filter(box => box.intersects(queryBB)))
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

  // Whether any block collision shape overlaps the box (Level.noCollision, negated)
  function collidesWithBlocks (world, box) {
    return getSurroundingBBs(world, box).some(shape => shape.intersects(box))
  }

  // Player.maybeBackOffFromEdge: a sneaking player on the ground (1.16+: or just above it) does not walk off an
  // edge; the move is cut back by 0.05 until the box would stand on something. The test: before 1.13 the box moved
  // down one block, 1.13-1.20.4 down the step height, 1.20.5+ a thin box under the feet (canFallAtLeast).
  function backOffFromEdge (entity, world, x, y, z) {
    if (!entity.control.sneak || entity.flying) return { x, z }
    const step = stepHeightOf(entity)
    const box = entityBox(entity)
    const fallDistance = entity.fallDistance || 0
    let canFall
    if (vanilla.backOffThinBox) {
      canFall = (dx, dz, height) => !collidesWithBlocks(world, new AABB(box.minX + 1.0e-7 + dx, box.minY - height - 1.0e-7, box.minZ + 1.0e-7 + dz, box.maxX - 1.0e-7 + dx, box.minY, box.maxZ - 1.0e-7 + dz))
    } else {
      const down = vanilla.voxelCollision ? -step : -1
      canFall = (dx, dz) => !collidesWithBlocks(world, box.clone().offset(dx, down, dz))
    }
    let aboveGround = entity.onGround
    if (!aboveGround && vanilla.backOffAboveGround && fallDistance < step) {
      aboveGround = vanilla.backOffThinBox
        ? !canFall(0, 0, step - fallDistance)
        : collidesWithBlocks(world, box.clone().offset(0, fallDistance - step, 0))
    }
    if (!aboveGround || (vanilla.backOffOnlyDown && y > 0)) return { x, z }

    if (vanilla.backOffThinBox) {
      const sx = Math.sign(x) * 0.05
      const sz = Math.sign(z) * 0.05
      while (x !== 0 && canFall(x, 0, step)) {
        if (Math.abs(x) <= 0.05) { x = 0; break }
        x -= sx
      }
      while (z !== 0 && canFall(0, z, step)) {
        if (Math.abs(z) <= 0.05) { z = 0; break }
        z -= sz
      }
      while (x !== 0 && z !== 0 && canFall(x, z, step)) {
        x = Math.abs(x) <= 0.05 ? 0 : x - sx
        z = Math.abs(z) <= 0.05 ? 0 : z - sz
      }
      return { x, z }
    }
    const cut = v => (v < 0.05 && v >= -0.05) ? 0 : v > 0 ? v - 0.05 : v + 0.05
    while (x !== 0 && canFall(x, 0)) x = cut(x)
    while (z !== 0 && canFall(0, z)) z = cut(z)
    while (x !== 0 && z !== 0 && canFall(x, z)) {
      x = cut(x)
      z = cut(z)
    }
    return { x, z }
  }

  function moveEntity (entity, world, dx, dy, dz) {
    const x0 = entity.pos.x
    const z0 = entity.pos.z
    collisionContext = collisionContextOf(entity)
    try {
      moveEntityInContext(entity, world, dx, dy, dz)
    } finally {
      collisionContext = null
    }
    // LocalPlayer.move: the auto-jump looks at the horizontal move just made
    if (vanilla.autoJump && entity.autoJump && !entity.pistonMove) updateAutoJump(entity, world, f32(entity.pos.x - x0), f32(entity.pos.z - z0))
  }

  // LocalPlayer.updateAutoJump (1.11+): walking on the ground into a step the player can jump onto (higher than half a
  // block, no higher than 1.2 plus 0.75 a jump boost level, with room above the head) queues a jump for the next tick.
  function updateAutoJump (entity, world, moveX, moveZ) {
    if (entity.autoJumpTime > 0 || !entity.onGround || entity.control.sneak || entity.vehicle) return
    const control = entity.control
    let inputX = (control.left ? 1 : 0) - (control.right ? 1 : 0)
    let inputY = (control.forward ? 1 : 0) - (control.back ? 1 : 0)
    if (inputX === 0 && inputY === 0) return
    if (vanilla.squareMovementInput) {
      const length = f32(Math.sqrt(f32(f32(inputX * inputX) + f32(inputY * inputY))))
      inputX = f32(inputX / length)
      inputY = f32(inputY / length)
    }
    // (1.16+: not on a block that weakens the jump)
    if (vanilla.autoJumpJumpFactor && blockFactor(entity, world, block => block.type === honeyblockId ? f32(physics.honeyblockJumpSpeed) : 1, false) < 1) return
    const pos = entity.pos
    const box = entityBox(entity)
    const speed = f32(landSpeed(entity))
    let dirX = moveX
    let dirZ = moveZ
    let lengthSqr = f32(dirX * dirX + dirZ * dirZ)
    if (lengthSqr <= f32(0.001)) {
      const ix = f32(speed * inputX)
      const iy = f32(speed * inputY)
      const yaw = f32(yawDegrees(entity) * DEG_TO_RAD_F)
      const sin = mthSin(yaw)
      const cos = mthCos(yaw)
      dirX = f32(f32(ix * cos) - f32(iy * sin))
      dirZ = f32(f32(iy * cos) + f32(ix * sin))
      lengthSqr = f32(dirX * dirX + dirZ * dirZ)
      if (lengthSqr <= f32(0.001)) return
    }
    const inv = vanilla.autoJumpExactInvSqrt ? f32(1 / f32(Math.sqrt(lengthSqr))) : vanilla.autoJumpFloatFastInvSqrt ? fastInvSqrtFloat(lengthSqr) : f32(fastInvSqrtDouble(lengthSqr))
    dirX *= inv
    dirZ *= inv
    // getForward: the look direction in the old getVectorForRotation form
    const turned = f32(f32(-yawDegrees(entity) * DEG_TO_RAD_F) - PI_F)
    const negCosPitch = -mthCos(f32(-pitchDegrees(entity) * DEG_TO_RAD_F))
    const forwardX = f32(mthSin(turned) * negCosPitch)
    const forwardZ = f32(mthCos(turned) * negCosPitch)
    if (f32(forwardX * dirX + forwardZ * dirZ) < f32(-0.15)) return
    const shapesAt = (x, y, z) => {
      const block = world.getBlock(new Vec3(x, y, z))
      return block ? collisionShapesOf(block, block.position) : []
    }
    let head = [Math.floor(pos.x), Math.floor(box.maxY), Math.floor(pos.z)]
    if (shapesAt(...head).length) return
    head = [head[0], head[1] + 1, head[2]]
    if (shapesAt(...head).length) return
    let reach = f32(1.2)
    if (entity.jumpBoost > 0) reach = f32(reach + f32(entity.jumpBoost * f32(0.75)))
    const distance = Math.max(f32(speed * 7), f32(1 / inv))
    const endX = pos.x + moveX + dirX * distance
    const endZ = pos.z + moveZ + dirZ * distance
    const width = f32(0.6)
    const query = new AABB(Math.min(pos.x, endX) - width, box.minY, Math.min(pos.z, endZ) - width,
      Math.max(pos.x, endX) + width, box.minY + boxHeight, Math.max(pos.z, endZ) + width)
    const y0 = box.minY + 0.5099999904632568
    const sideX = -dirZ * f32(width * 0.5)
    const sideZ = dirX * f32(width * 0.5)
    const segments = [
      [pos.x - sideX, pos.z - sideZ, endX - sideX, endZ - sideZ],
      [pos.x + sideX, pos.z + sideZ, endX + sideX, endZ + sideZ]
    ]
    const hits = (shape, [ax, az, bx, bz]) => shape.minX < Math.max(ax, bx) && shape.maxX > Math.min(ax, bx) &&
      shape.minY < y0 && shape.maxY > y0 && shape.minZ < Math.max(az, bz) && shape.maxZ > Math.min(az, bz)
    // the colliding shapes in the swept box, in BlockCollisions order (x, then y, then z): the first one a side ray
    // meets is the step
    const step = findStep(query, shapesAt, shape => hits(shape, segments[0]) || hits(shape, segments[1]))
    if (!step) return
    let top = f32(step.maxY)
    const cx = Math.floor((step.minX + step.maxX) / 2)
    const cy = Math.floor((step.minY + step.maxY) / 2)
    const cz = Math.floor((step.minZ + step.maxZ) / 2)
    for (let j = 1; j < reach; j++) {
      const above = shapesAt(cx, cy + j, cz)
      if (above.length) {
        top = f32(f32(Math.max(...above.map(a => a[4]))) + f32(cy + j))
        if (top - box.minY > reach) return
      }
      if (j > 1) {
        head = [head[0], head[1] + 1, head[2]]
        if (shapesAt(...head).length) return
      }
    }
    const rise = f32(top - box.minY)
    if (!(rise <= f32(0.5)) && !(rise > reach)) entity.autoJumpTime = 1
  }

  function findStep (query, shapesAt, meets) {
    for (let z = Math.floor(query.minZ) - 1; z <= Math.floor(query.maxZ) + 1; z++) {
      for (let y = Math.floor(query.minY) - 1; y <= Math.floor(query.maxY) + 1; y++) {
        for (let x = Math.floor(query.minX) - 1; x <= Math.floor(query.maxX) + 1; x++) {
          for (const s of shapesAt(x, y, z)) {
            const shape = new AABB(x + s[0], y + s[1], z + s[2], x + s[3], y + s[4], z + s[5])
            if (shape.intersects(query) && meets(shape)) return shape
          }
        }
      }
    }
    return null
  }

  // Mth.fastInvSqrt: the bit-trick inverse square root with one Newton step (float 1.16-1.19, double before)
  const fastBuffer = new DataView(new ArrayBuffer(8))
  function fastInvSqrtFloat (x) {
    const half = f32(0.5 * x)
    fastBuffer.setFloat32(0, x)
    fastBuffer.setInt32(0, 1597463007 - (fastBuffer.getInt32(0) >> 1))
    const y = fastBuffer.getFloat32(0)
    return f32(y * f32(1.5 - f32(f32(half * y) * y)))
  }
  function fastInvSqrtDouble (x) {
    const half = 0.5 * x
    fastBuffer.setFloat64(0, x)
    fastBuffer.setBigInt64(0, 6910469410427058090n - (fastBuffer.getBigInt64(0) >> 1n))
    const y = fastBuffer.getFloat64(0)
    return y * (1.5 - half * y * y)
  }

  function moveEntityInContext (entity, world, dx, dy, dz) {
    const vel = entity.vel
    const pos = entity.pos
    if (entity.gameMode === 'spectator') {
      // noPhysics: a spectator moves through everything and touches nothing (before 1.17 the kept box moves and the
      // position is its center)
      if (vanilla.positionFromBoxCenter || !vanilla.modernMove) {
        const box = entityBox(entity).offset(dx, dy, dz)
        pos.x = (box.minX + box.maxX) / 2
        pos.y = box.minY
        pos.z = (box.minZ + box.maxZ) / 2
        keepBox(entity, box)
      } else {
        pos.x += dx
        pos.y += dy
        pos.z += dz
      }
      entity.isCollidedHorizontally = false
      entity.isCollidedVertically = false
      entity.onGround = false
      return
    }

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

    const backedOff = entity.pistonMove ? { x: dx, z: dz } : backOffFromEdge(entity, world, dx, dy, dz)
    dx = oldVelX = backedOff.x
    dz = oldVelZ = backedOff.z

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
          keepBox(entity, playerBB)
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
      updateFallDistance(entity, moved.y)
      if (vanilla.restitution) {
        // 26.2: Entity.restituteMovementAfterCollisions replaces the velocity reset and the blocks' fall-on bounce
        if ((dy !== 0 && entity.isCollidedVertically) || entity.isCollidedHorizontally) restitute(entity, world, collidedX, collidedZ, moved)
        if (!vanilla.effectsAfterTravel) stepOn(entity, world)
        applyBlockCollisions(entity, world, playerBB)
        return
      }
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
    if (stepHeightOf(entity) > 0 &&
      (entity.onGround || (dy !== oldVelY && oldVelY < 0)) &&
      (dx !== oldVelX || dz !== oldVelZ)) {
      const oldVelXCol = dx
      const oldVelYCol = dy
      const oldVelZCol = dz
      const oldBBCol = playerBB.clone()

      dy = stepHeightOf(entity)
      const queryBB = oldBB.clone().extend(oldVelX, dy, oldVelZ)
      const surroundingBBs = legacyShapes(world, queryBB)

      const BB1 = oldBB.clone()
      const BB2 = oldBB.clone()
      // (the rise is tried against the box swept by the requested move, not the collided one)
      const BB_XZ = BB1.clone().extend(oldVelX, 0, oldVelZ)

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
    keepBox(entity, playerBB)
    entity.isCollidedHorizontally = dx !== oldVelX || dz !== oldVelZ
    entity.isCollidedVertically = dy !== oldVelY
    entity.onGround = entity.isCollidedVertically && oldVelY < 0
    waterAfterMove(entity, world)
    updateFallDistance(entity, dy)

    if (dx !== oldVelX) vel.x = 0
    if (dz !== oldVelZ) vel.z = 0
    if (dy !== oldVelY) afterFallOn(entity, world, vel)
    stepOn(entity, world)
    applyBlockCollisions(entity, world, playerBB)
  }

  // Entity.checkFallDamage: the fall grows while moving down out of water and ends on the ground
  function updateFallDistance (entity, dy) {
    if (!entity.isInWater && dy < 0) entity.fallDistance = (entity.fallDistance || 0) - f32(dy)
    if (entity.onGround) entity.fallDistance = 0
  }

  // LivingEntity.checkFallDamage: a player not yet in water looks again where the move ended (and is pushed)
  function waterAfterMove (entity, world) {
    if (entity.isInWater) return
    waterAfterMoveCheck(entity, world)
    if (entity.isInWater) entity.fallDistance = 0
  }

  function waterAfterMoveCheck (entity, world) {
    if (vanilla.unifiedFluidInteraction) {
      // 26.1: the whole fluid interaction again, lava included
      updateFluids(entity, world)
      return
    }
    if (inBoatAboveWater(entity)) {
      entity.isInWater = false
      return
    }
    if (vanilla.fluidHeights) entity.isInWater = updateFluid(entity, world, entityBox(entity), 'water', 0.014).found
    else entity.isInWater = isInWaterApplyCurrent(world, getPlayerBB(entity.pos).contract(0.001, 0.401, 0.001), entity.vel)
  }

  // Entity.restituteMovementAfterCollisions (26.2): a collided axis bounces back by the restitution (none for a
  // player's walls); landing on slime (1.0) or a bed (0.75) without sneaking bounces the fall back up, after undoing
  // the part of the tick's gravity and drag the move did not use
  function restitute (entity, world, collidedX, collidedZ, moved) {
    const vel = entity.vel
    const suppress = !!entity.control.sneak
    let restitution = 0
    if (collidedX) vel.x = -vel.x * restitution
    if (collidedZ) vel.z = -vel.z * restitution
    if (!entity.isCollidedVertically) return
    const gravity = (vel.y <= 0 && entity.slowFalling > 0) ? Math.min(gravityOf(entity), 0.01) : gravityOf(entity)
    if (entity.onGround) {
      const block = world.getBlock(getOnPos(entity, f32(0.2)))
      const bounciness = !block ? 0 : block.type === slimeBlockId ? 1 : bedIds.has(block.type) ? f32(0.75) : 0
      restitution = !(-vel.y < gravity) && !suppress ? Math.max(restitution, bounciness) : 0
    }
    let compensation = 0
    let drag = 1
    if (restitution > 0) {
      const portion = moved.y / vel.y
      compensation = portion * gravity
      drag = 1.0 + portion * (f32(0.98) - 1.0)
    }
    vel.y = (compensation - vel.y) * drag * restitution
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
    // the cells of the box shrunk by 0.001 (1e-7 from 1.19.3)
    const inset = vanilla.insideBlocksInset1e7 ? 1.0e-7 : 0.001
    if (!vanilla.effectsAfterTravel) insideBlocks(entity, world, cellsInBox(playerBB.clone().contract(inset, inset, inset)))
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

  const honeyOldY = y => vanilla.effectsAfterTravel ? y / 0.9800000190734863 + 0.08 : y

  // HoneyBlock.isSlidingDown: falling faster than 0.08 against a side of the block, below its top
  function isSlidingDownHoney (entity, blockPos) {
    const pos = entity.pos
    if (entity.onGround || pos.y > blockPos.y + 0.9375 - 1.0e-7 || honeyOldY(entity.vel.y) >= -0.08) return false
    const reach = 0.4375 + boxHalfWidth
    return Math.abs(blockPos.x + 0.5 - pos.x) + 1.0e-7 > reach || Math.abs(blockPos.z + 0.5 - pos.z) + 1.0e-7 > reach
  }

  // The blocks the box touches act on the player. With visited (1.21.2+), a block counts once per tick; bubble columns
  // act only if they touch endBox when one is given.
  function insideBlocks (entity, world, cells, visited, endBox) {
    const vel = entity.vel
    for (const cursor of cells) {
      const block = world.getBlock(cursor)
      if (visited) {
        if (!block || block.type === airId) continue
        const key = cursor.x + ',' + cursor.y + ',' + cursor.z
        if (visited.has(key)) continue
        visited.add(key)
      }
      // 1.21.10+: whether the step's end box touches the block (only bubble columns require it)
      const touches = !endBox || endBox.intersects(new AABB(cursor.x, cursor.y, cursor.z, cursor.x + 1, cursor.y + 1, cursor.z + 1))
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
      if (block.type === honeyblockId && isSlidingDownHoney(entity, cursor)) {
        // HoneyBlock.doSlideMovement: sliding down a side at 0.05 (1.21.2+ after the travel, so undoing and redoing its
        // gravity and drag)
        const oldY = honeyOldY(vel.y)
        if (oldY < -0.13) {
          const scale = -0.05 / oldY
          vel.x *= scale
          vel.z *= scale
        }
        vel.y = vanilla.effectsAfterTravel ? (-0.05 - 0.08) * 0.9800000190734863 : -0.05
        entity.fallDistance = 0
      }
      if (block.type === webId) {
        entity.stuckSpeedMultiplier = STUCK_IN_WEB
        entity.fallDistance = 0
      } else if (block.type === berryBushId) {
        entity.stuckSpeedMultiplier = STUCK_IN_BERRY_BUSH
        entity.fallDistance = 0
      } else if (block.type === powderSnowId) {
        // only while the player's feet are in powder snow
        const feet = world.getBlock(entity.pos)
        if (feet && feet.type === powderSnowId) {
          entity.stuckSpeedMultiplier = STUCK_IN_POWDER_SNOW
          entity.fallDistance = 0
        }
        entity.isInPowderSnow = true
      } else if (block.type === bubblecolumnId && touches) {
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
    // 1.19-1.20: swift sneak adds 0.15F per level to 0.3F (at most 1)
    if (vanilla.swiftSneak && entity.swiftSneak > 0) return Math.min(Math.max(f32(f32(0.3) + f32(entity.swiftSneak * f32(0.15))), 0), 1)
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
        const cos = javaMath.cos(pitch)
        lift = vanilla.elytraSquareOnly ? cos * cos : cos * cos * Math.min(1, lookLength / 0.4)
      } else {
        const cos = mthCos(pitch)
        lift = f32(cos * cos * Math.min(1, lookLength / 0.4))
      }
      // (before 1.13: -0.08 + lift * 0.06, no gravity factor)
      vel.y += vanilla.elytraLegacyLift ? -0.08 + lift * 0.06 : effectiveGravity * (-1.0 + lift * 0.75)
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
        // (a ridden horse: a tenth of its speed, getFlyingSpeed)
        acceleration = entity.airSpeed !== undefined ? entity.airSpeed : entity.flying ? flySpeedOf(entity) : (vanilla.airSpeedLastTick ? entity.sprintedLastTick : isSprinting(entity)) ? vanilla.airSprintSpeed : f32(physics.airborneAcceleration)
        inertia = f32(physics.airborneInertia)
      }

      applyHeading(entity, strafe, forward, acceleration)

      if (isOnLadder(world, pos)) {
        entity.fallDistance = 0
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

      const climbsOutOfPowderSnow = entity.wasInPowderSnow && entity.leatherBoots
      if ((isOnLadder(world, pos) || climbsOutOfPowderSnow) && (entity.isCollidedHorizontally ||
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
    let flow = new Vec3(0, 0, 0)
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
          flow = normalize(flow).translate(0, -6, 0)
          break
        }
      }
    }

    // (Vec3.normalize: the length through the float sqrt)
    return normalize(flow)
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

    if (acceleration.norm() > 0) {
      const push = normalize(acceleration)
      vel.x += push.x * 0.014
      vel.y += push.y * 0.014
      vel.z += push.z * 0.014
    }
    return isInWater
  }

  // Water then lava, with their currents (1.16+)
  function updateFluids (entity, world) {
    const box = entityBox(entity)
    const water = inBoatAboveWater(entity) ? { found: false, height: 0 } : updateFluid(entity, world, box, 'water', 0.014)
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
    const eyeHeight = f32((vanilla.crouchPose ? POSE_EYE_HEIGHT[entity.pose || 'standing'] || f32(1.62) : f32(1.62)) * boxScale)
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
    const underWater = isUnderWater(entity)
    const collided = entity.isCollidedHorizontally && !(vanilla.minorCollision && entity.minorHorizontalCollision)
    const slow = isMovingSlowly(entity)
    let sprinting = !!entity.sprinting
    // the double tap of forward: the window since the last press, and whether forward was held the tick before
    let trigger = entity.sprintTriggerTime > 0 ? entity.sprintTriggerTime - 1 : 0
    const hadForward = !!entity.hadForward
    const prevSneak = !!entity.isCrouching // the sneak key the last tick ended with
    const doubleTap = () => {
      if (trigger > 0 && !control.sprint) return true
      if (!control.sprint) trigger = 7
      return control.sprint
    }

    if (!vanilla.fluidHeights) {
      // before 1.13: the forward input (0.3 while sneaking) must be at least 0.8
      const forward = f32(f32(forwardKeys * (control.sneak ? f32(0.3) : 1)) * (entity.usingItem ? ITEM_USE_SLOWDOWN : 1))
      if (entity.usingItem) trigger = 0
      const canStart = !sprinting && forward >= 0.8 && food && !blind && !entity.usingItem
      if (entity.onGround && !prevSneak && !hadForward && canStart && doubleTap()) sprinting = true
      if (!sprinting && canStart && control.sprint) sprinting = true
      entity.hadForward = forward >= 0.8
      if (sprinting && (forward < 0.8 || entity.isCollidedHorizontally || !food)) sprinting = false
    } else if (vanilla.sprintByForwardImpulse) {
      // 1.21.5+: any forward impulse; not in shallow water, not sneaking unless under water
      const hasForward = forwardKeys > 0
      // (a passenger: only a vehicle that sprints itself, a camel, and no food check)
      const possible = !blind && (entity.vehicle ? /^camel/.test(entity.vehicle.type) : food)
      const shallow = inWater && !underWater
      if (prevSneak || entity.usingItem || control.back) trigger = 0
      if (!sprinting && hasForward && possible && !shallow && !entity.usingItem && !(entity.elytraFlying && !underWater) && (!slow || underWater)) {
        if (!hadForward) {
          if (trigger > 0) sprinting = true
          else trigger = 7
        }
        if (control.sprint) sprinting = true
      }
      entity.hadForward = hasForward
      if (sprinting) {
        if (entity.swimming) {
          if (!food || blind || !inWater || (!hasForward && !entity.onGround && !control.sneak)) sprinting = false
        } else if (!possible || shallow || !hasForward || collided) {
          sprinting = false
        }
      }
    } else {
      // 1.13-1.21.4: at least 0.8 forward to start (any under water), any forward to keep
      const using = entity.usingItem ? ITEM_USE_SLOWDOWN : 1
      const sneak = slow ? sneakFactor(entity) : 1
      const forward = vanilla.sprintStopsWhenSlow ? f32(f32(forwardKeys * using) * sneak) : f32(f32(forwardKeys * sneak) * using)
      const hasForward = forward > f32(1.0e-5)
      if (vanilla.sprintStopsWhenSlow && (slow || blind || entity.elytraFlying || (entity.usingItem && !underWater))) sprinting = false
      const enough = underWater ? hasForward : forward >= 0.8
      const canStart = !sprinting && enough && food && !blind && !entity.usingItem && !(vanilla.sprintNotWhileGliding && entity.elytraFlying) &&
        (!vanilla.sprintStopsWhenSlow || !slow || underWater) &&
        // (1.20+: a passenger only on a vehicle that sprints, a camel)
        !(vanilla.passengerSprintVehicle && entity.vehicle && !/^camel/.test(entity.vehicle.type))
      if (entity.usingItem || prevSneak) trigger = 0
      if ((entity.onGround || underWater) && !prevSneak && !hadForward && canStart && doubleTap()) sprinting = true
      if ((!inWater || underWater) && canStart && control.sprint) sprinting = true
      entity.hadForward = enough
      if (sprinting) {
        const stop = vanilla.sprintState13 ? forward < 0.8 || !food : !hasForward || !food
        if (entity.swimming) {
          if ((!entity.onGround && !control.sneak && stop) || !inWater) sprinting = false
        } else if (stop || collided || (inWater && !underWater)) {
          sprinting = false
        }
      }
    }
    entity.sprinting = sprinting
    entity.sprintTriggerTime = trigger
  }

  const isUnderWater = entity => vanilla.fluidHeights && entity.isInWater && !!entity.wasEyeInWater

  // Entity.updateSwimming (1.13+): keeps swimming while sprinting in water; starts when sprinting with the eyes under
  // water and water where the player stands (the sprint state of the tick before)
  function updateSwimming (entity, world) {
    const sprinting = !!entity.sprinting
    if (entity.swimming) {
      entity.swimming = sprinting && entity.isInWater
    } else {
      entity.swimming = sprinting && isUnderWater(entity) && !!fluidOf(world.getBlock(entity.pos), 'water')
    }
  }

  // A block that suffocates: a full collision cube that is not see-through (glass, leaves... never suffocate)
  // BlockState.isSuffocating (1.14+, also what isViewBlocking defaults to): a full collision cube, except glass,
  // leaves, grates and mangrove roots; farmland, soul sand, dirt paths and mud though they are lower. Before 1.14
  // (isNormalCube) an opaque full cube.
  const NEVER_SUFFOCATES = /glass$|_leaves$|copper_grate$|^mangrove_roots$|^moving_piston$/
  const ALWAYS_SUFFOCATES = new Set(['farmland', 'soul_sand', 'dirt_path', 'grass_path', 'mud'])
  function suffocates (block) {
    if (!block) return false
    const fullCube = block.shapes.length === 1 && block.shapes[0].every((v, i) => v === (i < 3 ? 0 : 1))
    if (!vanilla.modernMove) return !block.transparent && fullCube
    if (NEVER_SUFFOCATES.test(block.name)) return false
    if (ALWAYS_SUFFOCATES.has(block.name)) return true
    return fullCube && block.name !== 'cobweb'
  }

  // LocalPlayer.suffocatesAt: a suffocating block in the column of the player's box at that cell
  function suffocatesAt (entity, world, x, z) {
    const box = getPlayerBB(entity.pos)
    const check = new AABB(x, box.minY, z, x + 1, box.maxY, z + 1).contract(1.0e-7, 1.0e-7, 1.0e-7)
    for (let y = Math.floor(check.minY); y <= Math.floor(check.maxY); y++) {
      // (Level.collidesWithSuffocatingBlock: the block's shape must reach into the box)
      const block = world.getBlock(new Vec3(x, y, z))
      if (suffocates(block) && collisionShapesOf(block, block.position).some(b => new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]).intersects(check))) return true
    }
    return false
  }

  // LocalPlayer.moveTowardsClosestSpace: inside a suffocating block, push 0.1 toward the nearest free side
  function moveTowardsClosestSpace (entity, world, x, z) {
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    if (!suffocatesAt(entity, world, bx, bz)) return
    const dx = x - bx
    const dz = z - bz
    let best = null
    let bestDistance = Number.MAX_VALUE
    for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { // west, east, north, south
      const coord = sx !== 0 ? dx : dz
      const distance = (sx > 0 || sz > 0) ? 1.0 - coord : coord
      if (distance < bestDistance && !suffocatesAt(entity, world, bx + sx, bz + sz)) {
        bestDistance = distance
        best = [sx, sz]
      }
    }
    if (!best) return
    if (best[0] !== 0) entity.vel.x = 0.1 * best[0]
    else entity.vel.z = 0.1 * best[1]
  }

  // The push out of a block before 1.16. Blocked: before 1.13 a normal cube at the cell or above it; 1.13 the same
  // (a swimmer: at the cell only); 1.14-1.15 a view-blocking block in the box's height. The push sets the velocity
  // toward the nearest open side: 0.1F before 1.14, 0.1 since.
  function pushOutOfBlock (entity, world, box, x, y, z) {
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    const solid = (cx, cy, cz) => suffocates(world.getBlock(new Vec3(cx, cy, cz)))
    let blocked
    if (vanilla.modernMove) {
      blocked = (cx, cz) => {
        for (let cy = Math.floor(box.minY); cy < Math.ceil(box.maxY); cy++) if (solid(cx, cy, cz)) return true
        return false
      }
    } else if (vanilla.fluidHeights && entity.swimming) {
      blocked = (cx, cz) => solid(cx, by, cz)
    } else {
      blocked = (cx, cz) => solid(cx, by, cz) || solid(cx, by + 1, cz)
    }
    if (!blocked(bx, bz)) return
    const dx = x - bx
    const dz = z - bz
    let best = null
    let bestDistance = 9999.0
    // (a swimmer in 1.13 still looks for a side open two blocks high)
    const open = (vanilla.fluidHeights && !vanilla.modernMove) ? (cx, cz) => !solid(cx, by, cz) && !solid(cx, by + 1, cz) : (cx, cz) => !blocked(cx, cz)
    for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { // west, east, north, south
      const coord = sx !== 0 ? dx : dz
      const distance = (sx > 0 || sz > 0) ? 1.0 - coord : coord
      if (open(bx + sx, bz + sz) && distance < bestDistance) {
        bestDistance = distance
        best = [sx, sz]
      }
    }
    if (!best) return
    const speed = vanilla.modernMove ? 0.1 : f32(0.1)
    if (best[0] !== 0) entity.vel.x = speed * best[0]
    else entity.vel.z = speed * best[1]
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
    const box = getPlayerBB(entity.pos, f32(POSE_HEIGHT[pose] * boxScale)).contract(1.0e-7, 1.0e-7, 1.0e-7)
    const saved = collisionContext
    collisionContext = collisionContextOf(entity)
    try {
      return !getSurroundingBBs(world, box).some(shape => shape.intersects(box))
    } finally {
      collisionContext = saved
    }
  }

  // LocalPlayer.aiStep: crouching from the sneak key of the tick before, or forced where standing does not fit
  function updateCrouching (entity, world) {
    const shift = !!entity.isCrouching // the sneak key the last tick ended with
    entity.crouching = !entity.flying && !(vanilla.passengerNoCrouch && entity.vehicle) && !(entity.pose === 'swimming' && entity.isInWater) && fitsPose(entity, world, 'crouching') &&
      (shift || !fitsPose(entity, world, 'standing'))
  }

  // Player.updatePlayerPose at the end of the tick
  function updatePose (entity, world) {
    if (!fitsPose(entity, world, 'swimming')) return
    const desired = entity.swimming ? 'swimming' : entity.elytraFlying ? 'fall_flying' : entity.autoSpinAttack ? 'spin_attack' : (entity.control.sneak && !entity.flying) ? 'crouching' : 'standing'
    const pose = fitsPose(entity, world, desired) ? desired : fitsPose(entity, world, 'crouching') ? 'crouching' : 'swimming'
    if (pose !== entity.pose) entity.javaBox = null // the box is rebuilt for the new size
    entity.pose = pose
  }

  function fireworkBoost (entity) {
    if (!(entity.fireworkRocketDuration > 0)) return
    if (!entity.elytraFlying) {
      entity.fireworkRocketDuration = 0
      return
    }
    const vel = entity.vel
    const look = viewVector(entity)
    // each rocket attached to the player boosts it in its own tick (entity.fireworkRockets: how many fly now)
    const rockets = entity.fireworkRockets > 0 ? entity.fireworkRockets : 1
    for (let i = 0; i < rockets; i++) {
      vel.x += look.x * 0.1 + (look.x * 1.5 - vel.x) * 0.5
      vel.y += look.y * 0.1 + (look.y * 1.5 - vel.y) * 0.5
      vel.z += look.z * 0.1 + (look.z * 1.5 - vel.z) * 0.5
    }
    --entity.fireworkRocketDuration
  }

  // LivingEntity.jumpFromGround
  function jumpFromGround (entity, world) {
    const vel = entity.vel
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
  }

  // The flying speed (Player.getFlyingSpeed while flying): the ability's, doubled when sprinting
  const flySpeedOf = entity => f32(f32(typeof entity.flySpeed === 'number' ? entity.flySpeed : 0.05) * (isSprinting(entity) ? 2 : 1))

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

  // TridentItem.releaseUsing with Riptide, from the key handling ahead of the player's tick: in water (or rain) the
  // player is pushed along its look by 3 * (1 + level) / 4, and lifted 1.2 first when on the ground.
  function riptide (entity, world) {
    const level = entity.riptideLaunch
    entity.riptideLaunch = 0
    if (!(level > 0) || !(entity.isInWater || entity.inRain)) return
    const yaw = f32(yawDegrees(entity) * DEG_TO_RAD_F)
    const pitch = f32(pitchDegrees(entity) * DEG_TO_RAD_F)
    let x = f32(-mthSin(yaw) * mthCos(pitch))
    let y = f32(-mthSin(pitch))
    let z = f32(mthCos(yaw) * mthCos(pitch))
    const length = f32(Math.sqrt(f32(f32(f32(x * x) + f32(y * y)) + f32(z * z))))
    const strength = f32(f32(3) * f32(f32(1 + level) / f32(4)))
    x = f32(x * f32(strength / length))
    y = f32(y * f32(strength / length))
    z = f32(z * f32(strength / length))
    entity.vel.x += x
    entity.vel.y += y
    entity.vel.z += z
    if (entity.onGround) moveEntity(entity, world, 0, 1.1999999284744263, 0)
  }

  const simulateOwn = (entity, world) => {
    const vel = entity.vel
    const pos = entity.pos
    if (entity.riptideLaunch) riptide(entity, world)
    // (before 1.19.4 the air speed is set after the travel, from the sprint the tick before ended with)
    entity.sprintedLastTick = vanilla.sprintState ? !!entity.sprinting : !!entity.control.sprint
    const startPos = pos.clone()
    boxScale = vanilla.playerAttributes ? f32(attributeValue(entity, 'scale', 1)) : 1
    boxHeight = f32((vanilla.crouchPose ? POSE_HEIGHT[entity.pose] || physics.playerHeight : vanilla.legacyPlayerSize ? LEGACY_HEIGHT[entity.pose] || physics.playerHeight : physics.playerHeight) * boxScale)
    boxHalfWidth = f32(f32(f32(0.6) * boxScale) / 2)
    entity.movementsThisTick = vanilla.effectsAfterTravel ? [] : undefined

    entity.wasInPowderSnow = !!entity.isInPowderSnow
    entity.isInPowderSnow = false
    if (entity.slowFalling > 0 || entity.levitation > 0) entity.fallDistance = 0

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
      // (a boat's passenger is not in the water)
      entity.isInWater = inBoatAboveWater(entity) ? false : isInWaterApplyCurrent(world, waterBB, vel)
      entity.isInLava = isMaterialInBB(world, lavaBB, lavaIds)
    }

    if (vanilla.fluidHeights) {
      // Entity.updateFluidOnEyes: 1.16+ isUnderWater uses the eyes of the tick before
      const eyes = eyeInWater(entity, world)
      entity.wasEyeInWater = vanilla.eyeInWaterLag ? !!entity.eyeInWater : eyes
      entity.eyeInWater = eyes
      updateSwimming(entity, world)
    }
    if (entity.isInWater) entity.fallDistance = 0
    if (vanilla.crouchLag) updateCrouching(entity, world)
    // a jump the auto-jump queued last tick presses jump now
    if (entity.autoJumpTime > 0) {
      entity.autoJumpTime--
      entity.control = { ...entity.control, jump: true }
    }
    // (26.3: not a passenger)
    if (vanilla.pushOutOfBlocks && entity.gameMode !== 'spectator' && !(vanilla.passengerNoPushOut && entity.vehicle)) {
      // LocalPlayer.moveTowardsClosestSpace from the four corners 0.35 widths out
      const w = f32(f32(0.6) * boxScale) * 0.35
      moveTowardsClosestSpace(entity, world, pos.x - w, pos.z + w)
      moveTowardsClosestSpace(entity, world, pos.x - w, pos.z - w)
      moveTowardsClosestSpace(entity, world, pos.x + w, pos.z - w)
      moveTowardsClosestSpace(entity, world, pos.x + w, pos.z + w)
    } else if (!vanilla.pushOutOfBlocks && entity.gameMode !== 'spectator') {
      // before 1.16 (EntityPlayerSP.pushOutOfBlocks / LocalPlayer.checkInBlock): from the four corners 0.35 widths out,
      // half a block above the feet
      const box = entityBox(entity)
      const w = f32(0.6) * 0.35
      const y = box.minY + 0.5
      pushOutOfBlock(entity, world, box, pos.x - w, y, pos.z + w)
      pushOutOfBlock(entity, world, box, pos.x - w, y, pos.z - w)
      pushOutOfBlock(entity, world, box, pos.x + w, y, pos.z - w)
      pushOutOfBlock(entity, world, box, pos.x + w, y, pos.z + w)
    }
    if (vanilla.sprintState) updateSprinting(entity, world)

    // Creative flight: a double press of jump toggles flying (LocalPlayer.aiStep), a take-off from the ground jumping
    let toggledFlight = false
    if (entity.mayFly && entity.control.jump && !entity.jumpHeld) {
      if (!(entity.jumpTriggerTime > 0)) {
        entity.jumpTriggerTime = 7
      } else if (!entity.swimming) {
        entity.flying = !entity.flying
        if (entity.flying && entity.onGround) jumpFromGround(entity, world)
        toggledFlight = true
        entity.jumpTriggerTime = 0
      }
    }

    // 1.15+: pressing jump in the air with an elytra starts gliding at once (LocalPlayer.aiStep, tryToStartFallFlying);
    // before, the server starts it
    if (vanilla.clientStartsGliding && !toggledFlight && !entity.flying && entity.control.jump && !entity.jumpHeld && !entity.elytraFlying && entity.elytraEquipped &&
      !entity.onGround && !entity.isInWater && !entity.levitation && !isOnLadder(world, entity.pos)) {
      entity.elytraFlying = true
    }

    // 1.13+: sneaking in water sinks (LocalPlayer.aiStep, goDownInWater)
    if (vanilla.fluidHeights && entity.isInWater && entity.control.sneak) vel.y -= f32(0.04)

    if (entity.flying) {
      // sneak and jump fly down and up at three times the flying speed
      const vertical = (entity.control.jump ? 1 : 0) - (entity.control.sneak ? 1 : 0)
      if (vertical !== 0) vel.y += f32(f32(vertical * f32(typeof entity.flySpeed === 'number' ? entity.flySpeed : 0.05)) * 3)
      entity.fallDistance = 0
    }
    if (entity.jumpTriggerTime > 0) entity.jumpTriggerTime--

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
        jumpFromGround(entity, world)
        entity.jumpTicks = physics.autojumpCooldown
      }
    } else {
      entity.jumpTicks = 0 // reset autojump cooldown
    }
    entity.jumpQueued = false

    const { xxa: strafe, zza: forward } = movementInput(entity)
    entity.xxa = strafe
    entity.zza = forward

    if (entity.swimming) {
      // Player.travel: a swimmer is pulled toward where it looks (0.085 when looking down more than 0.2, else 0.06),
      // upward only when jumping or with water above the head
      const lookY = viewVector(entity).y
      const pull = lookY < -0.2 ? 0.085 : 0.06
      const above = world.getBlock(new Vec3(pos.x, pos.y + 1.0 - 0.1, pos.z))
      if (lookY <= 0 || entity.control.jump || fluidOf(above, 'water') || fluidOf(above, 'lava')) vel.y += (lookY - vel.y) * pull
    }

    if (!vanilla.clientStartsGliding) fireworkBoost(entity)

    const flyingY = vel.y
    moveEntityWithHeading(entity, world, strafe, forward)
    if (entity.flying) {
      // Player.travel while flying: the vertical speed decays to 0.6 of what it was, no gravity; landing ends flight
      vel.y = flyingY * 0.6
      if (entity.onGround && entity.gameMode !== 'spectator') entity.flying = false
    }

    // A firework rocket the player glides with (FireworkRocketEntity.tick, after the player's own tick; checked on
    // 1.21.11, older versions keep boosting before the move)
    if (vanilla.clientStartsGliding) fireworkBoost(entity)

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
    entity.isCrouching = !!entity.control.sneak && (vanilla.shiftKeyWhileGliding || !entity.elytraFlying)
    if (vanilla.crouchPose) updatePose(entity, world)
    else if (vanilla.legacyPlayerSize) updateLegacySize(entity, world)

    return entity
  }

  // ---- boats (AbstractBoat) ----

  const BOAT_WIDTH = f32(1.375)
  const BOAT_HEIGHT = f32(0.5625)
  const isBoatType = type => /boat$|raft$/.test(type)
  const UNDER = new Set(['under_water', 'under_flowing_water'])

  // Entity.updateInWaterStateAndDoWaterCurrentPushing: in a boat that is not under water the passenger is not in it
  function inBoatAboveWater (entity) {
    return !!(vanilla.javaBoats && entity.vehicle && isBoatType(entity.vehicle.type) && !UNDER.has(entity.vehicle.status))
  }

  function boatBox (boat) {
    const half = BOAT_WIDTH / 2
    return new AABB(boat.pos.x - half, boat.pos.y, boat.pos.z - half, boat.pos.x + half, boat.pos.y + BOAT_HEIGHT, boat.pos.z + half)
  }

  const waterHeightAt = (world, pos) => {
    const fluid = fluidOf(world.getBlock(pos), 'water')
    return fluid ? { height: fluidHeight(world, pos, fluid, 'water'), source: fluid.amount === 8 && !fluid.falling } : null
  }

  // AbstractBoat.getStatus: under water (the top 0.001 under a water surface), in water (the bottom under one), on
  // land (the friction of the blocks just under it), else in the air; the water level as it finds it
  function boatStatus (boat, world) {
    const box = boatBox(boat)
    const top = box.maxY + 0.001
    let under = false
    const cursor = new Vec3(0, 0, 0)
    for (cursor.x = Math.floor(box.minX); cursor.x < Math.ceil(box.maxX); cursor.x++) {
      for (cursor.y = Math.floor(box.maxY); cursor.y < Math.ceil(top); cursor.y++) {
        for (cursor.z = Math.floor(box.minZ); cursor.z < Math.ceil(box.maxZ); cursor.z++) {
          const water = waterHeightAt(world, cursor)
          if (water && top < f32(cursor.y + water.height)) {
            if (!water.source) { boat.waterLevel = box.maxY; return 'under_flowing_water' }
            under = true
          }
        }
      }
    }
    if (under) { boat.waterLevel = box.maxY; return 'under_water' }
    let inWater = false
    boat.waterLevel = -Number.MAX_VALUE
    for (cursor.x = Math.floor(box.minX); cursor.x < Math.ceil(box.maxX); cursor.x++) {
      for (cursor.y = Math.floor(box.minY); cursor.y < Math.ceil(box.minY + 0.001); cursor.y++) {
        for (cursor.z = Math.floor(box.minZ); cursor.z < Math.ceil(box.maxZ); cursor.z++) {
          const water = waterHeightAt(world, cursor)
          if (water) {
            const level = f32(cursor.y + water.height)
            boat.waterLevel = Math.max(level, boat.waterLevel)
            inWater = inWater || box.minY < level
          }
        }
      }
    }
    if (inWater) return 'in_water'
    const friction = boatGroundFriction(boat, world, box)
    if (friction > 0) {
      boat.landFriction = friction
      return 'on_land'
    }
    return 'in_air'
  }

  // AbstractBoat.getGroundFriction: the mean friction of the blocks whose shapes touch the 0.001 slab under the boat
  function boatGroundFriction (boat, world, box) {
    const slab = new AABB(box.minX, box.minY - 0.001, box.minZ, box.maxX, box.minY, box.maxZ)
    const x0 = Math.floor(slab.minX) - 1
    const x1 = Math.ceil(slab.maxX) + 1
    const y0 = Math.floor(slab.minY) - 1
    const y1 = Math.ceil(slab.maxY) + 1
    const z0 = Math.floor(slab.minZ) - 1
    const z1 = Math.ceil(slab.maxZ) + 1
    let sum = 0
    let count = 0
    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        const edges = (x === x0 || x === x1 - 1 ? 1 : 0) + (z === z0 || z === z1 - 1 ? 1 : 0)
        if (edges === 2) continue
        for (let y = y0; y < y1; y++) {
          if (edges > 0 && (y === y0 || y === y1 - 1)) continue
          const block = world.getBlock(new Vec3(x, y, z))
          if (!block || block.name === 'lily_pad' || block.name === 'waterlily') continue
          const touches = collisionShapesOf(block, block.position).some(s => new AABB(x + s[0], y + s[1], z + s[2], x + s[3], y + s[4], z + s[5]).intersects(slab))
          if (touches) {
            sum = f32(sum + f32(blockSlipperiness[block.type] || physics.defaultSlipperiness))
            count++
          }
        }
      }
    }
    return f32(sum / count)
  }

  // AbstractBoat.getWaterLevelAbove
  function boatWaterLevelAbove (boat, world) {
    const box = boatBox(boat)
    const y1 = Math.ceil(box.maxY - (boat.lastYd || 0))
    const cursor = new Vec3(0, 0, 0)
    for (let y = Math.floor(box.maxY); y < y1; y++) {
      let height = 0
      let full = false
      for (let x = Math.floor(box.minX); x < Math.ceil(box.maxX) && !full; x++) {
        for (let z = Math.floor(box.minZ); z < Math.ceil(box.maxZ); z++) {
          cursor.set(x, y, z)
          const water = waterHeightAt(world, cursor)
          if (water) height = Math.max(height, water.height)
          if (height >= 1) { full = true; break }
        }
      }
      if (!full && height < 1) return f32(y + height)
    }
    return f32(y1 + 1)
  }

  // AbstractBoat.floatBoat: gravity and buoyancy, and the friction of where the boat is
  function floatBoat (boat, world, oldStatus) {
    const vel = boat.vel
    // (before 1.20.5 the gravity is -0.04F, the buoyancy 0.04F / 0.65)
    let gravity = vanilla.playerAttributes ? -0.04 : -0.03999999910593033
    let buoyancy = 0
    let friction = f32(0.05)
    if (oldStatus === 'in_air' && boat.status !== 'in_air' && boat.status !== 'on_land') {
      boat.waterLevel = boat.pos.y + BOAT_HEIGHT
      const y = (boatWaterLevelAbove(boat, world) - BOAT_HEIGHT) + 0.101
      const moved = boatBox(boat).offset(0, y - boat.pos.y, 0)
      // (1.21+: only where the boat fits)
      if (!vanilla.candidateStepHeights || !collidesWithBlocks(world, moved)) {
        boat.pos.y = y
        vel.y = 0
        boat.lastYd = 0
      }
      boat.status = 'in_water'
      return
    }
    if (boat.status === 'in_water') {
      buoyancy = (boat.waterLevel - boat.pos.y) / BOAT_HEIGHT
      friction = f32(0.9)
    } else if (boat.status === 'under_flowing_water') {
      gravity = -7.0e-4
      friction = f32(0.9)
    } else if (boat.status === 'under_water') {
      buoyancy = 0.009999999776482582
      friction = f32(0.45)
    } else if (boat.status === 'in_air') {
      friction = f32(0.9)
    } else if (boat.status === 'on_land') {
      friction = boat.landFriction
      boat.landFriction = f32(boat.landFriction / 2) // a player steers it
    }
    vel.x *= friction
    vel.y += gravity
    vel.z *= friction
    boat.deltaRotation = f32(boat.deltaRotation * friction)
    if (buoyancy > 0) vel.y = (vel.y + buoyancy * (vanilla.playerAttributes ? 0.04 / 0.65 : 0.06153846016296973)) * 0.75
  }

  // AbstractBoat.controlBoat: the keys of the tick before turn it and paddle it along its yaw
  function controlBoat (boat) {
    const input = boat.input || {}
    let push = 0
    if (input.left) boat.deltaRotation = f32(boat.deltaRotation - 1)
    if (input.right) boat.deltaRotation = f32(boat.deltaRotation + 1)
    if (!!input.right !== !!input.left && !input.up && !input.down) push = f32(push + f32(0.005))
    boat.yaw = f32(boat.yaw + boat.deltaRotation)
    if (input.up) push = f32(push + f32(0.04))
    if (input.down) push = f32(push - f32(0.005))
    boat.vel.x += f32(mthSin(f32(-boat.yaw * DEG_TO_RAD_F)) * push)
    boat.vel.z += f32(mthCos(f32(boat.yaw * DEG_TO_RAD_F)) * push)
  }

  // Entity.move for the boat: no step, the velocity stopped on the axes that hit, a landing bounce or stop, the speed
  // factor of the blocks
  function moveBoat (boat, world) {
    const vel = boat.vel
    // (before 1.17 the kept box moves and the position is its center; before 1.14 every move counts)
    const keepsBox = vanilla.positionFromBoxCenter || !vanilla.modernMove
    const kept = boat.javaBox
    const box = keepsBox && kept && kept.at[0] === boat.pos.x && kept.at[1] === boat.pos.y && kept.at[2] === boat.pos.z ? kept.clone() : boatBox(boat)
    const saved = collisionContext
    collisionContext = { x: boat.pos.x, z: boat.pos.z, bottom: boat.pos.y, descending: false, fallDistance: 0, walksOnPowderSnow: false }
    let moved
    try {
      moved = (vel.x === 0 && vel.y === 0 && vel.z === 0) ? { x: 0, y: 0, z: 0 } : collideBoundingBox(world, vel.x, vel.y, vel.z, box)
    } finally {
      collisionContext = saved
    }
    const movedSqr = moved.x * moved.x + moved.y * moved.y + moved.z * moved.z
    const requestedSqr = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z
    if (!vanilla.modernMove || movedSqr > 1.0e-7 || (vanilla.moveWhenBlocked && requestedSqr - movedSqr < 1.0e-7)) {
      if (keepsBox) {
        const movedBox = box.clone().offset(moved.x, moved.y, moved.z)
        boat.pos.x = (movedBox.minX + movedBox.maxX) / 2
        boat.pos.y = movedBox.minY
        boat.pos.z = (movedBox.minZ + movedBox.maxZ) / 2
        movedBox.at = [boat.pos.x, boat.pos.y, boat.pos.z]
        boat.javaBox = movedBox
      } else {
        boat.pos.x += moved.x
        boat.pos.y += moved.y
        boat.pos.z += moved.z
      }
    }
    const collidedX = !nearlyEqual(vel.x, moved.x)
    const collidedZ = !nearlyEqual(vel.z, moved.z)
    boat.isCollidedHorizontally = collidedX || collidedZ
    boat.isCollidedVertically = vel.y !== moved.y
    boat.onGround = boat.isCollidedVertically && vel.y < 0
    if (vanilla.supportingBlock) checkSupportingBlock(boat, world, boatBox(boat), moved)
    boat.lastYd = vel.y
    if (collidedX) vel.x = 0
    if (collidedZ) vel.z = 0
    if (vel.y !== moved.y) {
      const block = world.getBlock(getOnPos(boat, f32(0.2)))
      if (block && block.type === slimeBlockId) {
        if (vel.y < 0) vel.y = -vel.y * 0.8
      } else if (block && vanilla.bedBounce && bedIds.has(block.type)) {
        if (vel.y < 0) vel.y = -vel.y * f32(0.66) * 0.8
      } else {
        vel.y = 0
      }
    }
    speedFactor(boat, world)
  }

  // AbstractBoat.tick on the client that drives it
  function tickBoat (boat, world) {
    const oldStatus = boat.status
    boat.status = boatStatus(boat, world)
    boat.control = boat.control || {}
    if (!UNDER.has(boat.status)) {
      // Entity.baseTick: the current pushes the boat
      updateFluid(boat, world, boatBox(boat), 'water', 0.014)
    }
    floatBoat(boat, world, oldStatus)
    controlBoat(boat)
    moveBoat(boat, world)
  }

  // AbstractBoat.positionRider: the passenger on the boat's attachment point (a third of its height up, a raft's
  // 8/9; the player's own attachment 0.6 down), turned with the boat and kept within 105 degrees of it
  function positionBoatRider (entity, boat) {
    const rideHeight = /raft$/.test(boat.type) ? f32(BOAT_HEIGHT * f32(0.8888889)) : f32(BOAT_HEIGHT / f32(3))
    entity.pos.x = boat.pos.x
    // (before 1.20.5 the passenger's own riding offset, -0.6F, is a float; before 1.20.2 the boat's riding offset,
    // -0.1 or a raft's 0.25, plus the player's -0.35, in float)
    if (!vanilla.attachmentPoints) entity.pos.y = boat.pos.y + f32((/raft$/.test(boat.type) ? 0.25 : -0.1) + -0.35)
    else entity.pos.y = vanilla.entityAttachments ? (boat.pos.y + rideHeight) - 0.6 : (rideHeight + boat.pos.y) + f32(-0.6)
    entity.pos.z = boat.pos.z
    let yaw = f32(yawDegrees(entity) + boat.deltaRotation)
    const relative = wrapDegrees(f32(yaw - boat.yaw))
    const clamped = Math.max(f32(-105), Math.min(f32(105), relative))
    yaw = f32(yaw + f32(clamped - relative))
    entity.yawDegrees = yaw
    entity.yaw = Math.PI - yaw * Math.PI / 180
  }

  function wrapDegrees (degrees) {
    let wrapped = f32(degrees % 360)
    if (wrapped >= 180) wrapped = f32(wrapped - 360)
    if (wrapped < -180) wrapped = f32(wrapped + 360)
    return wrapped
  }

  // ---- mounts the player drives: horses (AbstractHorse), a pig steered with its stick (ItemSteerable) ----

  // seat: the passenger attachment (1.20.5+); below: before, the seat under the top (getPassengersRidingOffsetY)
  const HORSE = { width: f32(1.3964844), height: f32(1.6), seat: f32(1.44375), below: f32(0.15625), step: 1, jumps: true }
  const HORSES = {
    horse: HORSE,
    donkey: { ...HORSE, height: f32(1.5), seat: f32(1.1125) },
    mule: { ...HORSE, seat: f32(1.2125) },
    skeleton_horse: { ...HORSE, seat: f32(1.31875) },
    zombie_horse: { ...HORSE, seat: f32(1.31875) },
    pig: { width: f32(0.9), height: f32(0.9), seat: f32(0.86875), below: f32(0.03125), step: 0.6, steered: true },
    // a strider: steered at 0.55 its speed, standing on lava, its rider bobbing with its gait
    strider: { width: f32(0.9), height: f32(1.7), seat: f32(1.7), below: 0, step: 0.6, steered: true, steerFactor: f32(0.55), onLava: true },
    // a camel: the rider 0.5 forward on its back (0.375 under its top), a dash for a jump, 0.1 faster sprinting
    camel: { width: f32(1.7), height: f32(2.375), seat: f32(2.375) - f32(0.375), below: f32(0.375), forward: f32(0.5), step: 1.5, jumps: true, dash: true }
  }

  // LocalPlayer.aiStep: holding jump on a horse charges the jump (0.1 a tick to 0.9, then easing back toward 0.8);
  // letting go hands it to the horse (onPlayerJump: 0.4 + 0.4 * power / 90, full from 90) and rests 10 ticks.
  function chargeRidingJump (entity, horse) {
    const wasJumping = !!entity.jumpHeld
    const jumping = !!entity.control.jump
    let ticks = entity.jumpRidingTicks || 0
    let scale = f32(horse.jumpRidingScale || 0)
    if (ticks < 0) {
      ticks++
      if (ticks === 0) scale = 0
    }
    if (horse.dashCooldown > 0) {
      // (Camel: no charge while the dash cools down)
      entity.jumpRidingTicks = ticks
      horse.jumpRidingScale = 0
      return
    }
    if (wasJumping && !jumping) {
      ticks = -10
      const power = Math.floor(f32(scale * 100))
      if (HORSES[horse.type].dash && !horse.onGround) {
        entity.jumpRidingTicks = ticks
        horse.jumpRidingScale = scale
        return
      }
      horse.pendingJump = power >= 90 ? 1 : f32(f32(0.4) + f32(f32(f32(0.4) * Math.max(power, 0)) / 90))
      // (and rears for 20 ticks: standIfPossible; before 1.21.5 the client leaves that to the server)
      if (power >= 0) {
        horse.allowStandSliding = true
        // (the client rears the horse itself before 1.19.4 and since 1.21.5)
        if ((!vanilla.riddenDamping || vanilla.clientRearingLegacy) && !HORSES[horse.type].dash) {
          horse.standing = true
          horse.standCounter = 20
        }
      }
    } else if (!wasJumping && jumping) {
      ticks = 0
      scale = 0
    } else if (wasJumping) {
      ticks++
      scale = ticks < 10 ? f32(ticks * f32(0.1)) : f32(f32(0.8) + f32(f32(2 / (ticks - 9)) * f32(0.1)))
    }
    entity.jumpRidingTicks = ticks
    horse.jumpRidingScale = scale
  }

  // AbstractHorse ridden: on the rider's last keys and rotation it turns, jumps when a charged jump is pending and it
  // stands on the ground, and travels like any living entity at its own speed (half sideways, a quarter backwards).
  function tickHorse (horse, world) {
    const dims = HORSES[horse.type]
    const saved = { boxHalfWidth, boxHeight, boxScale }
    boxHalfWidth = dims.width / 2
    boxHeight = dims.height
    boxScale = 1
    try {
      const speedKey = mcData.attributesByName.movementSpeed.resource
      horse.attributes = { [speedKey]: { value: horse.movementSpeed, modifiers: [] } }
      horse.control = {}
      horse.stepHeight = horse.stepHeight || dims.step
      // getRiddenSpeed: a horse's movement speed; a steered pig's times 0.225 (and its boost)
      let speed = dims.steered ? f32(horse.movementSpeed * (dims.steerFactor || 0.225) * (horse.boostFactor || 1)) : f32(horse.movementSpeed)
      if (dims.onLava) {
        // Strider.tick: away from lava (none at its feet or under it, none around it the tick before) it suffocates:
        // its speed loses 0.34 of its base (0.175) and it is steered at 0.35 of that
        const lavaAt = p => lavaIds.includes((world.getBlock(p) || {}).type)
        const warm = lavaAt(horse.pos.floored()) || lavaAt(getOnPos(horse, f32(0.2))) || horse.lavaHeight > 0
        const base = 0.17499999701976776
        const attr = warm ? base : base + base * -0.3400000035762787
        speed = f32(attr * (warm ? f32(0.55) : f32(0.35)) * (horse.boostFactor || 1))
      }
      if (dims.dash && horse.riderSprinting && !(horse.dashCooldown > 0)) speed = f32(speed + f32(0.1))
      horse.attributes[speedKey] = { value: speed, modifiers: [] }
      horse.airSpeed = f32(speed * f32(0.1))
      // Entity.baseTick: the fluids around it
      const water = updateFluid(horse, world, getPlayerBB(horse.pos), 'water', 0.014)
      horse.isInWater = water.found
      horse.waterHeight = water.height
      const lava = updateFluid(horse, world, getPlayerBB(horse.pos), 'lava', 0.0023333333333333335)
      horse.isInLava = lava.height > 0
      horse.lavaHeight = lava.height
      // a strider stands on lava: it travels as on land (canStandOnFluid) and floats up out of it after
      const inLava = horse.isInLava
      if (dims.onLava) {
        horse.standsOnLava = true
        horse.isInLava = false
      }
      const before = horse.pos.clone()
      // LivingEntity.aiStep: before 1.21.5 the client damps the horse it drives (it is not its "effective AI"), then tiny
      // speeds stop
      const vel = horse.vel
      if (vanilla.riddenDamping) {
        vel.x *= 0.98
        vel.y *= 0.98
        vel.z *= 0.98
      }
      if (Math.abs(vel.x) < 0.003) vel.x = 0
      if (Math.abs(vel.y) < 0.003) vel.y = 0
      if (Math.abs(vel.z) < 0.003) vel.z = 0
      // getRiddenInput: none while it rears on the ground (unless the rider's jump let it slide)
      // (a steered pig always goes forward)
      const input = dims.steered ? { xxa: 0, zza: 1 } : horse.riderInput || { xxa: 0, zza: 0 }
      const rearing = horse.onGround && !(horse.pendingJump > 0) && horse.standing && !horse.allowStandSliding
      const strafe = rearing || dims.steered ? 0 : f32(input.xxa * f32(0.5))
      let forward = rearing ? 0 : f32(input.zza)
      if (forward <= 0) forward = f32(forward * f32(0.25))
      // tickRidden: the rider's rotation (half its pitch) and the pending jump
      // (Entity.setRot keeps it within a turn)
      horse.yawDegrees = f32(f32(horse.riderYaw === undefined ? horse.yaw : horse.riderYaw) % 360)
      horse.yaw = horse.yawDegrees
      if (horse.onGround) {
        if (horse.pendingJump > 0 && dims.dash) {
          // Camel.executeRidersJump: a dash along its look, 22.2222 its speed by the charge, up 1.4285 its jump power
          const scale = horse.pendingJump
          const lookYaw = f32(-horse.yawDegrees * DEG_TO_RAD_F)
          const lookPitch = f32(f32(horse.pitchDegrees || 0) * DEG_TO_RAD_F)
          let lx = f32(mthSin(lookYaw) * mthCos(lookPitch))
          let lz = f32(mthCos(lookYaw) * mthCos(lookPitch))
          const length = Math.sqrt(lx * lx + lz * lz)
          lx = length < 1.0e-5 ? 0 : lx / length
          lz = length < 1.0e-5 ? 0 : lz / length
          const factor = blockFactor(horse, world, block => (block.type === soulsandId || block.type === honeyblockId) ? f32(physics.soulsandSpeed) : 1, true)
          const push = f32(f32(22.2222) * scale) * horse.movementSpeed * factor
          const jumpPower = f32(f32(horse.jumpStrength) * blockFactor(horse, world, block => block.type === honeyblockId ? f32(physics.honeyblockJumpSpeed) : 1, false))
          vel.x += lx * push
          vel.y += f32(f32(1.4285) * scale) * jumpPower
          vel.z += lz * push
          horse.dashCooldown = 55
        } else if (horse.pendingJump > 0) {
          // (getJumpPower in float since 1.20.5; the jump strength in double before)
          const factor = blockFactor(horse, world, block => block.type === honeyblockId ? f32(physics.honeyblockJumpSpeed) : 1, false)
          const power = vanilla.playerAttributes ? f32(f32(f32(horse.jumpStrength) * horse.pendingJump) * factor) : horse.jumpStrength * horse.pendingJump * factor
          vel.y = power
          if (forward > 0) {
            const rad = f32(horse.yawDegrees * DEG_TO_RAD_F)
            vel.x += f32(f32(f32(-0.4) * mthSin(rad)) * horse.pendingJump)
            vel.z += f32(f32(f32(0.4) * mthCos(rad)) * horse.pendingJump)
          }
        }
        horse.pendingJump = 0
      }
      moveEntityWithHeading(horse, world, strafe, forward)
      if (dims.onLava) {
        // (26.1+ looks at the fluids again after the move)
        if (!vanilla.unifiedFluidInteraction) horse.isInLava = inLava
        if (horse.isInLava) {
          // Strider.floatStrider
          const cell = horse.pos.floored()
          const aboveLava = lavaIds.includes((world.getBlock(cell.offset(0, 1, 0)) || {}).type)
          if (horse.pos.y > cell.y + 0.5 - 9.999999747378752e-6 && !aboveLava) horse.onGround = true
          else {
            vel.x = vel.x * 0.5
            vel.y = vel.y * 0.5 + 0.05
            vel.z = vel.z * 0.5
          }
        }
        // LivingEntity.calculateEntityAnimation: the gait from the horizontal distance moved
        const moved = f32(Math.sqrt((horse.pos.x - before.x) ** 2 + (horse.pos.z - before.z) ** 2))
        const target = Math.min(f32(moved * 4), 1)
        horse.walkSpeed = f32((horse.walkSpeed || 0) + f32(f32(target - (horse.walkSpeed || 0)) * f32(0.4)))
        horse.walkPosition = f32((horse.walkPosition || 0) + horse.walkSpeed)
      }
      if (horse.dashCooldown > 0) horse.dashCooldown--
      // AbstractHorse.tick: the rearing ends when its count runs out; its animation (the value of the tick before places
      // the rider)
      if (horse.standCounter > 0 && --horse.standCounter <= 0) horse.standing = false
      const anim = f32(horse.standAnim || 0)
      horse.standAnimO = anim
      if (horse.standing) {
        horse.standAnim = Math.min(1, f32(anim + f32(f32(f32(1 - anim) * f32(0.4)) + f32(0.05))))
      } else {
        horse.allowStandSliding = false
        horse.standAnim = Math.max(0, f32(anim + f32(f32(f32(f32(f32(f32(f32(0.8) * anim) * anim) * anim) - anim) * f32(0.6)) - f32(0.05))))
      }
    } finally {
      boxHalfWidth = saved.boxHalfWidth
      boxHeight = saved.boxHeight
      boxScale = saved.boxScale
    }
  }

  // org.joml.Math.cosFromSin: the cosine from the sine, its sign from the angle
  function jomlCosFromSin (sin, angle) {
    const cos = f32(Math.sqrt(f32(1 - f32(sin * sin))))
    const PI2 = f32(Math.PI * 2)
    const a = f32(angle + f32(Math.PI / 2))
    let b = f32(a - f32(Math.trunc(f32(a / PI2)) * PI2))
    if (b < 0) b = f32(PI2 + b)
    return b >= f32(Math.PI) ? -cos : cos
  }

  // AbstractHorse.positionRider: the rider on the horse's seat (its passenger attachment), the player's own 0.6 down
  function positionHorseRider (entity, horse) {
    const dims = HORSES[horse.type]
    if (!vanilla.attachmentPoints) return positionLegacyRider(entity, horse, dims)
    // (rearing leans the seat back: 0.15 up and 0.7 behind by the animation, turned with the horse)
    const anim = f32(horse.standAnimO || 0)
    const angle = f32(-f32(horse.yawDegrees === undefined ? horse.yaw : horse.yawDegrees) * DEG_TO_RAD_F)
    // (before 1.20.5 a float vector turned by JOML)
    const back = (vanilla.entityAttachments ? -0.7 * anim : f32(f32(-0.7) * anim)) + (dims.forward || 0)
    const sin = vanilla.entityAttachments ? mthSin(angle) : f32(javaMath.sin(angle))
    const cos = vanilla.entityAttachments ? mthCos(angle) : jomlCosFromSin(sin, angle)
    const offX = vanilla.entityAttachments ? back * sin : f32(back * sin)
    const offZ = vanilla.entityAttachments ? back * cos : f32(back * cos)
    entity.pos.x = horse.pos.x + offX
    entity.pos.z = horse.pos.z + offZ
    // (a strider's rider bobs: 0.24 by the cosine of its gait, by its pace up to 0.25)
    const bob = dims.onLava ? f32(f32(f32(f32(0.12) * mthCos(f32((horse.walkPosition || 0) * f32(1.5)))) * f32(2)) * Math.min(f32(0.25), horse.walkSpeed || 0)) : 0
    if (vanilla.entityAttachments) {
      entity.pos.y = (horse.pos.y + (dims.seat + 0.15 * anim + bob)) - 0.6
    } else {
      // before 1.20.5: float offsets, the seat 0.15625 under the top
      const seat = f32(f32(dims.height - dims.below) + f32(f32(0.15) * anim))
      entity.pos.y = (seat + horse.pos.y) + f32(-0.6)
    }
  }

  // Before 1.20.2: the vehicle's riding offset (three quarters of its height; a camel's height less 0.6) plus the
  // player's -0.35; a rearing horse leans it 0.7 back and 0.15 up by its animation, a camel seats it 0.5 forward.
  function positionLegacyRider (entity, mount, dims) {
    const yaw = f32(mount.yawDegrees === undefined ? mount.yaw : mount.yawDegrees)
    if (dims.forward) {
      const g = f32((dims.height - f32(0.6)) + -0.35)
      const angle = f32(-yaw * DEG_TO_RAD_F)
      entity.pos.x = mount.pos.x + dims.forward * mthSin(angle)
      entity.pos.y = mount.pos.y + g
      entity.pos.z = mount.pos.z + dims.forward * mthCos(angle)
      return
    }
    const y = mount.pos.y + dims.height * 0.75 + -0.35
    const anim = f32(mount.standAnimO || 0)
    if (anim > 0) {
      const sin = mthSin(f32(yaw * DEG_TO_RAD_F))
      const cos = mthCos(f32(yaw * DEG_TO_RAD_F))
      const back = f32(f32(0.7) * anim)
      entity.pos.x = mount.pos.x + f32(back * sin)
      entity.pos.y = y + f32(f32(0.15) * anim)
      entity.pos.z = mount.pos.z - f32(back * cos)
      return
    }
    entity.pos.x = mount.pos.x
    entity.pos.y = y
    entity.pos.z = mount.pos.z
  }

  // ---- pistons (PistonMovingBlockEntity on the client) ----

  // A piston head's shapes for a direction: the plate at its far end and the arm reaching a quarter back
  function pistonHeadShapes (dir) {
    const axis = dir[0] !== 0 ? 0 : dir[1] !== 0 ? 1 : 2
    const positive = dir[axis] > 0
    const plate = [0, 0, 0, 1, 1, 1]
    const arm = [0.375, 0.375, 0.375, 0.625, 0.625, 0.625]
    plate[axis] = positive ? 0.75 : 0
    plate[axis + 3] = positive ? 1 : 0.25
    arm[axis] = positive ? -0.25 : 0.25
    arm[axis + 3] = positive ? 0.75 : 1.25
    return [plate, arm]
  }

  // PistonMath.getMovementArea: the slab a box sweeps ahead of it by d
  function movementArea (box, dir, d) {
    const a = box.clone()
    if (dir[0] > 0) { a.minX = box.maxX; a.maxX = box.maxX + d }
    if (dir[0] < 0) { a.maxX = box.minX; a.minX = box.minX - d }
    if (dir[1] > 0) { a.minY = box.maxY; a.maxY = box.maxY + d }
    if (dir[1] < 0) { a.maxY = box.minY; a.minY = box.minY - d }
    if (dir[2] > 0) { a.minZ = box.maxZ; a.maxZ = box.maxZ + d }
    if (dir[2] < 0) { a.maxZ = box.minZ; a.minZ = box.minZ - d }
    return a
  }

  // PistonMovingBlockEntity.getMovement: how far the area reaches into the entity's box
  function pistonMovement (area, dir, box) {
    if (dir[0] > 0) return area.maxX - box.minX
    if (dir[0] < 0) return box.maxX - area.minX
    if (dir[1] > 0) return area.maxY - box.minY
    if (dir[1] < 0) return box.maxY - area.minY
    if (dir[2] > 0) return area.maxZ - box.minZ
    return box.maxZ - area.minZ
  }

  // PistonMovingBlockEntity.tick, after the entities: each moving piston head advances half a block and pushes the
  // player its sweep reaches by as far as it reaches in, plus 0.01 (Entity.move with MoverType.PISTON: no more than
  // 0.51 an axis a tick). The caller lists them as entity.pistons ([{ x, y, z, dir, extending, progress }], the cell
  // the head moves into or out of).
  function tickPistons (entity, world) {
    if (!entity.pistons || !entity.pistons.length) return
    const pushed = [0, 0, 0]
    entity.pistons = entity.pistons.filter(piston => {
      if (piston.progress >= 1) return false
      const next = Math.min(1, f32(piston.progress + f32(0.5)))
      const moveDir = piston.extending ? piston.dir : piston.dir.map(v => -v)
      const d = next - piston.progress
      const offset = piston.extending ? piston.progress - 1 : 1 - piston.progress
      const box = getPlayerBB(entity.pos)
      let reach = 0
      for (const shape of pistonHeadShapes(piston.dir)) {
        const head = new AABB(piston.x + shape[0] + piston.dir[0] * offset, piston.y + shape[1] + piston.dir[1] * offset, piston.z + shape[2] + piston.dir[2] * offset,
          piston.x + shape[3] + piston.dir[0] * offset, piston.y + shape[4] + piston.dir[1] * offset, piston.z + shape[5] + piston.dir[2] * offset)
        const area = movementArea(head, moveDir, d)
        if (area.intersects(box)) {
          reach = Math.max(reach, pistonMovement(area, moveDir, box))
          if (reach >= d) break
        }
      }
      if (reach > 0) {
        // (where the player's own tick left it, before any piston moved it: what it reports to the server)
        if (!entity.beforePistons) entity.beforePistons = { pos: entity.pos.clone(), onGround: entity.onGround, isCollidedHorizontally: entity.isCollidedHorizontally }
        const amount = Math.min(reach, d) + 0.01
        const move = moveDir.map((v, i) => {
          // Entity.limitPistonMovement
          const want = amount * v
          const limited = Math.max(-0.51, Math.min(0.51, pushed[i] + want)) - pushed[i]
          pushed[i] += limited
          return limited
        })
        entity.pistonMove = true
        try {
          moveEntity(entity, world, move[0], move[1], move[2])
        } finally {
          entity.pistonMove = false
        }
      }
      piston.progress = next
      return true
    })
  }

  physics.simulatePlayer = (entity, world) => {
    entity.beforePistons = undefined
    simulateWithVehicle(entity, world)
    tickPistons(entity, world)
    return entity
  }

  const simulateWithVehicle = (entity, world) => {
    const vehicle = entity.vehicle
    if (vanilla.javaBoats && vehicle && HORSES[vehicle.type] && (!HORSES[vehicle.type].steered || vehicle.steered)) {
      // the horse faces where its rider looks now, half its pitch (the keys are those of the rider's last tick)
      vehicle.riderYaw = yawDegrees(entity)
      vehicle.pitchDegrees = f32(pitchDegrees(entity) * f32(0.5))
      tickHorse(vehicle, world)
      entity.vel.x = 0
      entity.vel.y = 0
      entity.vel.z = 0
      if (HORSES[vehicle.type].jumps) chargeRidingJump(entity, vehicle)
      simulateOwn(entity, world)
      positionHorseRider(entity, vehicle)
      vehicle.riderInput = { xxa: entity.xxa, zza: entity.zza }
      vehicle.riderSprinting = !!entity.sprinting
      return entity
    }
    if (vanilla.javaBoats && vehicle && /minecart$/.test(vehicle.type)) {
      // a minecart is the server's: the caller keeps it where the client has it; the rider ticks from rest and sits
      // on it (its attachment 0.1875 up, the player's 0.6 down)
      entity.vel.x = 0
      entity.vel.y = 0
      entity.vel.z = 0
      simulateOwn(entity, world)
      entity.pos.x = vehicle.pos.x
      // (before 1.20.2 the cart's riding offset 0 and the player's -0.35)
      entity.pos.y = !vanilla.attachmentPoints ? vehicle.pos.y + 0.0 + -0.35 : vanilla.entityAttachments ? (vehicle.pos.y + f32(0.1875)) - 0.6 : vehicle.pos.y + f32(0.1875) + f32(-0.6)
      entity.pos.z = vehicle.pos.z
      return entity
    }
    const boat = entity.vehicle
    if (!vanilla.javaBoats || !boat || !isBoatType(boat.type)) {
      simulateOwn(entity, world)
      if (!boat) pushedByBoats(entity)
      return entity
    }
    // the boat ticks before its passenger, on the keys the passenger left it the tick before
    tickBoat(boat, world)
    // Entity.rideTick: the passenger's own velocity starts from rest
    entity.vel.x = 0
    entity.vel.y = 0
    entity.vel.z = 0
    simulateOwn(entity, world)
    positionBoatRider(entity, boat)
    const control = entity.control
    boat.input = { left: !!control.left, right: !!control.right, up: !!control.forward, down: !!control.back }
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
    this.swimming = bot.entity.swimming ?? false
    this.autoSpinAttack = bot.entity.autoSpinAttack ?? false
    this.fallDistance = bot.entity.fallDistance ?? 0
    this.sprintTriggerTime = bot.entity.sprintTriggerTime ?? 0
    this.jumpTriggerTime = bot.entity.jumpTriggerTime ?? 0
    this.hadForward = bot.entity.hadForward ?? false
    this.isInPowderSnow = bot.entity.isInPowderSnow ?? false
    this.eyeInWater = bot.entity.eyeInWater ?? false
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
    // the auto-jump option and the jump it queued for the next tick
    this.autoJump = !!bot.autoJump
    this.autoJumpTime = bot.autoJumpTime || 0
    this.jumpRidingTicks = bot.jumpRidingTicks || 0
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
    // The vehicle the bot rides (the Bedrock engine's, kept by mineflayer's vehicles plugin as bot.bedrockVehicle;
    // the Java engine's, kept by mineflayer's physics plugin as bot.javaVehicle).
    this.vehicle = bot.bedrockVehicle || bot.javaVehicle || undefined
    // The big-wave roll of a boat the bot steers (a uniform draw in [0, 1)), where the caller supplies the client's.
    this.bigWaveRoll = typeof bot.bedrockBigWaveRoll === 'function' ? bot.bedrockBigWaveRoll : undefined
    // The client's core random state (a recording's), from which the boat draws the roll itself.
    this.randomState = bot.bedrockRandomState

    // Input only (not modified)
    this.attributes = bot.entity.attributes
    // the other entities around the player (mineflayer's bot.entities): the solid ones it collides with, the mobs
    // and boats that push it
    if (bot.entities && mcData.type !== 'bedrock') {
      this.entities = Object.values(bot.entities).filter(e => e && e !== bot.entity && e.position && e.name && e.id !== (bot.entity.vehicle && bot.entity.vehicle.id))
        .map(e => ({ id: e.id, type: e.name, pos: e.position.clone() }))
    }
    this.yaw = bot.entity.yaw
    this.pitch = bot.entity.pitch
    // the vanilla rotation in degrees when the bot keeps it (radians lose whole turns and float precision)
    if (typeof bot.entity.yawDegrees === 'number') this.yawDegrees = bot.entity.yawDegrees
    if (typeof bot.entity.pitchDegrees === 'number') this.pitchDegrees = bot.entity.pitchDegrees
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
    bot.entity.swimming = this.swimming
    bot.entity.fallDistance = this.fallDistance
    bot.entity.sprintTriggerTime = this.sprintTriggerTime
    bot.entity.jumpTriggerTime = this.jumpTriggerTime
    bot.entity.hadForward = this.hadForward
    bot.entity.isInPowderSnow = this.isInPowderSnow
    bot.entity.eyeInWater = this.eyeInWater
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
    bot.autoJumpTime = this.autoJumpTime
    bot.jumpRidingTicks = this.jumpRidingTicks
    bot.riptideLaunch = this.riptideLaunch
    bot.spinHits = this.spinHits
    bot.fireworkUsed = this.fireworkUsed
    bot.itemUseStarted = this.itemUseStarted
    if (bot.bedrockVehicle) bot.bedrockVehicle = this.vehicle
    if (bot.javaVehicle) bot.javaVehicle = this.vehicle
    // the rotation a tick turned (a boat's rider turns with it), where the bot keeps it in degrees
    if (typeof bot.entity.yawDegrees === 'number' && this.yawDegrees !== bot.entity.yawDegrees) {
      bot.entity.yawDegrees = this.yawDegrees
      bot.entity.yaw = this.yaw
    }
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
