// Tiny shared state between the 3D salon and the page around it (kept out of the three.js bundle).

/** Set while the customer drags a bottle to turn it, so the page does not treat it as a swipe. */
export const turningBottle = { current: false };
