// Single-destination configurations remain readable after upgrading.
export function deliveryDestinations(config) {
  if (Array.isArray(config?.destinations)) return config.destinations;
  return config?.botId && config?.targetId ? [{ botId: config.botId, targetId: config.targetId, enabled: true }] : [];
}
export function activeDestinations(config) {
  return config?.enabled ? deliveryDestinations(config).filter(item => item.enabled !== false) : [];
}
