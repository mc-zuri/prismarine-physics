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
      dy *= 0.05
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

    // Up to 1.16 the box carries the player from tick to tick and the position is read from it
    let playerBB = positionFromBox && entity.box ? entity.box.clone() : getPlayerBB(pos)
    const queryBB = playerBB.clone().extend(dx, dy, dz)
    const surroundingBBs = getSurroundingBBs(world, queryBB)
    const oldBB = playerBB.clone()

    for (const blockBB of surroundingBBs) {
      dy = blockBB.computeOffsetY(playerBB, dy)
    }
    playerBB.offset(0, dy, 0)

    for (const blockBB of surroundingBBs) {
      dx = blockBB.computeOffsetX(playerBB, dx)
    }
    playerBB.offset(dx, 0, 0)

    for (const blockBB of surroundingBBs) {
      dz = blockBB.computeOffsetZ(playerBB, dz)
    }
    playerBB.offset(0, 0, dz)

    // Step on block if height < stepHeight. The move then goes up by stepUp, across, and down by dy.
    let stepUp = 0
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
      const BB_XZ = BB1.clone().extend(oldVelX, 0, oldVelZ)

      let dy1 = dy
      let dy2 = dy
      for (const blockBB of surroundingBBs) {
        dy1 = blockBB.computeOffsetY(BB_XZ, dy1)
        dy2 = blockBB.computeOffsetY(BB2, dy2)
      }
      BB1.offset(0, dy1, 0)
      BB2.offset(0, dy2, 0)

      let dx1 = oldVelX
      let dx2 = oldVelX
      for (const blockBB of surroundingBBs) {
        dx1 = blockBB.computeOffsetX(BB1, dx1)
        dx2 = blockBB.computeOffsetX(BB2, dx2)
      }
      BB1.offset(dx1, 0, 0)
      BB2.offset(dx2, 0, 0)

      let dz1 = oldVelZ
      let dz2 = oldVelZ
      for (const blockBB of surroundingBBs) {
        dz1 = blockBB.computeOffsetZ(BB1, dz1)
        dz2 = blockBB.computeOffsetZ(BB2, dz2)
      }
      BB1.offset(0, 0, dz1)
      BB2.offset(0, 0, dz2)

      const norm1 = dx1 * dx1 + dz1 * dz1
      const norm2 = dx2 * dx2 + dz2 * dz2

      if (norm1 > norm2) {
        dx = dx1
        dy = -dy1
        dz = dz1
        stepUp = dy1
        playerBB = BB1
      } else {
        dx = dx2
        dy = -dy2
        dz = dz2
        stepUp = dy2
        playerBB = BB2
      }

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
        pos.x += dx
        pos.y += movedY
        pos.z += dz
      }
    } else if (positionFromBox) {
      entity.box = oldBB.clone()
    }

    // Update flags
    entity.isCollidedHorizontally = dx !== oldVelX || dz !== oldVelZ
    entity.minorHorizontalCollision = entity.isCollidedHorizontally && isHorizontalCollisionMinor(entity, dx, dz)
    entity.isCollidedVertically = dy !== oldVelY
    entity.onGround = entity.isCollidedVertically && oldVelY < 0

    const blockAtFeet = world.getBlock(pos.offset(0, -0.2, 0))

    if (dx !== oldVelX) vel.x = 0
    if (dz !== oldVelZ) vel.z = 0
    if (dy !== oldVelY) {
      if (blockAtFeet && blockAtFeet.type === slimeBlockId && !entity.control.sneak) {
        vel.y = -vel.y
      } else {
        vel.y = 0
      }
    }

    // Finally, apply block collisions (web, soulsand...)
    playerBB.contract(0.001, 0.001, 0.001)
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
    // From 1.15 Entity.move ends by scaling the horizontal motion by the block speed factor
    if (blockSpeedFactorFeature) {
      const factor = blockSpeedFactor(entity, world)
      if (factor !== 1) {
        vel.x *= factor
        vel.z *= factor
      }
    }
  }

  // Entity.getBlockSpeedFactor (1.15+): the feet block's speed factor, or when that is 1 (and the feet are not in water
  // or a bubble column) the one of the block below that affects movement; soul sand and honey 0.4F. On 1.16 to 1.20
  // LivingEntity ignores it on soul sand or soul soil with Soul Speed; from 1.21 it lerps it towards 1 by the
  // movement_efficiency attribute (Mth.lerp, floats).
  function blockSpeedFactor (entity, world) {
    const pos = entity.pos
    const factorOf = block => block && (block.type === soulsandId || block.type === honeyblockId) ? Math.fround(0.4) : 1
    const feet = world.getBlock(pos.floored())
    const below = world.getBlock(blockPosBelowAffectingMovement(pos))
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

  // Entity.getBlockPosBelowThatAffectsMyMovement: the block under the box's bottom by 0.5000001 (1.15 to 1.19), by
  // (double)0.500001F under the position from 1.20 (getOnPos; the supporting block is not tracked)
  function blockPosBelowAffectingMovement (pos) {
    const depth = onPosBelow ? Math.fround(0.500001) : 0.5000001
    return new Vec3(Math.floor(pos.x), Math.floor(pos.y - depth), Math.floor(pos.z))
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

  // The single input-to-world transform LocalPlayer uses: a (strafe, forward) impulse becomes a world direction under the
  // entity's yaw. applyHeading and isHorizontalCollisionMinor MUST share it so their conventions cannot drift (the strafe
  // sign in particular): x = -(strafe*cos + forward*sin), z = forward*cos - strafe*sin.
  // The sin and cos are Mth.sin and Mth.cos of the float yRot in radians, read from the sine table (lib/math.js).
  // yRot is recovered as degrees(PI - yaw), the value mineflayer sends. The table entry depends on the unwrapped
  // angle, so a yaw normalized to [0, 2PI) matches a client only while its yRot is within (-180, 180].
  // Mth.sin and Mth.cos of the float yRot in radians: yRot * 0.017453292F, or with `piOver180` yRot * 3.1415927F / 180.0F
  function yawSinCos (yaw, piOver180) {
    const yRot = Math.fround((Math.PI - yaw) * 180 / Math.PI)
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
  function glide (entity, gravityMultiplier) {
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
    else vel.y += physics.gravity * gravityMultiplier * (-1.0 + c * 0.75)
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
    const yRot = f((Math.PI - entity.yaw) * 180 / Math.PI)
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
      const { sin, cos } = yawSinCos(entity.yaw, false)
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
    return factorOf(world.getBlock(new Vec3(entity.pos.x, entity.pos.y - 0.5000001, entity.pos.z).floored()))
  }

  // `round` rounds each operation, Math.fround where vanilla computes it in float (moveRelative before 1.14).
  function inputToWorld (strafe, forward, yaw, round = x => x) {
    const { sin, cos } = yawSinCos(yaw, headingAnglePiOver180)
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
      dir = inputToWorld(Math.fround(strafe * f), Math.fround(forward * f), entity.yaw, Math.fround)
    } else {
      const lengthSqr = strafe * strafe + forward * forward
      if (lengthSqr < 1.0e-7) return
      if (lengthSqr > 1) {
        const length = floatLengthNormalize ? Math.fround(Math.sqrt(lengthSqr)) : Math.sqrt(lengthSqr)
        strafe /= length
        forward /= length
      }
      dir = inputToWorld(strafe * speed, forward * speed, entity.yaw)
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
  // gliding by version
  const glideLiftIsConstant = mcData.version['<']('1.13')
  const climbableStopsGliding = mcData.version['>=']('1.21.5')
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

  function doesNotCollide (world, pos) {
    const pBB = getPlayerBB(pos)
    return !getSurroundingBBs(world, pBB).some(x => pBB.intersects(x)) && getWaterInBB(world, pBB).length === 0
  }

  // LocalPlayer.isHorizontalCollisionMinor: a collision counts as minor when the move that survived it still
  // points within 8 degrees of where the inputs wanted to go (brushing a wall), which keeps the sprint
  function isHorizontalCollisionMinor (entity, dx, dz) {
    // Use the same input-to-world transform as applyHeading so the desired direction matches where the move actually went
    // (an earlier local copy flipped the strafe sign, so diagonal input was compared against the wrong direction).
    const want = inputToWorld(entity.inputStrafe, entity.inputForward, entity.yaw)
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
      if (noImpulse || !enoughFood || collided || (sprintWaterRules && shallowWater)) entity.isSprinting = false
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
    if (sneakSlowsWithKeyOrPose) return (entity.control.sneak || (entity.shiftKeyDown && !flying)) && !(undone && entity.control.sneak)
    return entity.shiftKeyDown && !flying
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

    const gravityMultiplier = (vel.y <= 0 && entity.slowFalling > 0) ? physics.slowFalling : 1

    // Player.isAffectedByFluids is false while flying, so a flying player in water or lava takes
    // the flight movement below rather than the fluid one.
    if (!entity.flying && (entity.isInWater || entity.isInLava)) {
      // Water / Lava movement
      const lastY = pos.y
      const { drag, acceleration } = entity.isInWater
        ? waterDragAndAcceleration(entity)
        : { drag: physics.lavaInertia, acceleration: Math.fround(0.02) }

      const isFalling = vel.y <= 0
      applyHeading(entity, strafe, forward, acceleration)
      moveEntity(entity, world, vel.x, vel.y, vel.z)
      // from 1.14 a ladder or vine climbed against a wall in water lifts at 0.2
      if (entity.isInWater && waterClimbs && entity.isCollidedHorizontally && isOnLadder(world, pos)) vel.y = 0.2
      if (fluidHeightFromFeet) {
        // LivingEntity.travelInWater / travelInLava (1.13+)
        const gravity = physics.gravity * gravityMultiplier
        if (!entity.isInWater) {
          // Entity.move refreshes the fluid state after moving when not in water
          // (LivingEntity.checkFallDamage), so the lava regime below sees the moved box
          entity.lavaHeight = scanFluid(world, getPlayerBB(pos).contract(0.001, 0.001, 0.001), (block) => block && lavaIds.includes(block.type)).height
        }
        // getFluidFallingAdjustedMovement: sink by gravity / 16, except the narrow band the game clamps to -0.003 so a
        // floating player does not creep down; a sprinting player does not sink. 1.13 reads "falling" after the drag.
        const fallingAdjusted = (y, falling) => entity.isSprinting
          ? y
          : (falling && Math.abs(y - 0.005) >= 0.003 && Math.abs(y - gravity / 16) < 0.003) ? -0.003 : y - gravity / 16
        if (entity.isInWater) {
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
        vel.y *= entity.isInWater ? Math.fround(0.8) : physics.lavaInertia
        vel.y -= (entity.isInWater ? physics.waterGravity : physics.lavaGravity) * gravityMultiplier
        vel.x *= drag
        vel.z *= drag
      }

      // jump out of the fluid at its edge, if 0.6F higher is free (LivingEntity.travel, isFree)
      if (entity.isCollidedHorizontally && doesNotCollide(world, pos.offset(vel.x, vel.y + Math.fround(0.6) - pos.y + lastY, vel.z))) {
        vel.y = physics.outOfLiquidImpulse // jump out of liquid
      }
    } else if (entity.elytraFlying) {
      const flightEntryVelY = vel.y
      glide(entity, gravityMultiplier)
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
      const blockUnder = world.getBlock(pos.offset(0, -1, 0))
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
        const limit = Math.fround(0.15)
        vel.x = math.clamp(-limit, vel.x, limit)
        vel.z = math.clamp(-limit, vel.z, limit)
        vel.y = Math.max(vel.y, climbLimitIsFloat ? -limit : -0.15)
        const onScaffolding = climbLimitIsFloat && scaffoldingId !== -1 && world.getBlock(pos)?.type === scaffoldingId
        if (vel.y < 0 && entity.control.sneak && !onScaffolding) vel.y = 0
      }

      moveEntity(entity, world, vel.x, vel.y, vel.z)

      if (!entity.flying && isOnLadder(world, pos) && (entity.isCollidedHorizontally ||
        (supportFeature('climbUsingJump') && entity.control.jump))) {
        vel.y = physics.ladderClimbSpeed // climb ladder
      }

      // Apply friction and gravity
      if (entity.flying) {
        vel.y = flightEntryVelY * 0.6
      } else {
        if (entity.levitation > 0) {
          vel.y += (0.05 * entity.levitation - vel.y) * 0.2
        } else {
          vel.y -= physics.gravity * gravityMultiplier
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

  // Since 1.13 (Entity.updateFluidHeightAndDoFluidPushing) a fluid counts as soon as its surface
  // is above the bottom of the box deflated by 0.001; before that (handleMaterialAcceleration)
  // the box was shrunk by 0.4 at the top and compared through ceil(maxY).
  const fluidHeightFromFeet = supportFeature('fluidHeightFromFeet')
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

  function isInWaterApplyCurrent (world, bb, vel, pushed) {
    const acceleration = new Vec3(0, 0, 0)
    const waterBlocks = getWaterInBB(world, bb)
    const isInWater = waterBlocks.length > 0
    if (!pushed) return isInWater
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

    // Player.isPushedByFluid is false while flying, so currents leave a flying player alone.
    if (fluidHeightFromFeet) {
      const fluidBB = getPlayerBB(pos).contract(0.001, 0.001, 0.001)
      entity.isInWater = isInWaterApplyCurrent(world, fluidBB, vel, !entity.flying)
      const lava = scanFluid(world, fluidBB, (block) => block && lavaIds.includes(block.type))
      entity.isInLava = lava.blocks.length > 0
      entity.lavaHeight = lava.height
    } else {
      const waterBB = getPlayerBB(pos).contract(0.001, 0.401, 0.001)
      const lavaBB = getPlayerBB(pos).contract(0.1, 0.4, 0.1)
      entity.isInWater = isInWaterApplyCurrent(world, waterBB, vel, !entity.flying)
      entity.isInLava = isMaterialInBB(world, lavaBB, lavaIds)
    }

    const startVelY = vel.y
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
      if (entity.isInWater || entity.isInLava) {
        vel.y += 0.04
      } else if (entity.onGround && entity.jumpTicks === 0) {
        jumpFromGround(entity, world)
        entity.jumpTicks = physics.autojumpCooldown
      }
    } else {
      entity.jumpTicks = 0 // reset autojump cooldown
    }
    entity.jumpQueued = false

    const { strafe, forward } = input
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
    this.isInWeb = bot.entity.isInWeb
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
    this.food = bot.food ?? 20
    this.mayFly = bot.abilities?.mayFly ?? false
    this.elytraFlying = bot.entity.elytraFlying
    this.jumpTicks = bot.jumpTicks
    this.jumpQueued = bot.jumpQueued
    this.fireworkRocketDuration = bot.fireworkRocketDuration

    // Input only (not modified)
    // The server owns these: it grants flight in the abilities packet and the client obeys.
    this.flying = bot.entity.flying ?? false
    this.flyingSpeed = bot.entity.flyingSpeed ?? 0.05
    this.attributes = bot.entity.attributes
    this.yaw = bot.entity.yaw
    this.pitch = bot.entity.pitch
    this.control = control

    // effects
    const effects = bot.entity.effects

    this.jumpBoost = getEffectLevel(mcData, 'JumpBoost', effects)
    this.speed = getEffectLevel(mcData, 'Speed', effects)
    this.slowness = getEffectLevel(mcData, 'Slowness', effects)
    this.blindness = getEffectLevel(mcData, 'Blindness', effects)

    this.dolphinsGrace = getEffectLevel(mcData, 'DolphinsGrace', effects)
    this.slowFalling = getEffectLevel(mcData, 'SlowFalling', effects)
    this.levitation = getEffectLevel(mcData, 'Levitation', effects)

    // armour enchantments
    const boots = bot.inventory.slots[8]
    this.depthStrider = itemEnchantmentLevel(mcData, boots, 'depth_strider')
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
    bot.entity.isInWeb = this.isInWeb
    bot.entity.isCollidedHorizontally = this.isCollidedHorizontally
    bot.entity.minorHorizontalCollision = this.minorHorizontalCollision
    bot.entity.isCollidedVertically = this.isCollidedVertically
    bot.entity.isSprinting = this.isSprinting
    bot.entity.shiftKeyDown = this.shiftKeyDown
    bot.entity.wasJumping = this.wasJumping
    bot.entity.sprintTriggerTime = this.sprintTriggerTime
    bot.entity.forwardImpulse = this.forwardImpulse
    bot.entity.elytraFlying = this.elytraFlying
    bot.jumpTicks = this.jumpTicks
    bot.jumpQueued = this.jumpQueued
    bot.fireworkRocketDuration = this.fireworkRocketDuration
  }
}

module.exports = { Physics, PlayerState }
