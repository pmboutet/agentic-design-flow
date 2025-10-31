/**
 * Challenge Builder API Route
 * 
 * This route uses the V2 optimized implementation for backward compatibility.
 * The component calls /challenge-builder but V2 implementation is at /challenge-builder-v2.
 * This file re-exports the V2 handler to maintain compatibility.
 */

export { POST } from "../challenge-builder-v2/route";

