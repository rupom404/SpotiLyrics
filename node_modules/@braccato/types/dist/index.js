// The lyric data shapes, in the one place both halves of braccato can agree on them.
//
// `@braccato/parsers` produces these and `@braccato/core` renders them, so a field added on one side
// and not the other is a silent mismatch across a package boundary. They were declared twice before
// this package existed, and they had already drifted: the renderer's copy carried `translations` and
// `explicit`, the parsers' copy did not.
//
// Nothing here emits runtime code. `@braccato/core` ships no runtime dependencies, and a type-only
// import is erased at compile time, so depending on this package costs a consumer's bundle nothing.
export {};
//# sourceMappingURL=index.js.map