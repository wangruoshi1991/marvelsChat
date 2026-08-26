export function projectAgentCard(manifest, runtimeStatus) {
  return {
    schemaVersion: "0.2",
    agentKey: manifest.key,
    agentVersion: manifest.version,
    displayName: manifest.name,
    shortDescription: manifest.catalog.shortDescription,
    capabilities: manifest.catalog.capabilities,
    entrypoints: manifest.entrypoints,
    whenToUse: manifest.catalog.whenToUse,
    whenNotToUse: manifest.catalog.whenNotToUse,
    limitations: manifest.limitations,
    interaction: {
      runMode: manifest.execution.mode,
      progress: manifest.catalog.interaction.progress,
      requiresConfirmation: manifest.catalog.interaction.requiresConfirmation,
      cancellable: manifest.execution.cancellable,
      resumable: manifest.execution.resumable,
    },
    artifactSupport: [],
    minimumAppBuild: manifest.compatibility.minimumAppBuild,
    availability: runtimeStatus.publicAvailability,
    updatedAt: runtimeStatus.evaluatedAt,
  };
}
