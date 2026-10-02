'use strict'

// Classic uses one u8 packet ID and fixed-size fields throughout the connection.
// Keep its 64-byte string fields as bytes: decoding text must not discard padding
// or replace characters before a byte-exact serialization check.
function classicCodecOptions (data) {
  if (data.version.minecraftVersion !== '0.30c' || data.version.version !== 7 ||
      !data.protocol.toServer?.types?.packet || !data.protocol.toClient?.types?.packet) {
    throw new Error('expected the exact Classic 0.30c protocol-7 schema')
  }
  return {
    state: 'classic',
    customPackets: {
      [data.version.majorVersion]: {
        types: {
          string: ['buffer', { count: 64 }],
          byte_array: ['buffer', { count: 1024 }]
        },
        classic: { toServer: data.protocol.toServer, toClient: data.protocol.toClient }
      }
    }
  }
}

module.exports = { classicCodecOptions }
