// Stands in for three's meshopt decoder in the YouTube build (vite.config.ts): the decoder runs on WebAssembly,
// which YouTube may decline to certify, so that build ships its models unpacked (scripts/build-youtube.mjs) and
// needs no decoder. A model left compressed fails to load loudly ("setMeshoptDecoder must be called").
export const MeshoptDecoder = null;
