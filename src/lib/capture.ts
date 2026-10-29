// Bridge that lets DOM code request a PNG snapshot of the WebGL canvas (set by the 3D scene).
export const captureRef: { current: (() => Promise<string>) | null } = { current: null };
