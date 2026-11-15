function mapPoint(e, bounds) {
  if (
    !bounds ||
    !Number.isFinite(e.x) ||
    !Number.isFinite(e.y) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  const x = ((e.x - bounds.x) * 1920) / bounds.width,
    y = ((e.y - bounds.y) * 1080) / bounds.height;
  return x >= 0 && x < 1920 && y >= 0 && y < 1080 ? { x, y } : null;
}
module.exports = { mapPoint };
