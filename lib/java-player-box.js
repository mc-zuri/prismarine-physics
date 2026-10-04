const AABB = require('./aabb')

const POSE_HEIGHT = { standing: Math.fround(1.8), crouching: Math.fround(1.5), swimming: Math.fround(0.6), fall_flying: Math.fround(0.6), spin_attack: Math.fround(0.6) }

// Entity.refreshDimensions in 1.14-1.16.5 keeps the lower corner when the width
// does not shrink, even when only the height changes. Recentring loses an ulp.
function setPose (entity, pose, preserveCorner, force = false) {
  if (!force && pose === entity.pose) return
  if (preserveCorner) {
    const { x, y, z } = entity.pos
    const width = Math.fround(0.6)
    const kept = entity.javaBox
    const current = kept && (!kept.at || (kept.at[0] === x && kept.at[1] === y && kept.at[2] === z))
    const minX = current ? kept.minX : x - width / 2
    const minY = current ? kept.minY : y
    const minZ = current ? kept.minZ : z - width / 2
    const box = new AABB(minX, minY, minZ, minX + width, minY + (POSE_HEIGHT[pose] || POSE_HEIGHT.standing), minZ + width)
    box.at = [x, y, z]
    entity.javaBox = box
  } else {
    entity.javaBox = null
  }
  entity.pose = pose
}

module.exports = { POSE_HEIGHT, setPose }
