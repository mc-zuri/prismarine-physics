const Vec3 = require('vec3').Vec3
const AABB = require('./lib/aabb')
const math = require('./lib/math')
const features = require('./lib/features')
const attribute = require('./lib/attribute')
const nbt = require('prismarine-nbt')

function makeSupportFeature (mcData) {
  return feature => features.some(({ name, versions }) => name === feature && versions.includes(mcData.version.majorVersion))
}

function Physics (mcData, world) {
  const supportFeature = makeSupportFeature(mcData)
  const blocksByName = mcData.blocksByName

  // Block Slipperiness
  // https://www.mcpk.wiki/w/index.php?title=Slipperiness
  const blockSlipperiness = {}
  const slimeBlockId = blocksByName.slime_block ? blocksByName.slime_block.id : blocksByName.slime.id
  const bedIds = new Set(Object.values(blocksByName).filter(block => block.name === 'bed' || block.name.endsWith('_bed')).map(block => block.id))
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
  const soulsoilId = blocksByName.soul_soil ? blocksByName.soul_soil.id : -1 // 1.16+
  const honeyblockId = blocksByName.honey_block ? blocksByName.honey_block.id : -1 // 1.15+
  const webId = blocksByName.cobweb ? blocksByName.cobweb.id : blocksByName.web.id
  const airId = blocksByName.air.id
  const sweetBerryBushId = blocksByName.sweet_berry_bush ? blocksByName.sweet_berry_bush.id : -1 // 1.14+
  const powderSnowId = blocksByName.powder_snow ? blocksByName.powder_snow.id : -1 // 1.17+
  const waterIds = [blocksByName.water.id, blocksByName.flowing_water ? blocksByName.flowing_water.id : -1]
  const lavaIds = [blocksByName.lava.id, blocksByName.flowing_lava ? blocksByName.flowing_lava.id : -1]
  const ladderId = blocksByName.ladder.id
  const vineId = blocksByName.vine.id
  const scaffoldingId = blocksByName.scaffolding ? blocksByName.scaffolding.id : -1 // 1.14+
  // the climbable tag's vines (1.16+ weeping and twisting, 1.17+ cave)
  const vineLikeIds = new Set(['weeping_vines', 'weeping_vines_plant', 'twisting_vines', 'twisting_vines_plant', 'cave_vines', 'cave_vines_plant']
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
    playerSpeed: Math.fround(0.1), // Player's MOVEMENT_SPEED, 0.1F widened to double
    sprintSpeed: Math.fround(0.3), // LivingEntity's sprinting speed modifier, 0.3F widened to double
    minorCollisionAngle: Math.fround(0.13962634), // LocalPlayer.MINOR_COLLISION_ANGLE_THRESHOLD_RADIAN (8 degrees)
    stepHeight: 0.6, // how much height can the bot step on without jump
    soulsandSpeed: 0.4,
    honeyblockSpeed: 0.4,
    ladderClimbSpeed: 0.2,
    playerHalfWidth: Math.fround(0.3), // EntityDimensions: (double)(0.6F / 2.0F)
    playerHeight: Math.fround(1.8), // EntityDimensions: 1.8F
    lavaInertia: 0.5,
    airborneInertia: Math.fround(0.91), // LivingEntity.travel: 0.91F in the air
    defaultSlipperiness: 0.6,
    outOfLiquidImpulse: Math.fround(0.3),
    fluidJumpThreshold: 0.4, // LivingEntity.getFluidJumpThreshold for a standing player
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
    // LivingEntity's sprinting speed modifier: SPEED_MODIFIER_SPRINTING_UUID, since 1.21 the id SPEED_MODIFIER_SPRINTING_ID
    sprintingUUID: supportFeature('attributeModifierIds') ? 'minecraft:sprinting' : '662a6b8d-da3e-4c1c-8813-96ea6097278d'
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

  function getPlayerBB (pos) {
    const w = playerDims ? playerDims.halfWidth : physics.playerHalfWidth
    return new AABB(-w, 0, -w, w, playerDims ? playerDims.height : physics.playerHeight, w).offset(pos.x, pos.y, pos.z)
  }

  // The player's dimensions for the tick being simulated: 0.6F by 1.8F, from 1.20.5 times the scale attribute
  // (EntityDimensions.scale, in float; the box half as wide, Entity.makeBoundingBox)
  let playerDims = null // null: physics.playerHalfWidth and physics.playerHeight
  const scaleResource = mcData.attributesByName.scale?.resource
  // The pose's height: 1.8 standing; from 1.9 (EntityPlayer.updateSize) 1.65 sneaking and 0.6 gliding (and from 1.13
  // swimming); from 1.14 (Player POSES) 1.5 crouching and 0.6 swimming, gliding and spin attacking. Eye heights 1.62, 1.27
  // crouching from 1.14, 0.4 for the 0.6 poses.
  const posePoses = mcData.version['>=']('1.14')
  const pushTowardsClosestSpace = mcData.version['>=']('1.16')
  const legacySize = !posePoses && mcData.version['>=']('1.9')
  const poseDeflate = mcData.version['>=']('1.16')
  const desiredSwimFirst = mcData.version['>=']('1.21.5')
  const POSE_HEIGHT = { standing: 1.8, crouching: posePoses ? 1.5 : 1.65, swimming: 0.6, fall_flying: 0.6, spin_attack: 0.6 }
  const POSE_EYE = { standing: 1.62, crouching: 1.27, swimming: 0.4, fall_flying: 0.4, spin_attack: 0.4 }
  function scaleOf (entity) {
    const synced = scaleResource && entity.attributes && entity.attributes[scaleResource]
    return synced ? Math.fround(attribute.getAttributeValue(synced)) : 1
  }
  function dimensionsOf (entity, pose = entity.pose) {
    const scale = scaleOf(entity)
    const height = (posePoses || legacySize) ? (POSE_HEIGHT[pose] ?? 1.8) : 1.8
    if (scale === 1 && height === 1.8) return null
    const f = Math.fround
    return { halfWidth: f(f(f(0.6) * scale) / 2), height: f(f(height) * scale) }
  }
  function poseBox (entity, pose) {
    const saved = playerDims
    playerDims = dimensionsOf(entity, pose)
    try { return getPlayerBB(entity.pos) } finally { playerDims = saved }
  }
  // Player.canEnterPose (canPlayerFitWithinBlocksAndEntitiesWhen): the pose's box at the position, from 1.16 deflated
  // by 1.0E-7, collides with nothing
  function fitsPose (entity, world, pose) {
    let box = poseBox(entity, pose)
    if (poseDeflate) box = box.contract(1.0e-7, 1.0e-7, 1.0e-7)
    return !getSurroundingBBs(world, box, entity).some(bb => bb.intersects(box))
  }
  // At the end of the tick: Player.updatePlayerPose (1.14+) picks the pose the player wants (gliding, swimming, crouching
  // with the sneak key while not flying, else standing; from 1.21.5 swimming before gliding) when the swimming box fits,
  // and where it does not fit crouching, else swimming (crawling). EntityPlayer.updateSize (1.9-1.13) resizes the box to
  // the wanted height only when the new box collides with nothing.
  function updatePose (entity, world) {
    const sneak = !!entity.control.sneak
    if (posePoses) {
      if (!fitsPose(entity, world, 'swimming')) return
      const crouch = sneak && !entity.flying ? 'crouching' : 'standing'
      const desired = desiredSwimFirst
        ? (entity.isSwimming ? 'swimming' : entity.elytraFlying ? 'fall_flying' : entity.spinAttack ? 'spin_attack' : crouch)
        : (entity.elytraFlying ? 'fall_flying' : entity.isSwimming ? 'swimming' : entity.spinAttack ? 'spin_attack' : crouch)
      const pose = fitsPose(entity, world, desired) ? desired : fitsPose(entity, world, 'crouching') ? 'crouching' : 'swimming'
      setPose(entity, pose)
    } else if (legacySize) {
      const desired = entity.elytraFlying ? 'fall_flying' : (fluidStates && (entity.isSwimming || entity.spinAttack)) ? 'swimming' : sneak ? 'crouching' : 'standing'
      const current = entity.pose ?? 'standing'
      if (POSE_HEIGHT[desired] === POSE_HEIGHT[current]) { entity.pose = desired; return }
      const resized = anchoredBox(entity, desired)
      if (getSurroundingBBs(world, resized, entity).some(bb => bb.intersects(resized))) return
      entity.pose = desired
      entity.box = resized
    }
  }
  // Entity.setSize / refreshDimensions up to 1.16: the width does not change, so the box keeps its lower corner
  function anchoredBox (entity, pose) {
    const box = entity.box ?? getPlayerBB(entity.pos)
    const w = Math.fround(0.6)
    return new AABB(box.minX, box.minY, box.minZ, box.minX + w, box.minY + Math.fround(POSE_HEIGHT[pose]), box.minZ + w)
  }
  // From 1.17 the box is rebuilt from the position (reapplyPosition), which getPlayerBB does with the pose's size
  function setPose (entity, pose) {
    if (pose === (entity.pose ?? 'standing')) return
    if (positionFromBox) entity.box = anchoredBox(entity, pose)
    entity.pose = pose
  }

  // Entity.maxUpStep: 0.6; from 1.20.5 the step_height attribute, as a float
  const stepHeightResource = mcData.attributesByName.stepHeight?.resource
  const stepDownKeepsMove = mcData.version['>=']('1.14') && mcData.version['<']('1.21')
  const largerAxisFirst = mcData.version['>=']('1.14')
  const candidateStepUp = mcData.version['>=']('1.21')
  const wholeMoveCollides = mcData.version['>=']('1.14')
  function stepHeightOf (entity) {
    const synced = stepHeightResource && entity.attributes && entity.attributes[stepHeightResource]
    return synced ? Math.fround(attribute.getAttributeValue(synced)) : physics.stepHeight
  }

  // The collision boxes around queryBB. `entity`: the player whose collision context shapes some blocks (scaffolding)
  function getSurroundingBBs (world, queryBB, entity) {
    const surroundingBBs = []
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(queryBB.minY) - 1; cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block) {
            const blockPos = block.position
            const shapes = shapesFor(block, blockPos, entity)
            for (const shape of shapes) {
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

  // The shapes of the blocks that collide with a box (Level.getBlockCollisions: a block whose shape overlaps it), each a
  // list of boxes
  function getCollidingShapes (world, queryBB, entity) {
    const shapes = []
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(queryBB.minY) - 1; cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (!block) continue
          const blockPos = block.position
          const boxes = shapesFor(block, blockPos, entity)
            .map(shape => new AABB(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5]).offset(blockPos.x, blockPos.y, blockPos.z))
          if (boxes.some(box => box.intersects(queryBB))) shapes.push(boxes)
        }
      }
    }
    return shapes
  }

  // Entity.collectCandidateStepUpHeights (1.21+): the heights over the box's bottom of each shape's y coordinates, as
  // floats, from 0 up to the step height, but the plain move's own, lowest first
  function stepUpHeights (bb, shapes, stepHeight, movedY) {
    const heights = new Set()
    for (const boxes of shapes) {
      for (const box of boxes) {
        for (const y of [box.minY, box.maxY]) {
          const height = Math.fround(y - bb.minY)
          if (height >= 0 && height !== movedY && height <= stepHeight) heights.add(height)
        }
      }
    }
    return [...heights].sort((a, b) => a - b)
  }

  // The collision shapes of a block as the player's collision context sees them
  function shapesFor (block, blockPos, entity) {
    if (block.type === scaffoldingId) return scaffoldingShapes(block, blockPos, entity)
    if (block.type === powderSnowId) return powderSnowShapes(blockPos, entity)
    return block.shapes
  }

  // PowderSnowBlock.getCollisionShape (1.17+): under a player whose fall distance is over 2.5 a 0.9 tall box
  // (FALLING_COLLISION_SHAPE); under one wearing leather boots (canEntityWalkOnPowderSnow) who is above the block
  // (EntityCollisionContext.isAbove: the bottom over its top, less 1.0E-5F) and not descending (the sneak key) a full
  // block; otherwise nothing.
  const POWDER_SNOW_FALLING = [[0, 0, 0, 1, 0.8999999761581421, 1]]
  const FULL_BLOCK = [[0, 0, 0, 1, 1, 1]]
  function powderSnowShapes (blockPos, entity) {
    if (!entity) return []
    if (entity.fallDistance > 2.5) return POWDER_SNOW_FALLING
    if (entity.leatherBoots && entity.pos.y > blockPos.y + 1 - 9.999999747378752e-6 && !entity.control.sneak) return FULL_BLOCK
    return []
  }

  // ScaffoldingBlock.getCollisionShape (1.14+): its top and legs when the player stands above it (the bottom over the
  // block's top, less 1.0E-5F) and is not descending (the sneak key); a bottom scaffold held up by others (distance over
  // 0) only its bottom slab when the player is above its base; otherwise nothing, so the player walks into it. Without a
  // player (an empty collision context) the top and legs.
  const SCAFFOLDING_STABLE = [[0, 0.875, 0, 1, 1, 1], [0, 0, 0, 0.125, 1, 0.125], [0.875, 0, 0, 1, 1, 0.125],
    [0, 0, 0.875, 0.125, 1, 1], [0.875, 0, 0.875, 1, 1, 1]]
  const SCAFFOLDING_UNSTABLE_BOTTOM = [[0, 0, 0, 1, 0.125, 1]]
  function scaffoldingShapes (block, blockPos, entity) {
    if (!entity) return SCAFFOLDING_STABLE
    const above = height => entity.pos.y > blockPos.y + height - 9.999999747378752e-6
    if (above(1) && !entity.control.sneak) return SCAFFOLDING_STABLE
    const props = block.getProperties()
    if (Number(props.distance) !== 0 && props.bottom && above(0)) return SCAFFOLDING_UNSTABLE_BOTTOM
    return []
  }

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

  // A move against the boxes, axis by axis, moving the box with it: y, x then z up to 1.13 (Entity.move); from 1.14 y,
  // then the larger horizontal axis first (Entity.collideWithShapes: z before x where |x| < |z|)
  function collideAxes (boxes, bb, dx, dy, dz) {
    for (const blockBB of boxes) dy = blockBB.computeOffsetY(bb, dy)
    bb.offset(0, dy, 0)
    const zFirst = largerAxisFirst && Math.abs(dx) < Math.abs(dz)
    if (zFirst) {
      for (const blockBB of boxes) dz = blockBB.computeOffsetZ(bb, dz)
      bb.offset(0, 0, dz)
    }
    for (const blockBB of boxes) dx = blockBB.computeOffsetX(bb, dx)
    bb.offset(dx, 0, 0)
    if (!zFirst) {
      for (const blockBB of boxes) dz = blockBB.computeOffsetZ(bb, dz)
      bb.offset(0, 0, dz)
    }
    return { dx, dy, dz }
  }

  function moveEntity (entity, world, dx, dy, dz) {
    const vel = entity.vel
    const pos = entity.pos

    // Entity.move: a block the player was stuck in last tick scales this move once and stops the motion
    if (entity.isInWeb) {
      const stuck = entity.stuckSpeedMultiplier ?? new Vec3(0.25, Math.fround(0.05), 0.25)
      dx *= stuck.x
      dy *= stuck.y
      dz *= stuck.z
      vel.x = 0
      vel.y = 0
      vel.z = 0
      entity.isInWeb = false
      entity.stuckSpeedMultiplier = null
    }

    let oldVelX = dx
    const oldVelY = dy
    let oldVelZ = dz

    if (entity.control.sneak && entity.onGround) {
      const step = 0.05

      // In the 3 loops bellow, y offset should be -1, but that doesnt reproduce vanilla behavior.
      for (; dx !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, 0, 0), entity).length === 0; oldVelX = dx) {
        if (dx < step && dx >= -step) dx = 0
        else if (dx > 0) dx -= step
        else dx += step
      }

      for (; dz !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(0, 0, dz), entity).length === 0; oldVelZ = dz) {
        if (dz < step && dz >= -step) dz = 0
        else if (dz > 0) dz -= step
        else dz += step
      }

      while (dx !== 0 && dz !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, 0, dz), entity).length === 0) {
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

    // Up to 1.16 the box carries the player from tick to tick and the position is read from it
    let playerBB = positionFromBox && entity.box ? entity.box.clone() : getPlayerBB(pos)
    const queryBB = playerBB.clone().extend(dx, dy, dz)
    const surroundingBBs = getSurroundingBBs(world, queryBB, entity)
    const oldBB = playerBB.clone()

    ;({ dx, dy, dz } = collideAxes(surroundingBBs, playerBB, dx, dy, dz))

    // Step on block if height < stepHeight. The move then goes up by stepUp, across, and down by dy: by the step-up up to
    // 1.13, and from 1.14 to 1.20.6 by the step-up less the move's own dy (Entity.collide: -vec.y + movement.y)
    let stepUp = 0
    const stepHeight = stepHeightOf(entity)
    const landed = dy !== oldVelY && oldVelY < 0
    if (candidateStepUp && stepHeight > 0 && (entity.onGround || landed) && (dx !== oldVelX || dz !== oldVelZ)) {
      // From 1.21 (Entity.collide) the step starts where the plain move landed, or where the player is, and tries the
      // heights of the shapes around from the lowest (collectCandidateStepUpHeights): the first that goes further than
      // the plain move is the step, with no step down after it
      const fromBB = landed ? oldBB.clone().offset(0, dy, 0) : oldBB.clone()
      const stepBB = fromBB.clone().extend(oldVelX, stepHeight, oldVelZ)
      if (!landed) stepBB.extend(0, -9.999999747378752e-6, 0)
      const shapes = getCollidingShapes(world, stepBB, entity)
      const colliders = shapes.flat()
      for (const height of stepUpHeights(fromBB, shapes, stepHeight, Math.fround(dy))) {
        const bb = fromBB.clone()
        const step = collideAxes(colliders, bb, oldVelX, height, oldVelZ)
        if (step.dx * step.dx + step.dz * step.dz > dx * dx + dz * dz) {
          dx = step.dx
          dz = step.dz
          stepUp = step.dy + (landed ? dy : 0)
          dy = 0
          playerBB = bb
          break
        }
      }
    } else if (stepHeight > 0 && (entity.onGround || landed) && (dx !== oldVelX || dz !== oldVelZ)) {
      const oldVelXCol = dx
      const oldVelYCol = dy
      const oldVelZCol = dz
      const oldBBCol = playerBB.clone()

      dy = stepHeight
      const queryBB = oldBB.clone().extend(oldVelX, dy, oldVelZ)
      const surroundingBBs = getSurroundingBBs(world, queryBB, entity)

      // up by the step height from where the player is, then across (BB2); or up as far as the whole move's column
      // allows, then across (BB1)
      const BB2 = oldBB.clone()
      const { dx: dx2, dy: dy2, dz: dz2 } = collideAxes(surroundingBBs, BB2, oldVelX, dy, oldVelZ)
      const BB_XZ = oldBB.clone().extend(oldVelX, 0, oldVelZ)
      let dy1 = dy
      for (const blockBB of surroundingBBs) {
        dy1 = blockBB.computeOffsetY(BB_XZ, dy1)
      }
      const BB1 = oldBB.clone().offset(0, dy1, 0)
      const { dx: dx1, dz: dz1 } = collideAxes(surroundingBBs, BB1, oldVelX, 0, oldVelZ)

      const norm1 = dx1 * dx1 + dz1 * dz1
      const norm2 = dx2 * dx2 + dz2 * dz2

      if (norm1 > norm2) {
        dx = dx1
        dz = dz1
        stepUp = dy1
        playerBB = BB1
      } else {
        dx = dx2
        dz = dz2
        stepUp = dy2
        playerBB = BB2
      }
      dy = stepDownKeepsMove ? -stepUp + oldVelY : -stepUp

      for (const blockBB of surroundingBBs) {
        dy = blockBB.computeOffsetY(playerBB, dy)
      }
      playerBB.offset(0, dy, 0)

      if (oldVelXCol * oldVelXCol + oldVelZCol * oldVelZCol >= dx * dx + dz * dz) {
        dx = oldVelXCol
        dy = oldVelYCol
        dz = oldVelZCol
        stepUp = 0
        playerBB = oldBBCol
      }
    }

    // Entity.move: where the collided move leaves the player. Up to 1.16 the position is the box's centre and bottom
    // (resetPositionToBB, setLocationFromBoundingbox); since 1.17 the move is added to the position (setPos). From 1.14
    // a move whose squared length is 1.0E-7 or less is dropped, unless (from 1.21.2) nothing shortened it.
    const movedY = stepUp + dy
    const movedSqr = dx * dx + movedY * movedY + dz * dz
    if (!moveThreshold || movedSqr > 1.0e-7 ||
      (appliesUnobstructedTinyMove && oldVelX * oldVelX + oldVelY * oldVelY + oldVelZ * oldVelZ - movedSqr < 1.0e-7)) {
      if (positionFromBox) {
        // 1.14 to 1.16 move the box once by the whole collided move (a step's up and down in one), before axis by axis
        if (moveThreshold) playerBB = oldBB.clone().offset(dx, movedY, dz)
        pos.x = (playerBB.minX + playerBB.maxX) / 2
        pos.y = playerBB.minY
        pos.z = (playerBB.minZ + playerBB.maxZ) / 2
        entity.box = playerBB.clone()
      } else {
        const from = pos.clone()
        pos.x += dx
        pos.y += movedY
        pos.z += dz
        // the move as Entity.move records it for the blocks the player passes (1.21.2+)
        if (entity.movesThisTick) entity.movesThisTick.push({ from, to: pos.clone(), requested: new Vec3(oldVelX, oldVelY, oldVelZ) })
      }
    } else if (positionFromBox) {
      entity.box = oldBB.clone()
    }

    // Update flags
    entity.isCollidedHorizontally = dx !== oldVelX || dz !== oldVelZ
    entity.minorHorizontalCollision = entity.isCollidedHorizontally && isHorizontalCollisionMinor(entity, dx, dz)
    // from 1.14 (Entity.move) the whole move against the one asked for, a step's up and down together
    entity.isCollidedVertically = (wholeMoveCollides ? movedY : dy) !== oldVelY
    entity.onGround = entity.isCollidedVertically && oldVelY < 0
    if (onPosBelow) checkSupportingBlock(entity, world, positionFromBox ? entity.box : getPlayerBB(pos), new Vec3(dx, movedY, dz))

    // Entity.move then checkFallDamage: LivingEntity looks for water again around the moved box when the player was not
    // in it, before the collided axes stop (not on 1.21.4, where the local player skips checkFallDamage in move)
    if (waterAfterMove && !entity.isInWater) updateInWater(entity, world, positionFromBox ? entity.box : getPlayerBB(pos))
    if (waterAfterMove) updateFallDistance(entity, movedY)

    // the block landed on: Entity.getOnPosLegacy, 0.2F under the position (from 1.20 by the supporting block)
    const blockAtFeet = world.getBlock(onPosBelow ? onPos(entity, world, Math.fround(0.2)) : pos.offset(0, -0.2, 0))

    if (dx !== oldVelX) vel.x = 0
    if (dz !== oldVelZ) vel.z = 0
    if (dy !== oldVelY) {
      if (blockAtFeet && blockAtFeet.type === slimeBlockId && !entity.control.sneak) {
        vel.y = -vel.y
      } else if (bedBounces && blockAtFeet && bedIds.has(blockAtFeet.type) && !entity.control.sneak) {
        // BedBlock.bounceUp: a fall turns into 0.66F of it upwards (a living entity keeps all of it); a rise is left as is
        if (vel.y < 0) vel.y = -vel.y * Math.fround(0.66)
      } else {
        // Block.updateEntityAfterFallOn: = 0.0 up to 1.13; from 1.14 multiplied by 0.0, so a fall ends at -0.0
        vel.y = fallStopMultiplies ? vel.y * 0 : 0
      }
    }

    if (!blockEffectsAfterTravel) stepOn(entity, blockAtFeet)
    // Up to 1.21.1 the blocks the player is in act during the move (Entity.checkInsideBlocks); from 1.21.2 after
    // travel (LivingEntity.applyEffectsFromBlocks), so after gravity and drag
    if (!blockEffectsAfterTravel) applyInsideBlocks(entity, world, playerBB)
    // From 1.15 Entity.move ends by scaling the horizontal motion by the block speed factor
    if (blockSpeedFactorFeature) {
      const factor = blockSpeedFactor(entity, world)
      if (factor !== 1) {
        vel.x *= factor
        vel.z *= factor
      }
    }
  }

  // Block.stepOn on the block the player stands on (getOnPosLegacy): slime scales the horizontal motion by
  // 0.4 + |vy| * 0.2 when |vy| < 0.1, unless sneaking. Up to 1.21.1 in Entity.move after the fall-on bounce; from 1.21.2
  // in applyEffectsFromBlocks after travel, so after gravity and drag.
  function stepOn (entity, block) {
    if (!entity.onGround || !block || block.type !== slimeBlockId || entity.control.sneak) return
    const vy = Math.abs(entity.vel.y)
    if (vy >= 0.1) return
    const scale = 0.4 + vy * 0.2
    entity.vel.x *= scale
    entity.vel.z *= scale
  }

  // Entity.checkFallDamage, after LivingEntity's water re-check (in water the fall distance resets): on the ground the
  // fall ends, otherwise a downward move adds to it. A float field: (float)(fallDistance - y) up to 1.18, fallDistance -=
  // (float)y from 1.19; from 1.21.5 a double that adds (float)y out of water before the ground check. The local player
  // skips it in Entity.move on 1.21.4 (Player.isControlledByClient), so its fall distance stays 0 there.
  function updateFallDistance (entity, dy) {
    if (entity.isInWater) entity.fallDistance = 0
    if (fallDistanceDouble) {
      if (!entity.isInWater && dy < 0) entity.fallDistance -= Math.fround(dy)
      if (entity.onGround) entity.fallDistance = 0
    } else if (entity.onGround) {
      entity.fallDistance = 0
    } else if (dy < 0) {
      entity.fallDistance = Math.fround(entity.fallDistance - (fallDistanceFloatMove ? Math.fround(dy) : dy))
    }
  }
  const fallDistanceFloatMove = mcData.version['>=']('1.19')
  const flightEndsFallBeforeTravel = mcData.version['>=']('1.21.2')
  const effectsEndFallBeforeTravel = mcData.version['>=']('1.20')
  const fallDistanceDouble = mcData.version['>=']('1.21.5')

  // Entity.getBlockSpeedFactor (1.15+): the feet block's speed factor, or when that is 1 (and the feet are not in water
  // or a bubble column) the one of the block below that affects movement; soul sand and honey 0.4F. On 1.16 to 1.20
  // LivingEntity ignores it on soul sand or soul soil with Soul Speed; from 1.21 it lerps it towards 1 by the
  // movement_efficiency attribute (Mth.lerp, floats).
  function blockSpeedFactor (entity, world) {
    const pos = entity.pos
    const factorOf = block => block && (block.type === soulsandId || block.type === honeyblockId) ? Math.fround(0.4) : 1
    const feet = world.getBlock(pos.floored())
    const below = world.getBlock(blockPosBelowAffectingMovement(entity, world))
    let factor = factorOf(feet)
    if (factor === 1 && !(feet && (waterIds.includes(feet.type) || feet.type === bubblecolumnId))) factor = factorOf(below)
    if (soulSpeedIgnoresFactor && entity.soulSpeed > 0 && below && (below.type === soulsandId || below.type === soulsoilId)) return 1
    if (movementEfficiencyResource) {
      const synced = entity.attributes && entity.attributes[movementEfficiencyResource]
      const efficiency = Math.fround(synced ? math.clamp(0, attribute.getAttributeValue(synced), 1) : 0)
      factor = Math.fround(factor + Math.fround(efficiency * Math.fround(1 - factor)))
    }
    return factor
  }

  // Entity.getBlockPosBelowThatAffectsMyMovement: the block under the box's bottom by 0.5000001 (1.15 to 1.19), from
  // 1.20 getOnPos(0.500001F)
  function blockPosBelowAffectingMovement (entity, world) {
    if (onPosBelow) return onPos(entity, world, Math.fround(0.500001))
    const pos = entity.pos
    return new Vec3(Math.floor(pos.x), Math.floor(pos.y - 0.5000001), Math.floor(pos.z))
  }

  // Entity.getOnPos (1.20+): with a supporting block, its x and z and the y `depth` under the position (a wall or a fence
  // gate itself, and a fence itself within 0.5); otherwise the block `depth` under the position
  function onPos (entity, world, depth) {
    const pos = entity.pos
    const support = entity.supportingBlockPos
    if (!support) return new Vec3(Math.floor(pos.x), Math.floor(pos.y - depth), Math.floor(pos.z))
    const name = world.getBlock(support)?.name ?? ''
    if (name.endsWith('_wall') || name.endsWith('_fence_gate') || (depth <= 0.5 && name.endsWith('_fence'))) return support.clone()
    return new Vec3(support.x, Math.floor(pos.y - depth), support.z)
  }

  // Entity.checkSupportingBlock (1.20+), after each move: on the ground, among the blocks whose collision touches a
  // 1.0E-6 slab under the box, the one whose centre is closest to the position (ties to the greater by y, z, x); with
  // none, the one under where the box was before the horizontal move, unless none was found on the tick before either.
  function checkSupportingBlock (entity, world, box, movement) {
    if (!entity.onGround) {
      entity.onGroundNoBlocks = false
      entity.supportingBlockPos = null
      return
    }
    const underside = new AABB(box.minX, box.minY - 1.0e-6, box.minZ, box.maxX, box.minY, box.maxZ)
    let found = findSupportingBlock(entity, world, underside)
    if (found || entity.onGroundNoBlocks) {
      entity.supportingBlockPos = found
    } else if (movement) {
      found = findSupportingBlock(entity, world, underside.clone().offset(-movement.x, 0, -movement.z))
      entity.supportingBlockPos = found
    }
    entity.onGroundNoBlocks = !found
  }

  // CollisionGetter.findSupportingBlock
  function findSupportingBlock (entity, world, box) {
    let best = null
    let bestDistance = Number.MAX_VALUE
    const pos = entity.pos
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(box.minY) - 1; cursor.y <= Math.floor(box.maxY); cursor.y++) {
      for (cursor.z = Math.floor(box.minZ); cursor.z <= Math.floor(box.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(box.minX); cursor.x <= Math.floor(box.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (!block) continue
          const shapes = shapesFor(block, cursor, entity)
          if (!shapes.some(s => s[3] + cursor.x > box.minX && s[0] + cursor.x < box.maxX && s[4] + cursor.y > box.minY &&
            s[1] + cursor.y < box.maxY && s[5] + cursor.z > box.minZ && s[2] + cursor.z < box.maxZ)) continue
          const dx = cursor.x + 0.5 - pos.x
          const dy = cursor.y + 0.5 - pos.y
          const dz = cursor.z + 0.5 - pos.z
          const distance = dx * dx + dy * dy + dz * dz
          const greater = best && (best.y !== cursor.y ? best.y < cursor.y : best.z !== cursor.z ? best.z < cursor.z : best.x < cursor.x)
          if (distance < bestDistance || (distance === bestDistance && (!best || greater))) {
            best = cursor.clone()
            bestDistance = distance
          }
        }
      }
    }
    return best
  }

  // The single input-to-world transform LocalPlayer uses: a (strafe, forward) impulse becomes a world direction under the
  // entity's yaw. applyHeading and isHorizontalCollisionMinor MUST share it so their conventions cannot drift (the strafe
  // sign in particular): x = -(strafe*cos + forward*sin), z = forward*cos - strafe*sin.
  // The sin and cos are Mth.sin and Mth.cos of the float yRot in radians, read from the sine table (lib/math.js).
  // Mth.sin and Mth.cos of the float yRot in radians: yRot * 0.017453292F, or with `piOver180` yRot * 3.1415927F / 180.0F
  // The float yRot in degrees the sine table reads. Its table entry depends on the unwrapped angle (the index truncates
  // towards zero), so -80 and 280 differ in the last bits: the client's own yRot (entity.yRot) when the caller has it and
  // it looks the same way as the yaw, else degrees(PI - yaw), which matches a client whose yRot is within (-180, 180].
  function yRotOf (entity) {
    const derived = Math.fround((Math.PI - entity.yaw) * 180 / Math.PI)
    const given = entity.yRot
    if (typeof given !== 'number') return derived
    const turn = (((given - derived) % 360) + 540) % 360 - 180
    return Math.abs(turn) < 1.0e-3 ? Math.fround(given) : derived
  }

  function yawSinCos (entity, piOver180) {
    const yRot = yRotOf(entity)
    const radians = piOver180
      ? Math.fround(Math.fround(yRot * math.PI_F) / 180)
      : Math.fround(yRot * math.DEG_TO_RAD_F)
    return { sin: math.mthSin(radians, sinTableDoubleIndex), cos: math.mthCos(radians, sinTableDoubleIndex) }
  }

  // The speed a falling (not flying) player accelerates at: 0.02F, more while sprinting. Up to 1.19.3 Player.aiStep
  // sets the flyingSpeed field after travel, so travel reads the sprint state of the tick before; the sprinting value
  // is (float)(0.02F + 0.006) up to 1.18.1 and 0.02F + 0.006F in float on 1.18.2 to 1.19.3. From 1.19.4
  // Player.getFlyingSpeed reads the sprint state live, 0.025999999F.
  function airborneSpeed (entity) {
    const sprinting = airSpeedLagsSprint ? entity.wasSprinting : entity.isSprinting
    if (!sprinting) return Math.fround(0.02)
    if (airSprintSpeedFloatSum) return Math.fround(Math.fround(0.02) + Math.fround(0.006))
    return Math.fround(0.025999999)
  }

  // Player.getSpeed: the movement speed attribute (0.1F if the server synced none) with the sprint modifier as the
  // client's sprint state has it (LivingEntity.setSprinting), as a float
  function movementSpeed (entity) {
    let speed
    if (entity.attributes && entity.attributes[physics.movementSpeedAttribute]) {
      speed = entity.attributes[physics.movementSpeedAttribute]
    } else {
      speed = attribute.createAttributeValue(physics.playerSpeed)
    }
    speed = attribute.deleteAttributeModifier(speed, physics.sprintingUUID)
    if (entity.isSprinting) {
      speed = attribute.addAttributeModifier(speed, { uuid: physics.sprintingUUID, amount: physics.sprintSpeed, operation: 2 })
    }
    return Math.fround(attribute.getAttributeValue(speed))
  }

  // LivingEntity.travel in water: the drag (0.8F; from 1.13 0.9F while sprinting and 0.96F with Dolphin's Grace) and the
  // acceleration (0.02F), both moved towards the ground's by Depth Strider: up to 1.20 by its level (at most 3, halved
  // off the ground) over 3, from 1.21 by the water_movement_efficiency attribute; all floats
  function waterDragAndAcceleration (entity) {
    const f = Math.fround
    let drag = sprintSwimDrag && entity.isSprinting ? f(0.9) : f(0.8)
    let acceleration = f(0.02)
    if (waterEfficiencyResource) {
      const synced = entity.attributes && entity.attributes[waterEfficiencyResource]
      let efficiency = f(synced ? math.clamp(0, attribute.getAttributeValue(synced), 1) : 0)
      if (!entity.onGround) efficiency = f(efficiency * f(0.5))
      if (efficiency > 0) {
        drag = f(drag + f(f(f(0.54600006) - drag) * efficiency))
        acceleration = f(acceleration + f(f(movementSpeed(entity) - acceleration) * efficiency))
      }
    } else {
      let strider = f(Math.min(entity.depthStrider, 3))
      if (!entity.onGround) strider = f(strider * f(0.5))
      if (strider > 0) {
        drag = f(drag + f(f(f(f(0.54600006) - drag) * strider) / 3))
        acceleration = f(acceleration + f(f(f(movementSpeed(entity) - acceleration) * strider) / 3))
      }
    }
    if (dolphinsGraceFeature && entity.dolphinsGrace > 0) drag = f(0.96)
    return { drag, acceleration }
  }

  // LocalPlayer.aiStep asks the server to start gliding (START_FALL_FLYING) when jump is pressed (not held from the tick
  // before) in the air with a usable elytra, not creative flying. Up to 1.14 it asks only while falling (the motion the
  // tick started with), and the server's entity data starts the glide later. From 1.15 it starts the glide at once, and
  // asks, when also not on a ladder, not in water and from 1.16 not levitating (Player.tryToStartFallFlying).
  function tryToStartFallFlying (entity, world, startVelY) {
    entity.fallFlyingRequested = false
    if (!entity.control.jump || entity.wasJumping || entity.flying || entity.onGround || entity.elytraFlying) return
    if (!entity.elytraEquipped) return
    if (!clientStartsGliding) {
      entity.fallFlyingRequested = startVelY < 0
      return
    }
    if (entity.isInWater || isOnLadder(world, entity.pos)) return
    if (levitationBlocksGliding && entity.levitation > 0) return
    entity.elytraFlying = true
    entity.fallFlyingRequested = true
  }

  // LivingEntity.travel while gliding (1.21.3+ updateFallFlyingMovement). The pitch is the float xRot in radians; c is
  // its cosine squared: through the float Mth.cos up to 1.18.1, the double Math.cos from 1.18.2. The lift is
  // -0.08 + c * 0.06 up to 1.12 and gravity * (-1 + c * 0.75) from 1.13 (gravity 0.08, 0.01 falling with Slow Falling).
  // Falling turns into speed along the look, pulling up (xRot below 0, looking up) trades speed for lift, and the
  // motion turns towards the look; then 0.99F, 0.98F and 0.99F of it stay.
  function glide (entity, gravity) {
    const vel = entity.vel
    const look = viewVector(entity)
    const xRot = Math.fround(-entity.pitch * 180 / Math.PI)
    const pitchRad = Math.fround(xRot * math.DEG_TO_RAD_F)
    const hLook = Math.sqrt(look.x * look.x + look.z * look.z)
    const hVel = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
    let c
    if (glideCosineIsDouble) {
      const cos = Math.cos(pitchRad)
      c = cos * cos
    } else {
      const cos = math.mthCos(pitchRad, sinTableDoubleIndex)
      c = Math.fround(cos * cos)
    }
    if (glideLiftIsConstant) vel.y += -0.08 + c * 0.06
    else vel.y += gravity * (-1.0 + c * 0.75)
    if (vel.y < 0.0 && hLook > 0.0) {
      const q = vel.y * -0.1 * c
      vel.y += q
      vel.x += look.x * q / hLook
      vel.z += look.z * q / hLook
    }
    if (pitchRad < 0 && (glideLiftIsConstant || hLook > 0.0)) {
      const q = hVel * -math.mthSin(pitchRad, sinTableDoubleIndex) * 0.04
      vel.y += q * 3.2
      vel.x -= look.x * q / hLook
      vel.z -= look.z * q / hLook
    }
    if (hLook > 0.0) {
      vel.x += (look.x / hLook * hVel - vel.x) * 0.1
      vel.z += (look.z / hLook * hVel - vel.z) * 0.1
    }
    vel.x *= Math.fround(0.99)
    vel.y *= Math.fround(0.98)
    vel.z *= Math.fround(0.99)
  }

  // Entity.getLookAngle: the look direction from the float yRot and xRot through Mth.sin and Mth.cos, each component a
  // float. Up to 1.12 (getVectorForRotation) from -yRot - PI and -xRot; since (calculateViewVector) from -yRot and xRot.
  function viewVector (entity) {
    const f = Math.fround
    const yRot = yRotOf(entity)
    const xRot = f(-entity.pitch * 180 / Math.PI)
    const sin = r => math.mthSin(r, sinTableDoubleIndex)
    const cos = r => math.mthCos(r, sinTableDoubleIndex)
    if (legacyViewVector) {
      const yawRad = f(f(-yRot * math.DEG_TO_RAD_F) - math.PI_F)
      const pitchRad = f(-xRot * math.DEG_TO_RAD_F)
      const pitchCos = -cos(pitchRad)
      return new Vec3(f(sin(yawRad) * pitchCos), sin(pitchRad), f(cos(yawRad) * pitchCos))
    }
    const pitchRad = f(xRot * math.DEG_TO_RAD_F)
    const yawRad = f(-yRot * math.DEG_TO_RAD_F)
    const pitchCos = cos(pitchRad)
    return new Vec3(f(sin(yawRad) * pitchCos), -sin(pitchRad), f(cos(yawRad) * pitchCos))
  }

  // LivingEntity.aiStep with the jump key: swim up ('fluid') or jump from the ground ('ground'). Up to 1.12 any water or
  // lava swims up. On 1.13 to 1.15 water swims up when it is off the ground or deeper than 0.4, lava always, and the
  // ground (or water 0.4 deep or less) jumps. From 1.16 the fluid's height (lava's in lava) against the fluid jump
  // threshold decides for both fluids.
  function liquidJump (entity) {
    if (!fluidHeightFromFeet) return entity.isInWater || entity.isInLava ? 'fluid' : entity.onGround ? 'ground' : null
    const threshold = physics.fluidJumpThreshold
    if (!liquidJumpByThreshold) {
      if (entity.waterHeight > 0 && (!entity.onGround || entity.waterHeight > threshold)) return 'fluid'
      if (entity.isInLava) return 'fluid'
      return entity.onGround || (entity.waterHeight > 0 && entity.waterHeight <= threshold) ? 'ground' : null
    }
    const height = entity.isInLava ? entity.lavaHeight : entity.waterHeight
    const inWater = entity.isInWater && height > 0
    if (inWater && (!entity.onGround || height > threshold)) return 'fluid'
    if (entity.isInLava && (!entity.onGround || height > threshold)) return 'fluid'
    return entity.onGround || (inWater && height <= threshold) ? 'ground' : null
  }

  // Entity.makeStuckInBlock: the multiplier a block the player is in sets for the next move, unless the player flies.
  // A cobweb (0.25, 0.05F, 0.25), with Weaving (1.20.5+) (0.5, 0.25, 0.5); a sweet berry bush (1.14+) (0.8F, 0.75, 0.8F);
  // powder snow (1.17+) at the feet (0.9F, 1.5, 0.9F).
  function stuckMultiplier (entity, world, block) {
    if (entity.flying) return null
    if (block.type === webId) return entity.weaving > 0 ? new Vec3(0.5, 0.25, 0.5) : new Vec3(0.25, Math.fround(0.05), 0.25)
    if (block.type === sweetBerryBushId) return new Vec3(Math.fround(0.8), 0.75, Math.fround(0.8))
    if (block.type === powderSnowId && world.getBlock(entity.pos.floored())?.type === powderSnowId) {
      return new Vec3(Math.fround(0.9), 1.5, Math.fround(0.9))
    }
    return null
  }

  // Entity.checkInsideBlocks: what the blocks the box is inside do to the player (soul sand up to 1.14, cobweb, bubble
  // columns)
  // Up to 1.21.1 Entity.checkInsideBlocks acts on the blocks in the box (shrunk by 0.001) during the move, visiting x,
  // then y, then z: the last stuck block wins, and a bubble column acts once per cell.
  function applyInsideBlocks (entity, world, box) {
    const playerBB = box.clone().contract(0.001, 0.001, 0.001)
    const cursor = new Vec3(0, 0, 0)
    for (cursor.x = Math.floor(playerBB.minX); cursor.x <= Math.floor(playerBB.maxX); cursor.x++) {
      for (cursor.y = Math.floor(playerBB.minY); cursor.y <= Math.floor(playerBB.maxY); cursor.y++) {
        for (cursor.z = Math.floor(playerBB.minZ); cursor.z <= Math.floor(playerBB.maxZ); cursor.z++) {
          const block = world.getBlock(cursor)
          if (block) insideBlock(entity, world, cursor, block, true)
        }
      }
    }
  }

  // From 1.21.2 the blocks act after travel, along each move of the tick (Entity.applyEffectsFromBlocks,
  // checkInsideBlocks): each block once, in the order the walk meets it. A move is walked as it was recorded: from
  // 1.21.5 one axis at a time, y first, then the larger horizontal one (Direction.axisStepOrder of the moved vector; from
  // 1.21.9 of the requested one). With no move recorded, the tick's start and end positions make one.
  function applyInsideBlocksAlongMoves (entity, world, moves) {
    const visited = new Set()
    for (const { from, to, requested } of moves) {
      const moved = to.minus(from)
      const axes = insideBlocksAlongPath ? requested : moved
      const order = insideBlocksAxisSteps && axes && (moved.x !== 0 || moved.y !== 0 || moved.z !== 0) && axisStepOrder(axes)
      if (!order) {
        insideBlocksBetween(entity, world, from, to, visited)
        continue
      }
      let at = from
      for (const axis of order) {
        if (moved[axis] === 0) continue
        const next = at.clone()
        next[axis] += moved[axis]
        insideBlocksBetween(entity, world, at, next, visited)
        at = next
      }
    }
  }

  const axisStepOrder = v => Math.abs(v.x) < Math.abs(v.z) ? ['y', 'z', 'x'] : ['y', 'x', 'z']

  // One step: the box at its end, deflated by 1.0E-5F. Up to 1.21.8 its cells x fastest, then y, then z
  // (BlockPos.betweenClosed). From 1.21.9 a step longer than 1.0E-5F visits the cells of the box where it began, then
  // those of the box where it ended, each from the corner the step leaves, along the step's axis order
  // (BlockGetter.forEachBlockIntersectedBetween, BlockPos.betweenCornersInDirection). From 1.21.10 a bubble column acts
  // only when the end box touches it or the step is longer than a block.
  function insideBlocksBetween (entity, world, from, to, visited) {
    const deflate = 9.999999747378752e-6
    const box = getPlayerBB(to).contract(deflate, deflate, deflate)
    const step = to.minus(from)
    const lengthSqr = step.x * step.x + step.y * step.y + step.z * step.z
    const long = lengthSqr > 0.9999900000002526 * 0.9999900000002526
    let cells
    if (!insideBlocksAlongPath || lengthSqr < Math.fround(1.0e-5) * Math.fround(1.0e-5)) {
      cells = cellsBetweenClosed(box)
    } else {
      const startBox = box.clone().offset(-step.x, -step.y, -step.z)
      const seen = new Set()
      cells = []
      for (const cell of [...cellsInDirection(startBox, step), ...cellsInDirection(box, step)]) {
        const key = cell.x + ',' + cell.y + ',' + cell.z
        if (seen.has(key)) continue
        seen.add(key)
        cells.push(cell)
      }
    }
    for (const cell of cells) {
      const block = world.getBlock(cell)
      if (!block || block.type === airId) continue
      const key = cell.x + ',' + cell.y + ',' + cell.z
      if (visited.has(key)) continue
      visited.add(key)
      const touches = !insideBlocksEndIntersect || long ||
        (box.maxX > cell.x && box.minX < cell.x + 1 && box.maxY > cell.y && box.minY < cell.y + 1 && box.maxZ > cell.z && box.minZ < cell.z + 1)
      insideBlock(entity, world, cell, block, touches)
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

  // BlockPos.betweenCornersInDirection: from the corner the direction leaves, the axes in its step order, the first
  // outermost
  function cellsInDirection (box, direction) {
    const min = { x: Math.floor(box.minX), y: Math.floor(box.minY), z: Math.floor(box.minZ) }
    const max = { x: Math.floor(box.maxX), y: Math.floor(box.maxY), z: Math.floor(box.maxZ) }
    const order = axisStepOrder(direction)
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

  // HoneyBlock.isSlidingDown (1.15+): in the air, the position no higher than 0.9375 - 1.0E-7 above the block's bottom,
  // falling faster than 0.08, and against one of its sides (the position farther than 0.4375 plus half the width from
  // its centre on x or z, + 1.0E-7). From 1.21.2 the block acts after travel, so the fall it reads is the one before
  // gravity and drag (getOldDeltaY: y / 0.98F + 0.08).
  const honeyOldY = y => blockEffectsAfterTravel ? y / 0.9800000190734863 + 0.08 : y
  function honeySlidesDown (entity, blockPos) {
    const pos = entity.pos
    if (entity.onGround || pos.y > blockPos.y + 0.9375 - 1.0e-7 || honeyOldY(entity.vel.y) >= -0.08) return false
    const reach = 0.4375 + (playerDims ? playerDims.halfWidth : physics.playerHalfWidth)
    return Math.abs(blockPos.x + 0.5 - pos.x) + 1.0e-7 > reach || Math.abs(blockPos.z + 0.5 - pos.z) + 1.0e-7 > reach
  }

  // HoneyBlock.doSlideMovement: the fall becomes 0.05 down, a faster one than 0.13 scaling the horizontal motion by
  // 0.05 over it, and the fall distance resets. From 1.21.2 on the fall before gravity and drag, and the new one has
  // them applied (getNewDeltaY: (y - 0.08) * 0.98F).
  function slideDownHoney (entity) {
    const vel = entity.vel
    const oldY = honeyOldY(vel.y)
    if (oldY < -0.13) {
      const scale = -0.05 / oldY
      vel.x *= scale
      vel.z *= scale
    }
    vel.y = blockEffectsAfterTravel ? (-0.05 - 0.08) * 0.9800000190734863 : -0.05
    entity.fallDistance = 0
  }

  // What a block the player is in does to it. `touches`: whether a bubble column acts (1.21.10+, see above).
  function insideBlock (entity, world, cursor, block, touches) {
    const vel = entity.vel
    if (supportFeature('velocityBlocksOnCollision')) {
      if (block.type === soulsandId) {
        vel.x *= physics.soulsandSpeed
        vel.z *= physics.soulsandSpeed
      } else if (block.type === honeyblockId) {
        vel.x *= physics.honeyblockSpeed
        vel.z *= physics.honeyblockSpeed
      }
    }
    if (block.type === honeyblockId && honeySlidesDown(entity, cursor)) slideDownHoney(entity)
    if (block.type === powderSnowId) entity.isInPowderSnow = true
    const stuck = stuckMultiplier(entity, world, block)
    if (stuck) {
      entity.isInWeb = true
      entity.stuckSpeedMultiplier = stuck
      entity.fallDistance = 0
    } else if (block.type === bubblecolumnId && touches) {
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

  // LivingEntity.jumpFromGround. The jump power is 0.42F times the block jump factor (from 1.15: the block at the feet,
  // or the one below when that is 1; honey 0.5F), from 1.20.6 the jump_strength attribute instead of 0.42F, plus 0.1F per
  // Jump Boost level. The sum is in double up to 1.13 and on 1.17 to 1.19, in float otherwise. From 1.20.6 a power of
  // 1.0E-5F or less does not jump, and from 1.21.2 the jump keeps a higher upward motion. A sprinting jump adds 0.2 along
  // the yaw (Mth.sin and Mth.cos of yRot * 0.017453292F): as a float product up to 1.20.4, a double one since.
  function jumpFromGround (entity, world) {
    const vel = entity.vel
    const f = Math.fround
    const factor = blockJumpFactor(entity, world)
    const boost = entity.jumpBoost > 0 ? f(f(0.1) * entity.jumpBoost) : 0
    let power
    if (jumpStrengthAttribute) {
      const synced = jumpStrengthResource && entity.attributes && entity.attributes[jumpStrengthResource]
      const strength = f(synced ? attribute.getAttributeValue(synced) : 0.41999998688697815)
      power = f(f(strength * factor) + boost)
      if (power <= f(1.0e-5)) return
    } else if (jumpSumInDouble) {
      power = f(f(0.42) * factor) + boost
    } else {
      power = f(f(f(0.42) * factor) + boost)
    }
    vel.y = jumpKeepsHigherMotion ? Math.max(power, vel.y) : power
    if (entity.isSprinting) {
      const { sin, cos } = yawSinCos(entity, false)
      if (sprintJumpInDouble) {
        vel.x += -sin * 0.2
        vel.z += cos * 0.2
      } else {
        vel.x += f(-sin * f(0.2))
        vel.z += f(cos * f(0.2))
      }
    }
  }

  // Entity.getBlockJumpFactor (1.15+): the block at the feet, or the one below when that one's is 1; honey is 0.5F
  function blockJumpFactor (entity, world) {
    if (!blockJumpFactorFeature || honeyblockId === -1) return 1
    const factorOf = block => block && block.type === honeyblockId ? Math.fround(0.5) : 1
    const own = factorOf(world.getBlock(entity.pos.floored()))
    if (own !== 1) return own
    return factorOf(world.getBlock(onPosBelow ? blockPosBelowAffectingMovement(entity, world) : new Vec3(entity.pos.x, entity.pos.y - 0.5000001, entity.pos.z).floored()))
  }

  // `round` rounds each operation, Math.fround where vanilla computes it in float (moveRelative before 1.14).
  function inputToWorld (strafe, forward, entity, round = x => x) {
    const { sin, cos } = yawSinCos(entity, headingAnglePiOver180)
    return { x: -round(round(strafe * cos) + round(forward * sin)), z: round(round(forward * cos) - round(strafe * sin)) }
  }

  // Entity.moveRelative: the input scaled to the float speed and turned by the yaw. Before 1.14 (moveFlying) all in
  // float: cut off below 1.0E-4F and divided by max(1, length). Since 1.14 (getInputVector) in double: cut off below
  // 1.0E-7 and normalized only when longer than 1, with a float length (Vec3.normalize, Mth.sqrt) until 1.17.
  function applyHeading (entity, strafe, forward, multiplier) {
    const speed = Math.fround(multiplier)
    let dir
    if (floatMoveRelative) {
      let f = Math.fround(Math.fround(strafe * strafe) + Math.fround(forward * forward))
      if (f < Math.fround(1.0e-4)) return
      f = Math.fround(Math.sqrt(f))
      if (f < 1) f = 1
      f = Math.fround(speed / f)
      dir = inputToWorld(Math.fround(strafe * f), Math.fround(forward * f), entity, Math.fround)
    } else {
      const lengthSqr = strafe * strafe + forward * forward
      if (lengthSqr < 1.0e-7) return
      if (lengthSqr > 1) {
        const length = floatLengthNormalize ? Math.fround(Math.sqrt(lengthSqr)) : Math.sqrt(lengthSqr)
        strafe /= length
        forward /= length
      }
      dir = inputToWorld(strafe * speed, forward * speed, entity)
    }
    entity.vel.x += dir.x
    entity.vel.z += dir.z
  }

  // The walking speed's factor for the friction under the player, in float (1 on most blocks, less on ice). Before
  // 1.14, inline in LivingEntity's travel: 0.16277136F (1.13: 0.16277137F) over the cube of friction * 0.91F. Since,
  // LivingEntity.getFrictionInfluencedSpeed: 0.21600002F over the cube of the friction.
  function groundSpeedFactor (friction, inertia) {
    if (groundSpeedFromInertia) {
      const constant = Math.fround(groundSpeedConstantRoundedUp ? 0.16277137 : 0.16277136)
      return Math.fround(constant / Math.fround(Math.fround(inertia * inertia) * inertia))
    }
    return Math.fround(Math.fround(0.21600002) / Math.fround(Math.fround(friction * friction) * friction))
  }

  const climbableTrapdoorFeature = supportFeature('climbableTrapdoor')
  const sprintSurvivesMinorCollision = supportFeature('sprintSurvivesMinorCollision')
  const headingAnglePiOver180 = supportFeature('headingAnglePiOver180')
  const blockEffectsAfterTravel = mcData.version['>=']('1.21.2')
  const insideBlocksAxisSteps = mcData.version['>=']('1.21.5')
  const insideBlocksAlongPath = mcData.version['>=']('1.21.9')
  const insideBlocksEndIntersect = mcData.version['>=']('1.21.10')
  // swimming up and down by version
  const sinksWithSneak = mcData.version['>=']('1.13')
  const sinkNeedsFluidEffect = mcData.version['>=']('1.16')
  const liquidJumpByThreshold = mcData.version['>=']('1.16')
  // gliding by version
  const glideLiftIsConstant = mcData.version['<']('1.13')
  const climbableStopsGliding = mcData.version['>=']('1.21.5')
  // BedBlock.updateEntityAfterFallOn bounces from 1.12
  const bedBounces = mcData.version['>=']('1.12')
  const fallStopMultiplies = mcData.version['>=']('1.14')
  const flightStopsGliding = mcData.version['<']('1.21.2')
  const glideCosineIsDouble = mcData.version['>=']('1.18.2')
  const legacyViewVector = mcData.version['<']('1.13')
  // starting to glide by version
  const clientStartsGliding = mcData.version['>=']('1.15')
  const levitationBlocksGliding = mcData.version['>=']('1.16')
  // climbing by version
  const climbLimitIsFloat = mcData.version['>=']('1.14')
  // LivingEntity.aiStep's negligible motion by version
  const negligibleVelocity = mcData.version.majorVersion === '1.8' ? 0.005 : 0.003
  const horizontalMotionStopsTogether = mcData.version['>=']('1.21.5')
  // Entity.getBlockSpeedFactor by version
  const blockSpeedFactorFeature = mcData.version['>=']('1.15')
  const soulSpeedIgnoresFactor = mcData.version['>=']('1.16') && mcData.version['<']('1.21')
  const onPosBelow = mcData.version['>=']('1.20')
  // LivingEntity.getEffectiveGravity: 0.08; from 1.20.5 the gravity attribute. Falling with Slow Falling (1.13+) at most
  // 0.01.
  const gravityResource = mcData.attributesByName.gravity?.resource
  const gravityAfterMove = mcData.version['>=']('1.21.2')
  function effectiveGravity (entity) {
    const synced = gravityResource && entity.attributes && entity.attributes[gravityResource]
    const gravity = synced ? attribute.getAttributeValue(synced) : physics.gravity
    return entity.vel.y <= 0 && entity.slowFalling > 0 ? Math.min(gravity, physics.gravity * physics.slowFalling) : gravity
  }

  const movementEfficiencyAttribute = mcData.attributesByName.movementEfficiency
  const movementEfficiencyResource = mcData.version['>=']('1.21') && movementEfficiencyAttribute ? movementEfficiencyAttribute.resource : null
  // LivingEntity.travel in water by version
  const sprintSwimDrag = mcData.version['>=']('1.13')
  const dolphinsGraceFeature = mcData.version['>=']('1.13')
  const fallingAfterDrag = mcData.version.majorVersion === '1.13'
  const waterClimbs = mcData.version['>=']('1.14')
  const waterEfficiencyAttribute = mcData.attributesByName.waterMovementEfficiency
  const waterEfficiencyResource = mcData.version['>=']('1.21') && waterEfficiencyAttribute ? waterEfficiencyAttribute.resource : null
  // Player's airborne speed by version (airborneSpeed)
  const airSpeedLagsSprint = mcData.version['<']('1.19.4')
  const airSprintSpeedFloatSum = mcData.version['>=']('1.18.2') && mcData.version['<']('1.19.4')
  // LivingEntity.jumpFromGround by version
  const blockJumpFactorFeature = mcData.version['>=']('1.15')
  const jumpSumInDouble = mcData.version['<']('1.14') || (mcData.version['>=']('1.17') && mcData.version['<']('1.20'))
  const jumpStrengthAttribute = mcData.version['>=']('1.20.5')
  const jumpStrengthResource = mcData.attributesByName.jumpStrength?.resource
  const jumpKeepsHigherMotion = mcData.version['>=']('1.21.2')
  const sprintJumpInDouble = mcData.version['>=']('1.20.5')
  const positionFromBox = supportFeature('positionFromBox')
  const moveThreshold = supportFeature('moveThreshold')
  const appliesUnobstructedTinyMove = mcData.version['>=']('1.21.2') // Entity.move: changed within 1.21
  const floatMoveRelative = supportFeature('floatMoveRelative')
  const floatLengthNormalize = supportFeature('floatLengthNormalize')
  const groundSpeedFromInertia = supportFeature('groundSpeedFromInertia')
  const groundSpeedConstantRoundedUp = supportFeature('groundSpeedConstantRoundedUp')
  // Mth.sin(double) indexes the table in double from 1.21.11. features.json lists major versions only, and this
  // splits 1.21, so it is a version check.
  const sinTableDoubleIndex = mcData.version['>=']('1.21.11')
  const sneakSlowsWithKey = supportFeature('sneakSlowsWithKey')
  // LocalPlayer's sprint rules by version (updateSprinting)
  const sprintNeedsImpulse08 = mcData.version['<']('1.14')
  const sprintWaterRules = mcData.version['>=']('1.13')
  const sneakResetsSprintTrigger = mcData.version['>=']('1.16')
  const elytraBlocksSprintStart = mcData.version['>=']('1.19.4')
  const sprintStopsWhenSlowed = mcData.version['==']('1.21.4')
  const sprintPossibleWhileFlying = mcData.version['>=']('1.21.9')
  // LocalPlayer's input scaling order changed within 1.21
  const itemUseBeforeSneak = mcData.version['>=']('1.21.4')
  const inputScalesFirst = mcData.version['>=']('1.21.5')
  const sneakSlowsWithKeyOrPose = supportFeature('sneakSlowsWithKeyOrPose')
  const flightUndoesSneakSlow = supportFeature('flightUndoesSneakSlow')
  const swiftSneakFeature = supportFeature('swiftSneak')
  const sneakingSpeedAttribute = mcData.attributesByName.sneakingSpeed ?? mcData.attributesByName.playerSneakingSpeed
  const sneakingSpeedResource = supportFeature('sneakingSpeedAttribute') && sneakingSpeedAttribute ? sneakingSpeedAttribute.resource : null
  // LivingEntity.travel (1.17+): leather boots climb powder snow like a ladder: the block at the feet after the move up to
  // 1.21.4 (getFeetBlockState, getInBlockState), from 1.21.5 whether powder snow touched the player the tick before
  // (wasInPowderSnow)
  function climbsPowderSnow (entity, world) {
    if (!entity.leatherBoots || powderSnowId === -1) return false
    if (powderSnowClimbPreviousTick) return entity.wasInPowderSnow
    return world.getBlock(entity.pos.floored())?.type === powderSnowId
  }
  const powderSnowClimbPreviousTick = mcData.version['>=']('1.21.5')

  // LivingEntity.onClimbable: the feet block is a ladder or vine; from 1.14 scaffolding, from 1.16 the climbable tag's
  // weeping and twisting vines, from 1.17 its cave vines.
  function isOnLadder (world, pos) {
    const block = world.getBlock(pos)
    if (!block) { return false }
    if (block.type === ladderId || block.type === vineId || vineLikeIds.has(block.type)) { return true }
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

  function doesNotCollide (world, pos, entity) {
    const pBB = getPlayerBB(pos)
    return !getSurroundingBBs(world, pBB, entity).some(x => pBB.intersects(x)) && getWaterInBB(world, pBB).length === 0
  }

  // LocalPlayer.isHorizontalCollisionMinor: a collision counts as minor when the move that survived it still
  // points within 8 degrees of where the inputs wanted to go (brushing a wall), which keeps the sprint
  function isHorizontalCollisionMinor (entity, dx, dz) {
    // Use the same input-to-world transform as applyHeading so the desired direction matches where the move actually went
    // (an earlier local copy flipped the strafe sign, so diagonal input was compared against the wrong direction).
    const want = inputToWorld(entity.inputStrafe, entity.inputForward, entity)
    const wantSq = want.x * want.x + want.z * want.z
    const moveSq = dx * dx + dz * dz
    if (wantSq < 1e-5 || moveSq < 1e-5) return false
    const angle = Math.acos((want.x * dx + want.z * dz) / Math.sqrt(wantSq * moveSq))
    return angle < physics.minorCollisionAngle
  }

  // LocalPlayer.aiStep's sprint logic, after the input and before travel. The sprint key, or a second press of forward
  // within 6 ticks of the first (sprintTriggerTime), starts a sprint when the player may sprint; releasing the sprint
  // key does not stop one. `impulse` is the tick's forward impulse as aiStep reads it; entity.forwardImpulse and
  // entity.shiftKeyDown hold the tick before's.
  // - 1.8 to 1.13: a forward impulse of at least 0.8 (after the sneak and item scaling) starts and keeps a sprint.
  //   From 1.13 shallow water stops it, and under water a double tap needs no ground.
  // - 1.14 to 1.21.4: hasEnoughImpulseToStartSprinting starts it (any forward impulse under water); any forward
  //   impulse keeps it. From 1.16 sneaking resets the double tap, from 1.19.4 elytra flight blocks a start, and 1.21.4
  //   stops a sprint while gliding, blind, slowed or using an item, and starts none while slowed.
  // - From 1.21.5: canStartSprinting and shouldStopRunSprinting on the raw forward key; a double tap needs no ground.
  function updateSprinting (entity, impulse) {
    const control = entity.control
    const lastImpulse = entity.forwardImpulse
    const wasSneaking = entity.shiftKeyDown
    const underWater = entity.isUnderWater
    const shallowWater = entity.isInWater && !underWater
    const enoughFood = entity.food > 6 || entity.mayFly
    const blind = entity.blindness > 0
    const slowed = isMovingSlowly(entity)
    const collided = entity.isCollidedHorizontally && !(sprintSurvivesMinorCollision && entity.minorHorizontalCollision)
    if (entity.sprintTriggerTime > 0) entity.sprintTriggerTime--

    if (inputScalesFirst) {
      if (wasSneaking || entity.usingItem || control.back) entity.sprintTriggerTime = 0
      const hasImpulse = impulse > 1.0e-5
      const possible = !blind && enoughFood && (sprintPossibleWhileFlying ? entity.flying || !shallowWater : !shallowWater)
      if (!entity.isSprinting && hasImpulse && possible && !entity.usingItem && (!entity.elytraFlying || underWater) && (!slowed || underWater)) {
        if (!(lastImpulse > 1.0e-5)) {
          if (entity.sprintTriggerTime > 0) entity.isSprinting = true
          else entity.sprintTriggerTime = 7
        }
        if (control.sprint) entity.isSprinting = true
      }
      // LocalPlayer.shouldStopSwimSprinting: a swimmer keeps sprinting against a wall, and stops out of water, idle in
      // the water (not on the ground, not sneaking), blinded or with too little food
      if (entity.isSwimming) {
        if (entity.isSprinting && (!entity.isInWater || (!hasImpulse && !entity.onGround && !control.sneak) || blind || !enoughFood)) entity.isSprinting = false
        return
      }
      if (entity.isSprinting && (!possible || !hasImpulse || collided)) entity.isSprinting = false
      return
    }

    const legacy = sprintNeedsImpulse08
    if (sprintStopsWhenSlowed && (entity.elytraFlying || blind || slowed || (entity.usingItem && !underWater))) entity.isSprinting = false
    if (entity.usingItem || (sneakResetsSprintTrigger && wasSneaking)) entity.sprintTriggerTime = 0
    const enough = value => !legacy && underWater ? value > 1.0e-5 : value >= 0.8
    const canStart = !entity.isSprinting && enough(impulse) && enoughFood && !entity.usingItem && !blind &&
      !(elytraBlocksSprintStart && entity.elytraFlying) && !(sprintStopsWhenSlowed && slowed && !underWater)
    if ((entity.onGround || (sprintWaterRules && underWater)) && !wasSneaking && !enough(lastImpulse) && canStart) {
      if (entity.sprintTriggerTime <= 0 && !control.sprint) entity.sprintTriggerTime = 7
      else entity.isSprinting = true
    }
    if ((!sprintWaterRules || !shallowWater) && canStart && control.sprint) entity.isSprinting = true
    if (entity.isSprinting) {
      const noImpulse = legacy ? impulse < 0.8 : !(impulse > 1.0e-5)
      // LocalPlayer.aiStep (1.13+): a swimmer keeps sprinting against a wall, and stops out of water or idle in the
      // water (not on the ground, not sneaking)
      if (sprintWaterRules && entity.isSwimming) {
        if ((!entity.onGround && !control.sneak && (noImpulse || !enoughFood)) || !entity.isInWater) entity.isSprinting = false
      } else if (noImpulse || !enoughFood || collided || (sprintWaterRules && shallowWater)) entity.isSprinting = false
    }
  }

  // Whether sneaking slows the input. Up to 1.13 while the sneak key is down (KeyboardInput); from 1.9 creative flight
  // divides the slowdown back out. On 1.14 while the key is down or was down the tick before (the sneaking pose), and
  // flight divides it out while the key is down. From 1.15 while crouching (LocalPlayer.isMovingSlowly), which aiStep
  // decides before reading the keys, from the tick before's key, and never while flying (from 1.20.2 nor riding).
  // `beforeFlight`: the slowdown before flight divides it out, which the sprint logic reads (1.9 to 1.14)
  function isMovingSlowly (entity, beforeFlight = false) {
    const flying = entity.flying
    const undone = flying && flightUndoesSneakSlow && !beforeFlight
    if (sneakSlowsWithKey) return entity.control.sneak && !undone
    // crawling: the swimming pose out of water (isVisuallyCrawling)
    const crawling = entity.pose === 'swimming' && !entity.isInWater
    if (sneakSlowsWithKeyOrPose) return (entity.control.sneak || entity.crouching || crawling) && !(undone && entity.control.sneak)
    return entity.crouching || crawling
  }

  // The sneaking slowdown: (float)(0.3D) up to 1.18; 0.3F plus 0.15F per Swift Sneak level on 1.19 and 1.20; from 1.21
  // the sneaking_speed attribute
  function sneakingSpeed (entity) {
    if (sneakingSpeedResource) {
      const synced = entity.attributes && entity.attributes[sneakingSpeedResource]
      return Math.fround(synced ? math.clamp(0, attribute.getAttributeValue(synced), 1) : 0.3) // a RangedAttribute, 0 to 1
    }
    if (swiftSneakFeature) return math.clamp(0, Math.fround(Math.fround(0.3) + Math.fround(entity.swiftSneak * Math.fround(0.15))), 1)
    return Math.fround(0.3)
  }

  // The input travel gets (strafe to the right, forward): the key impulses scaled, each step a float operation, for
  // sneaking (S), using an item (U, 0.2F; LocalPlayer.aiStep, from 1.21.5 modifyInput) and by 0.98F (D;
  // LivingEntity.aiStep, from 1.21.5 modifyInput). The order is S U D up to 1.21.3, U S D on 1.21.4, D U S since.
  // 1.21.11 takes U from the used item's use effects: 0.2F for all but a few items, such as spears, which this omits.
  function movementInput (entity) {
    const slow = isMovingSlowly(entity) ? sneakingSpeed(entity) : 1
    const use = entity.usingItem ? Math.fround(0.2) : 1
    const order = inputScalesFirst ? [Math.fround(0.98), use, slow] : itemUseBeforeSneak ? [use, slow, Math.fround(0.98)] : [slow, use, Math.fround(0.98)]
    const scale = (impulse, factors) => factors.reduce((value, factor) => Math.fround(value * factor), impulse)
    const forwardKeys = entity.control.forward - entity.control.back
    if (inputScalesFirst) {
      const input = squareMovementInput(entity.control.left - entity.control.right, forwardKeys, order)
      return { ...input, nextImpulse: input.impulse }
    }
    // The forward impulse the sprint logic reads, before 0.98F. On 1.9 to 1.14 creative flight divides the sneak
    // slowdown out only after the sprint logic, so that reads the slowed impulse, and the next tick the restored one.
    const sprintSlow = flightUndoesSneakSlow && isMovingSlowly(entity, true) ? sneakingSpeed(entity) : slow
    return {
      strafe: scale(entity.control.right - entity.control.left, order),
      forward: scale(forwardKeys, order),
      impulse: scale(forwardKeys, [sprintSlow, use]),
      nextImpulse: scale(forwardKeys, order.slice(0, 2))
    }
  }

  // From 1.21.5 the input is a Vec2 of floats (left, forward): KeyboardInput normalizes the keys' vector, and
  // LocalPlayer.modifyInput scales it (`factors`) and stretches it towards the unit square
  // (modifyInputSpeedForSquareMovement), so a diagonal is as fast as a straight line. The sprint logic reads the
  // normalized forward.
  function squareMovementInput (left, forwardKeys, factors) {
    const f = Math.fround
    const length = (x, y) => f(Math.sqrt(f(f(x * x) + f(y * y))))
    const keyLength = length(left, forwardKeys)
    if (keyLength < f(1.0e-4)) return { strafe: 0, forward: 0, impulse: 0 }
    let x = f(left / keyLength)
    let y = f(forwardKeys / keyLength)
    const impulse = y
    for (const factor of factors) {
      x = f(x * factor)
      y = f(y * factor)
    }
    const scaledLength = length(x, y)
    if (scaledLength > 0) {
      const inverse = f(1 / scaledLength)
      x = f(x * inverse)
      y = f(y * inverse)
      const ax = Math.abs(x)
      const ay = Math.abs(y)
      const ratio = ay > ax ? f(ax / ay) : f(ay / ax)
      const toSquare = f(Math.sqrt(f(1 + f(ratio * ratio))))
      const stretch = Math.min(f(scaledLength * toSquare), 1)
      x = f(x * stretch)
      y = f(y * stretch)
    }
    return { strafe: 0 - x, forward: y, impulse } // strafe is to the right; 0 - x keeps a zero positive
  }

  function moveEntityWithHeading (entity, world, strafe, forward) {
    const vel = entity.vel
    const pos = entity.pos
    // up to 1.19.4 LivingEntity.travel ends the fall distance as it starts, falling under Slow Falling
    if (!effectsEndFallBeforeTravel && vel.y <= 0 && entity.slowFalling > 0) entity.fallDistance = 0

    // Player.travel (1.13+): swimming turns the vertical motion towards the look, by 0.085 when looking down past -0.2,
    // else 0.06, when looking level or down, jumping, or with fluid just under the head
    if (fluidStates && entity.isSwimming) {
      const lookY = viewVector(entity).y
      const head = world.getBlock(new Vec3(pos.x, pos.y + 1.0 - 0.1, pos.z).floored())
      if (lookY <= 0 || entity.control.jump || fluidOf(head, 'water') || fluidOf(head, 'lava')) {
        vel.y += (lookY - vel.y) * (lookY < -0.2 ? 0.085 : 0.06)
      }
    }

    const gravityMultiplier = (vel.y <= 0 && entity.slowFalling > 0) ? physics.slowFalling : 1
    const gravity = effectiveGravity(entity)

    // Player.isAffectedByFluids is false while flying, so a flying player in water or lava takes
    // the flight movement below rather than the fluid one.
    if (!entity.flying && (entity.isInWater || entity.isInLava)) {
      // Water / Lava movement
      const lastY = pos.y
      const { drag, acceleration } = entity.isInWater
        ? waterDragAndAcceleration(entity)
        : { drag: physics.lavaInertia, acceleration: Math.fround(0.02) }
      // the fluid the tick travels in, chosen before the move (Entity.move may find water again after it)
      const inWater = entity.isInWater

      const isFalling = vel.y <= 0
      applyHeading(entity, strafe, forward, acceleration)
      moveEntity(entity, world, vel.x, vel.y, vel.z)
      // from 1.14 a ladder or vine climbed against a wall in water lifts at 0.2
      if (inWater && waterClimbs && entity.isCollidedHorizontally && isOnLadder(world, pos)) vel.y = 0.2
      if (fluidHeightFromFeet) {
        // LivingEntity.travelInWater / travelInLava (1.13+)
        if (lavaAfterMove && !inWater) {
          // From 26.1 LivingEntity.checkFallDamage updates lava too after the move (Entity.updateFluidInteraction), so
          // the lava regime below sees the moved box; up to 1.21.11 it looks again for water only
          entity.lavaHeight = scanFluid(world, getPlayerBB(pos).contract(0.001, 0.001, 0.001), (block) => block && lavaIds.includes(block.type)).height
        }
        // getFluidFallingAdjustedMovement: sink by gravity / 16, except the narrow band the game clamps to -0.003 so a
        // floating player does not creep down; a sprinting player does not sink. 1.13 reads "falling" after the drag.
        const fallingAdjusted = (y, falling) => entity.isSprinting
          ? y
          : (falling && Math.abs(y - 0.005) >= 0.003 && Math.abs(y - gravity / 16) < 0.003) ? -0.003 : y - gravity / 16
        if (inWater) {
          vel.x *= drag
          vel.y *= Math.fround(0.8)
          vel.z *= drag
          vel.y = fallingAdjusted(vel.y, fallingAfterDrag ? vel.y <= 0 : isFalling)
        } else if (shallowLavaMovement && entity.lavaHeight <= physics.fluidJumpThreshold) {
          // Shallow-lava regime, 1.16+ only. Before 1.16 LivingEntity.travel has no shallow/deep split - lava always
          // takes the deep branch below (scale by lavaInertia, subtract gravity/4).
          vel.x *= physics.lavaInertia
          vel.y *= Math.fround(0.8)
          vel.z *= physics.lavaInertia
          vel.y = fallingAdjusted(vel.y, isFalling) - gravity / 4
        } else {
          vel.x *= physics.lavaInertia
          vel.y *= physics.lavaInertia
          vel.z *= physics.lavaInertia
          vel.y -= gravity / 4
        }
      } else {
        vel.y *= inWater ? Math.fround(0.8) : physics.lavaInertia
        vel.y -= (inWater ? physics.waterGravity : physics.lavaGravity) * gravityMultiplier
        vel.x *= drag
        vel.z *= drag
      }

      // jump out of the fluid at its edge, if 0.6F higher is free (LivingEntity.travel, isFree)
      if (entity.isCollidedHorizontally && doesNotCollide(world, pos.offset(vel.x, vel.y + Math.fround(0.6) - pos.y + lastY, vel.z), entity)) {
        vel.y = physics.outOfLiquidImpulse // jump out of liquid
      }
    } else if (entity.elytraFlying) {
      const flightEntryVelY = vel.y
      glide(entity, gravity)
      moveEntity(entity, world, vel.x, vel.y, vel.z)
      // Player.travel wraps the glide while creative flying: the vertical velocity the tick started with comes back
      // damped, and up to 1.21.1 the flight ends the glide on the client too (setSharedFlag(7, false))
      if (entity.flying) {
        vel.y = flightEntryVelY * 0.6
        if (flightStopsGliding) entity.elytraFlying = false
      }
    } else {
      // Normal movement
      let acceleration = 0.0
      let inertia = 0.0
      // the friction's block: from 1.20 the one under the supporting block (getBlockPosBelowThatAffectsMyMovement)
      const blockUnder = world.getBlock(onPosBelow ? blockPosBelowAffectingMovement(entity, world) : pos.offset(0, -1, 0))
      // Player.travel wraps the move while flying and puts back the vertical velocity the tick
      // started with, damped, so it is read before anything below touches it.
      const flightEntryVelY = vel.y
      if (entity.onGround && blockUnder) {
        const attributeSpeed = movementSpeed(entity)
        // LivingEntity.travel: the friction of the block under the player and the inertia, floats
        const friction = Math.fround(blockSlipperiness[blockUnder.type] || physics.defaultSlipperiness)
        inertia = Math.fround(friction * Math.fround(0.91))
        acceleration = Math.fround(attributeSpeed * groundSpeedFactor(friction, inertia))
        if (acceleration < 0) acceleration = 0 // acceleration should not be negative
      } else if (entity.flying) {
        // Player.travel / getFlyingSpeed: creative flight accelerates at the abilities' flying speed, doubled while
        // sprinting (a float product)
        acceleration = entity.isSprinting ? Math.fround(entity.flyingSpeed * 2) : entity.flyingSpeed
        inertia = physics.airborneInertia
      } else {
        acceleration = airborneSpeed(entity)
        inertia = physics.airborneInertia
      }

      applyHeading(entity, strafe, forward, acceleration)

      if (!entity.flying && isOnLadder(world, pos)) {
        // LivingEntity.handleOnClimbable: at most 0.15F across; down at most 0.15 up to 1.13, 0.15F since; holding sneak
        // stops a fall (from 1.14 not on scaffolding)
        entity.fallDistance = 0
        const limit = Math.fround(0.15)
        vel.x = math.clamp(-limit, vel.x, limit)
        vel.z = math.clamp(-limit, vel.z, limit)
        vel.y = Math.max(vel.y, climbLimitIsFloat ? -limit : -0.15)
        const onScaffolding = climbLimitIsFloat && scaffoldingId !== -1 && world.getBlock(pos)?.type === scaffoldingId
        if (vel.y < 0 && entity.control.sneak && !onScaffolding) vel.y = 0
      }

      moveEntity(entity, world, vel.x, vel.y, vel.z)

      if (!entity.flying && (isOnLadder(world, pos) || climbsPowderSnow(entity, world)) && (entity.isCollidedHorizontally ||
        (supportFeature('climbUsingJump') && entity.control.jump))) {
        vel.y = physics.ladderClimbSpeed // climb ladder
      }

      // Apply friction and gravity
      if (entity.flying) {
        vel.y = flightEntryVelY * 0.6
      } else {
        if (entity.levitation > 0) {
          vel.y += (0.05 * entity.levitation - vel.y) * 0.2
          if (!effectsEndFallBeforeTravel) entity.fallDistance = 0 // up to 1.19.4 after the move
        } else {
          // from 1.21.2 travelInAir reads the gravity after the move, so Slow Falling sees the motion the move left
          vel.y -= gravityAfterMove ? effectiveGravity(entity) : gravity
        }
        vel.y *= physics.airdrag
      }
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
    if (!waterIds.includes(block.type) && !lavaIds.includes(block.type)) return -1
    const meta = block.metadata
    return meta >= 8 ? 0 : meta
  }

  const HORIZONTAL = [[0, -1], [1, 0], [0, 1], [-1, 0]] // north, east, south, west (Direction.Plane.HORIZONTAL)

  // Vec3.normalize: zero under a length of 1.0E-4; the length through the float Mth.sqrt before 1.17
  function normalizeVec (v) {
    const lengthSqr = v.x * v.x + v.y * v.y + v.z * v.z
    const length = normalizeFloatSqrt ? Math.fround(Math.sqrt(lengthSqr)) : Math.sqrt(lengthSqr)
    return length < 1.0e-4 ? new Vec3(0, 0, 0) : new Vec3(v.x / length, v.y / length, v.z / length)
  }

  // The direction a fluid flows in a block, a unit vector (or zero): BlockLiquid.getFlow up to 1.12, FlowingFluid.getFlow
  // from 1.13. Each is the sum of the drops to the four sides (to the fluid under a side that does not block movement
  // when the side has none), turned down by 6 for falling fluid beside a solid face, normalized.
  function getFlow (world, block) {
    return fluidStates ? fluidFlow(world, block.position, fluidOf(block, 'water'), 'water') : legacyFlow(world, block)
  }

  // BlockLiquid.getFlowVector (up to 1.12): the levels are integers (getEffectiveFlowDecay)
  function legacyFlow (world, block) {
    const pos = block.position
    const depth = b => b && waterIds.includes(b.type) ? (b.metadata >= 8 ? 0 : b.metadata) : -1
    const current = depth(block)
    let flow = new Vec3(0, 0, 0)
    for (const [dx, dz] of HORIZONTAL) {
      const side = world.getBlock(pos.offset(dx, 0, dz))
      const level = depth(side)
      if (level < 0) {
        if (!side || side.boundingBox === 'empty') {
          const below = depth(world.getBlock(pos.offset(dx, -1, dz)))
          if (below >= 0) {
            flow.x += dx * (below - (current - 8))
            flow.z += dz * (below - (current - 8))
          }
        }
      } else {
        flow.x += dx * (level - current)
        flow.z += dz * (level - current)
      }
    }
    if (block.metadata >= 8) {
      for (const [dx, dz] of HORIZONTAL) {
        if (isSolidFace(world, pos.offset(dx, 0, dz), 'water') || isSolidFace(world, pos.offset(dx, 1, dz), 'water')) {
          flow = normalizeVec(flow).translate(0, -6, 0)
          break
        }
      }
    }
    return normalizeVec(flow)
  }

  // FlowingFluid.getFlow (1.13+): the heights are floats
  function fluidFlow (world, pos, fluid, kind) {
    const f = Math.fround
    let x = 0
    let z = 0
    const own = ownHeight(fluid)
    for (const [dx, dz] of HORIZONTAL) {
      const sidePos = pos.offset(dx, 0, dz)
      const sideBlock = world.getBlock(sidePos)
      const side = fluidOf(sideBlock, kind)
      if (!side && isOtherFluid(sideBlock, kind)) continue // affectsFlow: the same fluid or none
      let height = ownHeight(side)
      let drop = 0
      if (height === 0) {
        if (!sideBlock || sideBlock.boundingBox === 'empty') {
          const belowBlock = world.getBlock(sidePos.offset(0, -1, 0))
          const below = fluidOf(belowBlock, kind)
          if (below || !isOtherFluid(belowBlock, kind)) {
            height = ownHeight(below)
            if (height > 0) drop = f(own - f(height - f(0.8888889)))
          }
        }
      } else if (height > 0) {
        drop = f(own - height)
      }
      if (drop !== 0) {
        x += f(dx * drop)
        z += f(dz * drop)
      }
    }
    let flow = new Vec3(x, 0, z)
    if (fluid.falling) {
      for (const [dx, dz] of HORIZONTAL) {
        if (isSolidFace(world, pos.offset(dx, 0, dz), kind) || isSolidFace(world, pos.offset(dx, 1, dz), kind)) {
          flow = normalizeVec(flow).translate(0, -6, 0)
          break
        }
      }
    }
    return normalizeVec(flow)
  }

  // The fluid of a kind in a block as FluidState has it (1.13+): { amount, falling }, or null
  function fluidOf (block, kind) {
    if (!block) return null
    if (kind === 'water') {
      if (waterLike.has(block.type) || block.isWaterlogged) return { amount: 8, falling: false }
      if (!waterIds.includes(block.type)) return null
    } else if (!lavaIds.includes(block.type)) return null
    const level = block.metadata
    return level === 0 ? { amount: 8, falling: false } : level >= 8 ? { amount: 8, falling: true } : { amount: 8 - level, falling: false }
  }

  const ownHeight = fluid => fluid ? Math.fround(fluid.amount / 9) : 0
  const isOtherFluid = (block, kind) => !!fluidOf(block, kind === 'water' ? 'lava' : 'water')

  // Block.isFaceSturdy / the legacy isBlockSolid of the side: a full cube that is not the fluid itself nor ice
  function isSolidFace (world, pos, kind) {
    const block = world.getBlock(pos)
    if (!block || fluidOf(block, kind)) return false
    if (blocksByName.ice && block.type === blocksByName.ice.id) return false
    return block.shapes.length === 1 && block.shapes[0].every((v, i) => v === (i < 3 ? 0 : 1))
  }

  // Since 1.13 (Entity.updateFluidHeightAndDoFluidPushing) a fluid counts as soon as its surface
  // is above the bottom of the box deflated by 0.001; before that (handleMaterialAcceleration)
  // the box was shrunk by 0.4 at the top and compared through ceil(maxY).
  const fluidHeightFromFeet = supportFeature('fluidHeightFromFeet')
  const fluidStates = mcData.version['>=']('1.13')
  const eyesLagATick = mcData.version['>=']('1.16')
  const swimNeedsWaterAtFeet = mcData.version['>=']('1.17')
  const eyeFluidOffset = mcData.version['>=']('1.16') && mcData.version['<']('1.20.5')

  // The eye height (1.62F; crouching from 1.14 1.27F, the pose the last tick left; from 1.20.5 times the scale) against
  // the water in the block at the eyes: up to 1.15 under its surface plus 0.11111111F (Entity.isUnderLiquid); from 1.16
  // below its surface, the eyes taken 0.11111111 lower up to 1.20.4 (Entity.updateFluidOnEyes). The surface is
  // (float)(y + height), the height 1 under more water from 1.14.
  // The eye height of the pose (Player.getStandingEyeHeight from 1.14; EntityPlayer.getEyeHeight up to 1.13, sneaking
  // 1.62 - 0.08, and the 0.6 box 0.4, which 1.13 checks first)
  function poseEyeHeight (entity) {
    const pose = entity.pose ?? 'standing'
    if (posePoses) return POSE_EYE[pose] ?? 1.62
    const height = POSE_HEIGHT[pose] ?? 1.8
    const sneaking = !!entity.shiftKeyDown || height === 1.65
    const short = entity.elytraFlying || (fluidStates && entity.isSwimming) || height === 0.6
    if (fluidStates && short) return 0.4
    if (sneaking) return 1.62 - 0.08
    if (short && legacySize) return 0.4
    return 1.62
  }

  function eyesInWater (entity, world) {
    const f = Math.fround
    const pos = entity.pos
    const synced = scaleResource && entity.attributes && entity.attributes[scaleResource]
    const scale = synced ? f(attribute.getAttributeValue(synced)) : 1
    const eyeHeight = f(f(poseEyeHeight(entity)) * scale)
    let eyeY = pos.y + eyeHeight
    if (eyeFluidOffset) eyeY -= 0.1111111119389534
    const cell = new Vec3(Math.floor(pos.x), Math.floor(eyeY), Math.floor(pos.z))
    const fluid = fluidOf(world.getBlock(cell), 'water')
    if (!fluid) return false
    const height = heightUnderSameFluid && fluidOf(world.getBlock(cell.offset(0, 1, 0)), 'water') ? 1 : ownHeight(fluid)
    if (!eyesLagATick) return eyeY < f(f(cell.y + height) + f(0.11111111))
    return f(cell.y + height) > eyeY
  }
  const heightUnderSameFluid = mcData.version['>=']('1.14')
  const minimumFluidPush = mcData.version['>=']('1.16')
  const unifiedFluidInteraction = mcData.version['>=']('26.1')
  const normalizeFloatSqrt = mcData.version['<']('1.17')
  const waterAfterMove = mcData.version.minecraftVersion !== '1.21.4'
  const lavaAfterMove = mcData.version['>=']('26.1')
  const rocketTicksAfterPlayer = !(mcData.version['>=']('1.14') && mcData.version['<']('1.17'))
  const lavaByHeight = mcData.version['>=']('1.16')
  const lavaFlagFromMove = mcData.version['>=']('1.14') && !lavaByHeight
  const shallowLavaMovement = supportFeature('shallowLavaMovement')

  function isWaterBlock (block) {
    return block && (waterIds.includes(block.type) || waterLike.has(block.type) || block.isWaterlogged)
  }

  function getWaterInBB (world, bb) {
    return getFluidInBB(world, bb, isWaterBlock)
  }

  function getFluidInBB (world, bb, isFluid) {
    return scanFluid(world, bb, isFluid).blocks
  }

  // Entity.updateFluidHeightAndDoFluidPushing: the fluid blocks the box is in, and how far the
  // highest fluid surface reaches above the bottom of the box
  function scanFluid (world, bb, isFluid) {
    const blocks = []
    let height = 0
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(bb.minY); cursor.y <= Math.floor(bb.maxY); cursor.y++) {
      for (cursor.z = Math.floor(bb.minZ); cursor.z <= Math.floor(bb.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(bb.minX); cursor.x <= Math.floor(bb.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (isFluid(block)) {
            const fluidLevel = cursor.y + 1 - getLiquidHeightPcent(block)
            if (fluidHeightFromFeet ? fluidLevel >= bb.minY : Math.ceil(bb.maxY) >= fluidLevel) {
              blocks.push(block)
              height = Math.max(height, fluidLevel - bb.minY)
            }
          }
        }
      }
    }
    return { blocks, height }
  }

  // Entity.updateInWaterStateAndDoWaterCurrentPushing (handleWaterMovement up to 1.12): whether water reaches the box,
  // how high (1.13+), and its current's push. Player.isPushedByFluid is false while flying, so currents leave a flying
  // player alone.
  function updateInWater (entity, world, box) {
    if (fluidStates) {
      const water = updateFluidPush(entity, world, box, 'water', 0.014)
      entity.isInWater = water.found
      entity.waterHeight = water.height
    } else {
      entity.isInWater = isInWaterApplyCurrent(world, box.clone().contract(0.001, 0.401, 0.001), entity.vel, !entity.flying)
    }
  }

  function isInWaterApplyCurrent (world, bb, vel, pushed) {
    const acceleration = new Vec3(0, 0, 0)
    const waterBlocks = getWaterInBB(world, bb)
    const isInWater = waterBlocks.length > 0
    if (!pushed) return isInWater
    for (const block of waterBlocks) {
      const flow = getFlow(world, block)
      acceleration.add(flow)
    }

    // the sum of the flows, normalized (Entity.handleMaterialAcceleration, up to 1.12)
    if (acceleration.norm() > 0) {
      const push = normalizeVec(acceleration)
      vel.x += push.x * 0.014
      vel.y += push.y * 0.014
      vel.z += push.z * 0.014
    }
    return isInWater
  }

  // Entity.updateFluidHeightAndDoFluidPushing (1.13+): whether the fluid reaches the box (deflated by 0.001), how high
  // above its bottom, and the current's push. Cells x, then y, then z: a fluid whose surface ((float)(y + height), the
  // height 1 under the same fluid from 1.14) is at or above the bottom counts; while the highest so far is under 0.4 its
  // flow is scaled by it. A player's push is the flows' average times `speed`, not normalized; from 1.16 an entity
  // nearly at rest is pushed at least 0.0045. Player.isPushedByFluid is false while flying. From 26.1
  // (EntityFluidInteraction) the surface is a double, the height is from the undeflated bottom, the fluid counts only when
  // it is above that bottom, and a current under 1.0E-5 (squared) does not push.
  function updateFluidPush (entity, world, box, kind, speed) {
    const bottom = box.minY
    const bb = box.clone().contract(0.001, 0.001, 0.001)
    const pushed = !entity.flying
    let height = 0
    let found = false
    let flow = new Vec3(0, 0, 0)
    let count = 0
    const cursor = new Vec3(0, 0, 0)
    for (cursor.x = Math.floor(bb.minX); cursor.x < Math.ceil(bb.maxX); cursor.x++) {
      for (cursor.y = Math.floor(bb.minY); cursor.y < Math.ceil(bb.maxY); cursor.y++) {
        for (cursor.z = Math.floor(bb.minZ); cursor.z < Math.ceil(bb.maxZ); cursor.z++) {
          const fluid = fluidOf(world.getBlock(cursor), kind)
          if (!fluid) continue
          const surface = heightUnderSameFluid && fluidOf(world.getBlock(cursor.offset(0, 1, 0)), kind) ? 1 : ownHeight(fluid)
          const top = unifiedFluidInteraction ? cursor.y + surface : Math.fround(cursor.y + surface)
          if (top < bb.minY) continue
          found = true
          height = Math.max(top - (unifiedFluidInteraction ? bottom : bb.minY), height)
          if (!pushed) continue
          let push = fluidFlow(world, cursor.clone(), fluid, kind)
          if (height < 0.4) push = push.scaled(height)
          flow = flow.plus(push)
          count++
        }
      }
    }
    if (unifiedFluidInteraction) found = height > 0
    const flowing = unifiedFluidInteraction
      ? count !== 0 && !(flow.x * flow.x + flow.y * flow.y + flow.z * flow.z < 9.999999747378752e-6)
      : flow.norm() > 0
    if (flowing) {
      if (count > 0) flow = flow.scaled(1 / count)
      flow = flow.scaled(speed)
      const vel = entity.vel
      if (minimumFluidPush && Math.abs(vel.x) < 0.003 && Math.abs(vel.z) < 0.003 && flow.norm() < 0.0045000000000000005) {
        flow = normalizeVec(flow).scaled(0.0045000000000000005)
      }
      vel.x += flow.x
      vel.y += flow.y
      vel.z += flow.z
    }
    return { found, height }
  }

  // FireworkRocketEntity.tick: a firework the player rides boosts a glide along the look (Entity.getLookAngle, the view
  // vector the glide uses). The client ticks it in its entity order: after the player, which it added first, up to 1.13
  // (a list) and from 1.17 (EntityTickList), so the boost comes after the move; on 1.14 to 1.16 in the order of a hash map
  // by entity id, so either way, and the engine boosts before the move there.
  function boostByRocket (entity) {
    const vel = entity.vel
    if (entity.fireworkRocketDuration <= 0) return
    if (!entity.elytraFlying) {
      entity.fireworkRocketDuration = 0
      return
    }
    const look = viewVector(entity)
    vel.x += look.x * 0.1 + (look.x * 1.5 - vel.x) * 0.5
    vel.y += look.y * 0.1 + (look.y * 1.5 - vel.y) * 0.5
    vel.z += look.z * 0.1 + (look.z * 1.5 - vel.z) * 0.5
    --entity.fireworkRocketDuration
  }

  // Whether a block suffocates (BlockBehaviour.isSuffocating): up to 1.13 an opaque full cube (isNormalCube); from 1.14
  // a full cube except glass, leaves, grates, mangrove roots and cobwebs, and from 1.16 also farmland, soul sand, dirt
  // paths and mud, which are lower
  const NEVER_SUFFOCATES = /glass$|_leaves$|copper_grate$|^mangrove_roots$|^moving_piston$|^cobweb$/
  const ALWAYS_SUFFOCATES = new Set(['farmland', 'soul_sand', 'dirt_path', 'grass_path', 'mud'])
  function suffocates (block) {
    if (!block) return false
    const fullCube = block.shapes.length === 1 && block.shapes[0].every((v, i) => v === (i < 3 ? 0 : 1))
    if (!posePoses) return !block.transparent && fullCube
    if (NEVER_SUFFOCATES.test(block.name)) return false
    if (pushTowardsClosestSpace && ALWAYS_SUFFOCATES.has(block.name)) return true
    return fullCube
  }

  // LocalPlayer.aiStep pushes a player out of the blocks it is inside, before the move: from the four corners 0.35 widths
  // out, a corner in a blocked cell sets the motion towards the nearest open side of that cell (0.1F up to 1.13, 0.1
  // since). From 1.16 (moveTowardsClosestSpace) a cell is blocked by a suffocating block whose shape reaches into the
  // box's height there (deflated by 1.0E-7). Up to 1.15 (pushOutOfBlocks, from half a block above the feet): up to 1.12
  // a normal cube in the cell or the one above, on 1.13 the same (a swimmer: the cell only; the open side still needs
  // both free), on 1.14 and 1.15 a suffocating block anywhere in the box's height.
  function pushOutOfBlocks (entity, world) {
    if (entity.gameMode === 'spectator') return
    const pos = entity.pos
    const w = Math.fround(Math.fround(0.6) * scaleOf(entity)) * 0.35
    const corners = [[-w, w], [-w, -w], [w, -w], [w, w]]
    for (const [cx, cz] of corners) {
      if (pushTowardsClosestSpace) moveTowardsClosestSpace(entity, world, pos.x + cx, pos.z + cz)
      else pushOutOfBlock(entity, world, pos.x + cx, pos.z + cz)
    }
  }

  const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]] // west, east, north, south

  function moveTowardsClosestSpace (entity, world, x, z) {
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    const box = getPlayerBB(entity.pos)
    const blocked = (cx, cz) => {
      const check = new AABB(cx, box.minY, cz, cx + 1, box.maxY, cz + 1).contract(1.0e-7, 1.0e-7, 1.0e-7)
      for (let y = Math.floor(check.minY); y <= Math.floor(check.maxY); y++) {
        const block = world.getBlock(new Vec3(cx, y, cz))
        if (!suffocates(block)) continue
        if (shapesFor(block, new Vec3(cx, y, cz), entity).some(s => new AABB(cx + s[0], y + s[1], cz + s[2], cx + s[3], y + s[4], cz + s[5]).intersects(check))) return true
      }
      return false
    }
    if (!blocked(bx, bz)) return
    pushTowardsOpenSide(entity, x - bx, z - bz, (sx, sz) => !blocked(bx + sx, bz + sz), Number.MAX_VALUE, 0.1)
  }

  function pushOutOfBlock (entity, world, x, z) {
    const box = positionFromBox && entity.box ? entity.box : getPlayerBB(entity.pos)
    const y = box.minY + 0.5
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    const solid = (cx, cy, cz) => suffocates(world.getBlock(new Vec3(cx, cy, cz)))
    let blocked
    if (posePoses) {
      blocked = (cx, cz) => {
        for (let cy = Math.floor(box.minY); cy < Math.ceil(box.maxY); cy++) if (solid(cx, cy, cz)) return true
        return false
      }
    } else if (fluidStates && entity.isSwimming) {
      blocked = (cx, cz) => solid(cx, by, cz)
    } else {
      blocked = (cx, cz) => solid(cx, by, cz) || solid(cx, by + 1, cz)
    }
    if (!blocked(bx, bz)) return
    const open = (fluidStates && !posePoses)
      ? (sx, sz) => !solid(bx + sx, by, bz + sz) && !solid(bx + sx, by + 1, bz + sz)
      : (sx, sz) => !blocked(bx + sx, bz + sz)
    pushTowardsOpenSide(entity, x - bx, z - bz, open, 9999.0, posePoses ? 0.1 : Math.fround(0.1))
  }

  // the nearest open side of the cell, the corner's place in it being dx, dz
  function pushTowardsOpenSide (entity, dx, dz, open, farthest, speed) {
    let best = null
    let bestDistance = farthest
    for (const [sx, sz] of SIDES) {
      const coord = sx !== 0 ? dx : dz
      const distance = (sx > 0 || sz > 0) ? 1.0 - coord : coord
      if (distance < bestDistance && open(sx, sz)) {
        bestDistance = distance
        best = [sx, sz]
      }
    }
    if (!best) return
    if (best[0] !== 0) entity.vel.x = speed * best[0]
    else entity.vel.z = speed * best[1]
  }

  physics.simulatePlayer = (entity, world) => {
    playerDims = dimensionsOf(entity)
    try {
      return simulateTick(entity, world)
    } finally {
      playerDims = null
    }
  }

  function simulateTick (entity, world) {
    const vel = entity.vel
    const pos = entity.pos
    const tickStart = pos.clone()
    entity.movesThisTick = blockEffectsAfterTravel ? [] : null
    // Entity.baseTick: whether powder snow touched the player last tick
    entity.wasInPowderSnow = entity.isInPowderSnow
    entity.isInPowderSnow = false

    updateInWater(entity, world, getPlayerBB(pos))
    // Entity.updateFluidOnEyes (1.13+): whether the eyes are in water. From 1.16 isUnderWater is the eyes of the tick
    // before (wasEyeInWater) while in water; on 1.13 to 1.15 the eyes now.
    if (fluidStates) {
      const eyes = eyesInWater(entity, world)
      const was = eyesLagATick ? entity.eyeInWater : eyes
      entity.eyeInWater = eyes
      entity.isUnderWater = eyesLagATick ? !!was && entity.isInWater : eyes
      // Entity.updateSwimming (Player: never while flying): a swimmer keeps swimming while sprinting in water; a sprinter
      // starts under water, from 1.17 with water at the feet too
      if (entity.flying) entity.isSwimming = false
      else if (entity.isSwimming) entity.isSwimming = entity.isSprinting && entity.isInWater
      else entity.isSwimming = entity.isSprinting && entity.isUnderWater && (!swimNeedsWaterAtFeet || !!fluidOf(world.getBlock(pos.floored()), 'water'))
    }
    // Entity.isInLava: up to 1.13 any lava in the box shrunk by (0.1, 0.4, 0.1), looked up whenever it is asked; on 1.14
    // and 1.15 a flag the move sets when the box (shrunk by 0.001) touches lava, read on the next tick; from 1.16 the
    // lava's height above the feet, like water's
    if (lavaByHeight) {
      const lava = scanFluid(world, getPlayerBB(pos).contract(0.001, 0.001, 0.001), (block) => block && lavaIds.includes(block.type))
      entity.isInLava = lava.blocks.length > 0
      entity.lavaHeight = lava.height
    } else if (!lavaFlagFromMove) {
      entity.isInLava = isMaterialInBB(world, getPlayerBB(pos).contract(0.1, 0.4, 0.1), lavaIds)
    }

    pushOutOfBlocks(entity, world)
    const startVelY = vel.y
    // LocalPlayer.aiStep: from 1.13 sneaking in water sinks by 0.04F (goDownInWater; from 1.16 not while flying), before
    // the flight's climb and LivingEntity.aiStep's negligible motion
    if (sinksWithSneak && entity.isInWater && entity.control.sneak && !(entity.flying && sinkNeedsFluidEffect)) vel.y -= Math.fround(0.04)
    if (entity.flying) {
      // LocalPlayer.aiStep: jump and sneak climb and descend at three times the flying speed,
      // added before the move so Player.travel damps it with the rest of the vertical velocity.
      const vertical = (entity.control.jump ? 1 : 0) - (entity.control.sneak ? 1 : 0)
      vel.y += vertical * Math.fround(entity.flyingSpeed * 3)
    }

    // Reset velocity component if it falls under the threshold
    // LivingEntity.aiStep stops a negligible motion: each axis under 0.005 on 1.8 and under 0.003 up to 1.21.4; from
    // 1.21.5 a player's horizontal motion as a whole when x² + z² < 9.0E-6, and the vertical under 0.003
    if (horizontalMotionStopsTogether) {
      if (vel.x * vel.x + vel.z * vel.z < 9.0e-6) {
        vel.x = 0
        vel.z = 0
      }
    } else {
      if (Math.abs(vel.x) < negligibleVelocity) vel.x = 0
      if (Math.abs(vel.z) < negligibleVelocity) vel.z = 0
    }
    if (Math.abs(vel.y) < negligibleVelocity) vel.y = 0

    // LocalPlayer.aiStep (1.14+): crouching with the tick before's sneak key, or where standing does not fit but crouching
    // does; never while flying or swimming
    if (posePoses) {
      entity.crouching = !entity.flying && !entity.isSwimming && fitsPose(entity, world, 'crouching') &&
        (!!entity.shiftKeyDown || !fitsPose(entity, world, 'standing'))
    }
    const input = movementInput(entity)
    entity.wasSprinting = entity.isSprinting
    updateSprinting(entity, input.impulse)
    tryToStartFallFlying(entity, world, startVelY)
    entity.wasJumping = entity.control.jump

    // Handle inputs
    // A flying player does not jump: LivingEntity.aiStep gates it on isAffectedByFluids, and
    // the jump key already climbs above.

    if (!entity.flying && (entity.control.jump || entity.jumpQueued)) {
      if (entity.jumpTicks > 0) entity.jumpTicks--
      const jump = liquidJump(entity)
      if (jump === 'fluid') {
        vel.y += Math.fround(0.04) // jumpInLiquid
      } else if (jump === 'ground' && entity.jumpTicks === 0) {
        jumpFromGround(entity, world)
        entity.jumpTicks = physics.autojumpCooldown
      }
    } else {
      entity.jumpTicks = 0 // reset autojump cooldown
    }
    entity.jumpQueued = false

    const { strafe, forward } = input
    // the fall distance ends before travel for a flyer from 1.21.2 (Player.aiStep) and under Slow Falling or Levitation
    // from 1.20 (LivingEntity.aiStep); before, during or after travel (below)
    if ((flightEndsFallBeforeTravel && entity.flying) || (effectsEndFallBeforeTravel && (entity.slowFalling > 0 || entity.levitation > 0))) {
      entity.fallDistance = 0
    }
    entity.forwardImpulse = input.nextImpulse
    entity.shiftKeyDown = entity.control.sneak
    entity.inputStrafe = strafe
    entity.inputForward = forward

    // The server ends a glide (LivingEntity.updateFallFlying), through the entity data the caller applies to
    // elytraFlying; landing does not end it on the client. The client ends it itself only while creative flying up to
    // 1.21.1 (in the glide above) and from 1.21.5 on a climbable block out of fluids (travelFallFlying,
    // stopFallFlying), where that tick moves as in the air.
    const inFluid = !entity.flying && (entity.isInWater || entity.isInLava)
    if (entity.elytraFlying && climbableStopsGliding && !inFluid && isOnLadder(world, entity.pos)) entity.elytraFlying = false

    if (!rocketTicksAfterPlayer) boostByRocket(entity)
    moveEntityWithHeading(entity, world, strafe, forward)
    if (!flightEndsFallBeforeTravel && entity.flying) entity.fallDistance = 0 // up to 1.21.1 Player.travel, after the move
    if (blockEffectsAfterTravel) {
      stepOn(entity, world.getBlock(onPos(entity, world, Math.fround(0.2))))
      const moves = entity.movesThisTick.length ? entity.movesThisTick : [{ from: tickStart, to: pos.clone() }]
      applyInsideBlocksAlongMoves(entity, world, moves)
    }
    // Up to 1.15 the lava state is the moved box's: looked up again (up to 1.13), or the flag the move set (1.14, 1.15)
    if (lavaFlagFromMove) entity.isInLava = isMaterialInBB(world, (entity.box ?? getPlayerBB(pos)).clone().contract(0.001, 0.001, 0.001), lavaIds)
    else if (!lavaByHeight) entity.isInLava = isMaterialInBB(world, getPlayerBB(pos).contract(0.1, 0.4, 0.1), lavaIds)

    if (rocketTicksAfterPlayer) boostByRocket(entity)
    updatePose(entity, world)

    return entity
  }

  return physics
}

function getEffectLevel (mcData, effectName, effects) {
  const effectDescriptor = mcData.effectsByName[effectName]
  if (!effectDescriptor) {
    return 0
  }
  const effectInfo = effects[effectDescriptor.id]
  if (!effectInfo) {
    return 0
  }
  return effectInfo.amplifier + 1
}

// The level of an enchantment on an item: from 1.20.5 in its enchantments component (prismarine-item's componentMap,
// entries { id, level }), before in its NBT (Enchantments, before 1.13 ench)
function itemEnchantmentLevel (mcData, item, enchantmentName) {
  if (!item) return 0
  const component = item.componentMap?.get('enchantments')?.data?.enchantments
  if (component) return getEnchantmentLevel(mcData, enchantmentName, component.map(e => ({ id: e.id, lvl: e.level })))
  if (!item.nbt) return 0
  const simplifiedNbt = nbt.simplify(item.nbt)
  return getEnchantmentLevel(mcData, enchantmentName, simplifiedNbt.Enchantments ?? simplifiedNbt.ench ?? [])
}

function getEnchantmentLevel (mcData, enchantmentName, enchantments) {
  const enchantmentDescriptor = mcData.enchantmentsByName[enchantmentName]
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
    // Prefer the bot's already-resolved registry: it is correct for every edition, whereas re-resolving by bot.version
    // is redundant on Java and picks the wrong edition on Bedrock (its version is a bare id). Fall back to minecraft-data
    // for bare, non-mineflayer callers that construct a PlayerState without a registry.
    const mcData = bot.registry ?? require('minecraft-data')(bot.version)

    // Input / Outputs
    this.pos = bot.entity.position.clone()
    // The box the last tick left, while the entity is still where that box put it (positionFromBox)
    const physicsBox = bot.entity.physicsBox
    this.box = physicsBox && physicsBox.position.equals(this.pos) ? physicsBox.box.clone() : null
    this.vel = bot.entity.velocity.clone()
    this.onGround = bot.entity.onGround
    this.isInWater = bot.entity.isInWater
    this.isInLava = bot.entity.isInLava
    this.lavaHeight = bot.entity.lavaHeight ?? 0
    // Entity.mainSupportingBlockPos and onGroundNoBlocks (1.20+), as the last move left them
    this.supportingBlockPos = bot.entity.supportingBlockPos ?? null
    this.onGroundNoBlocks = bot.entity.onGroundNoBlocks ?? false
    this.isInWeb = bot.entity.isInWeb
    // the multiplier the block the player is stuck in set (a cobweb's when only isInWeb is known)
    this.stuckSpeedMultiplier = bot.entity.stuckSpeedMultiplier ?? null
    this.isCollidedHorizontally = bot.entity.isCollidedHorizontally
    this.minorHorizontalCollision = bot.entity.minorHorizontalCollision ?? false
    this.isCollidedVertically = bot.entity.isCollidedVertically
    this.isSprinting = bot.entity.isSprinting ?? false
    // the sneak key as the tick before left it (Entity.isShiftKeyDown)
    this.shiftKeyDown = bot.entity.shiftKeyDown ?? false
    // the jump key as the tick before left it
    this.wasJumping = bot.entity.wasJumping ?? false
    this.fallFlyingRequested = false
    this.usingItem = bot.usingHeldItem ?? false
    // the sprint logic's state as the tick before left it, and what it reads
    this.sprintTriggerTime = bot.entity.sprintTriggerTime ?? 0
    this.forwardImpulse = bot.entity.forwardImpulse ?? 0
    this.isUnderWater = bot.entity.isUnderWater ?? false
    // whether the eyes were in water as the last tick found them (1.13+)
    this.eyeInWater = bot.entity.eyeInWater ?? this.isUnderWater
    // whether the player swims (1.13+, Entity.isSwimming), as the last tick left it
    this.isSwimming = bot.entity.isSwimming ?? false
    // the pose (standing, crouching, swimming, fall_flying, spin_attack) as the last tick left it; from 1.9 it sizes the box
    this.pose = bot.entity.pose ?? 'standing'
    this.food = bot.food ?? 20
    this.mayFly = bot.abilities?.mayFly ?? false
    this.elytraFlying = bot.entity.elytraFlying
    this.isInPowderSnow = bot.entity.isInPowderSnow ?? false
    // Entity.fallDistance, which the client keeps itself
    this.fallDistance = bot.entity.fallDistance ?? 0
    this.jumpTicks = bot.jumpTicks
    this.jumpQueued = bot.jumpQueued
    this.fireworkRocketDuration = bot.fireworkRocketDuration

    // Input only (not modified)
    // The server owns these: it grants flight in the abilities packet and the client obeys.
    this.flying = bot.entity.flying ?? false
    this.flyingSpeed = bot.entity.flyingSpeed ?? 0.05
    this.attributes = bot.entity.attributes
    this.yaw = bot.entity.yaw
    // the client's yRot in degrees, not wrapped, when the caller keeps it (read only)
    this.yRot = bot.entity.yRot
    this.pitch = bot.entity.pitch
    this.control = control

    // effects
    const effects = bot.entity.effects

    this.jumpBoost = getEffectLevel(mcData, 'JumpBoost', effects)
    this.speed = getEffectLevel(mcData, 'Speed', effects)
    this.slowness = getEffectLevel(mcData, 'Slowness', effects)
    this.blindness = getEffectLevel(mcData, 'Blindness', effects)
    this.weaving = getEffectLevel(mcData, 'Weaving', effects)

    this.dolphinsGrace = getEffectLevel(mcData, 'DolphinsGrace', effects)
    this.slowFalling = getEffectLevel(mcData, 'SlowFalling', effects)
    this.levitation = getEffectLevel(mcData, 'Levitation', effects)

    // armour enchantments
    const boots = bot.inventory.slots[8]
    this.depthStrider = itemEnchantmentLevel(mcData, boots, 'depth_strider')
    // PowderSnowBlock.canEntityWalkOnPowderSnow
    this.leatherBoots = boots?.name === 'leather_boots'
    this.soulSpeed = itemEnchantmentLevel(mcData, boots, 'soul_speed')

    // Swift Sneak on the leggings (1.19 and 1.20)
    const leggings = bot.inventory.slots[7]
    this.swiftSneak = itemEnchantmentLevel(mcData, leggings, 'swift_sneak')

    // An elytra on the chest that is not one use from breaking (ElytraItem.isFlyEnabled; from 1.21.3
    // LivingEntity.canGlideUsing, !nextDamageWillBreak)
    const item = bot.inventory.slots[6]
    this.elytraEquipped = item != null && item.name === 'elytra' &&
      !(item.maxDurability > 0 && item.durabilityUsed >= item.maxDurability - 1)
  }

  apply (bot) {
    bot.entity.position = this.pos
    bot.entity.physicsBox = this.box ? { box: this.box, position: this.pos.clone() } : undefined
    bot.entity.velocity = this.vel
    bot.entity.onGround = this.onGround
    bot.entity.isInWater = this.isInWater
    bot.entity.isInLava = this.isInLava
    bot.entity.lavaHeight = this.lavaHeight
    bot.entity.isUnderWater = this.isUnderWater
    bot.entity.eyeInWater = this.eyeInWater
    bot.entity.isSwimming = this.isSwimming
    bot.entity.pose = this.pose
    bot.entity.supportingBlockPos = this.supportingBlockPos
    bot.entity.onGroundNoBlocks = this.onGroundNoBlocks
    bot.entity.isInWeb = this.isInWeb
    bot.entity.stuckSpeedMultiplier = this.stuckSpeedMultiplier
    bot.entity.isCollidedHorizontally = this.isCollidedHorizontally
    bot.entity.minorHorizontalCollision = this.minorHorizontalCollision
    bot.entity.isCollidedVertically = this.isCollidedVertically
    bot.entity.isSprinting = this.isSprinting
    bot.entity.shiftKeyDown = this.shiftKeyDown
    bot.entity.wasJumping = this.wasJumping
    bot.entity.sprintTriggerTime = this.sprintTriggerTime
    bot.entity.forwardImpulse = this.forwardImpulse
    bot.entity.elytraFlying = this.elytraFlying
    bot.entity.isInPowderSnow = this.isInPowderSnow
    bot.entity.fallDistance = this.fallDistance
    bot.jumpTicks = this.jumpTicks
    bot.jumpQueued = this.jumpQueued
    bot.fireworkRocketDuration = this.fireworkRocketDuration
  }
}

module.exports = { Physics, PlayerState }
