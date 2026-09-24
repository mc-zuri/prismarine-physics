// standard lints the JavaScript; this lints the TypeScript (the Bedrock engine and its tests) with the same style.
import neostandard from 'neostandard'

export default [
  ...neostandard({ ts: true, files: [], filesTs: ['**/*.ts'], ignores: ['node_modules/**'] })
]
