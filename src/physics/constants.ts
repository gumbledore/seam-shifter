/**
 * Units: feet, seconds, radians internally. Statcast coordinate frame:
 * origin at the back tip of home plate, +x = catcher's right (1B side),
 * +y = toward the pitcher, +z = up. The pitch travels in -y.
 */
export const G = 32.174; // ft/s^2
export const BALL_RADIUS = 9.125 / (2 * Math.PI) / 12; // ft, from 9.125 in circumference
export const BALL_MASS_OZ = 5.125;
/** rho*A/(2m) for a standard ball at sea level, ft^-1 (Nathan). Multiplies Cd*v^2. */
export const C0 = 5.316e-3;
export const RUBBER_Y = 60.5; // ft, pitching rubber to plate tip
export const PLATE_Y = 17 / 12; // ft, front edge of plate where plate_x/plate_z are measured
export const MPH_TO_FPS = 5280 / 3600;
export const RPM_TO_RADS = (2 * Math.PI) / 60;
