const MIN_WIDTH = 600;
const MIN_HEIGHT = 430;
const DEFAULT_WIDTH = 940;
const DEFAULT_HEIGHT = 700;
const MAX_WIDTH = 1100;
const MAX_HEIGHT = 800;

function validBounds(bounds) {
  return Boolean(bounds)
    && ["x", "y", "width", "height"].every((key) => Number.isFinite(bounds[key]))
    && bounds.width >= MIN_WIDTH && bounds.width <= MAX_WIDTH
    && bounds.height >= MIN_HEIGHT && bounds.height <= MAX_HEIGHT;
}

function centeredBounds(size, workArea) {
  const width = Math.min(Math.max(MIN_WIDTH, size.width || DEFAULT_WIDTH), MAX_WIDTH, Math.max(MIN_WIDTH, workArea.width - 48));
  const height = Math.min(Math.max(MIN_HEIGHT, size.height || DEFAULT_HEIGHT), MAX_HEIGHT, Math.max(MIN_HEIGHT, workArea.height - 64));
  return { x: Math.round(workArea.x + (workArea.width - width) / 2), y: Math.round(workArea.y + (workArea.height - height) / 2), width, height };
}

function boundsForDisplay({ saved, fallback, workArea }) {
  const size = validBounds(saved) ? saved : validBounds(fallback) ? fallback : {};
  return centeredBounds(size, workArea);
}

// Windows converts a setBounds call using the scale factor of the display the window is still on.
// Moving between monitors with different DPI therefore lands the window at the wrong size until the
// bounds are applied again, so callers re-apply until the real bounds match what was asked for.
function boundsMatch(actual, target, tolerance = 2) {
  return Boolean(actual) && Boolean(target) && ["x", "y", "width", "height"].every((key) => Math.abs(actual[key] - target[key]) <= tolerance);
}

module.exports = { MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT, MAX_WIDTH, MAX_HEIGHT, validBounds, boundsForDisplay, boundsMatch };
